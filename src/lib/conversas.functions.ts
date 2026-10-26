import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { calcularJanela, resumoMensagem, type Canal, type Janela } from "@/lib/conversas-meta";
import {
  BUCKET_MIDIA,
  canaisConfigurados,
  enviarPeloCanal,
  subirMidia,
  type Envio,
} from "@/lib/conversas-meta.server";

// Caixa de entrada do CRM (/crm/conversas). Mesmo desenho de crm.functions.ts: tabelas
// conv_* com RLS e nenhuma policy, service role só depois do assertAdmin.

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export interface ConversaItem {
  id: string;
  canal: Canal;
  status: "aberta" | "fechada";
  nao_lidas: number;
  automacao_pausada: boolean;
  ultima_mensagem_em: string | null;
  ultima_mensagem_resumo: string | null;
  ultima_entrada_em: string | null;
  contato: { id: string; nome: string; instagram: string | null; telefone: string | null };
}

// jsonb de conv_mensagens.dados. Tipado como JSON (e não unknown) porque a server function
// só devolve o que dá pra serializar.
export type Json = string | number | boolean | null | Json[] | { [chave: string]: Json };

export interface MensagemItem {
  id: string;
  direcao: "entrada" | "saida" | "interna";
  tipo: string;
  texto: string | null;
  midia_url: string | null;
  midia_mime: string | null;
  midia_nome: string | null;
  dados: Record<string, Json>;
  status: string;
  erro: string | null;
  criado_em: string;
}

const CAMPOS_CONVERSA =
  "id, canal, status, nao_lidas, automacao_pausada, ultima_mensagem_em, ultima_mensagem_resumo, ultima_entrada_em, contato:crm_contatos(id, nome, instagram, telefone)";

export const statusCanais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return canaisConfigurados();
  });

export const listarConversas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        status: z.enum(["aberta", "fechada"]).default("aberta"),
        canal: z.enum(["instagram", "whatsapp"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    let q = supabaseAdmin
      .from("conv_conversas")
      .select(CAMPOS_CONVERSA)
      .eq("status", data.status)
      .order("ultima_mensagem_em", { ascending: false, nullsFirst: false })
      .limit(300);
    if (data.canal) q = q.eq("canal", data.canal);

    const { data: linhas, error } = await q;
    if (error) throw new Error("Falha ao listar conversas.");
    return { conversas: (linhas ?? []) as unknown as ConversaItem[] };
  });

export const conversasDoContato = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ contatoId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: linhas } = await supabaseAdmin
      .from("conv_conversas")
      .select("id, canal, ultima_mensagem_em")
      .eq("contato_id", data.contatoId);
    return {
      conversas: (linhas ?? []) as {
        id: string;
        canal: Canal;
        ultima_mensagem_em: string | null;
      }[],
    };
  });

async function urlsAssinadas(paths: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (paths.length === 0) return mapa;
  const { data } = await supabaseAdmin.storage.from(BUCKET_MIDIA).createSignedUrls(paths, 3600);
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) mapa.set(item.path, item.signedUrl);
  }
  return mapa;
}

export const obterConversa = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const [conversaRes, mensagensRes] = await Promise.all([
      supabaseAdmin.from("conv_conversas").select(CAMPOS_CONVERSA).eq("id", data.id).maybeSingle(),
      supabaseAdmin
        .from("conv_mensagens")
        .select(
          "id, direcao, tipo, texto, midia_path, midia_mime, midia_nome, dados, status, erro, criado_em",
        )
        .eq("conversa_id", data.id)
        .order("criado_em", { ascending: false })
        .limit(300),
    ]);
    if (!conversaRes.data) throw new Error("Conversa não encontrada.");

    const brutas = (
      (mensagensRes.data ?? []) as (Omit<MensagemItem, "midia_url"> & {
        midia_path: string | null;
      })[]
    ).reverse();
    const urls = await urlsAssinadas(
      brutas.map((m) => m.midia_path).filter((p): p is string => Boolean(p)),
    );
    const mensagens: MensagemItem[] = brutas.map(({ midia_path, ...m }) => ({
      ...m,
      midia_url: midia_path ? (urls.get(midia_path) ?? null) : null,
    }));

    const conversa = conversaRes.data as unknown as ConversaItem;
    const janela: Janela = calcularJanela(conversa.ultima_entrada_em);
    return { conversa, mensagens, janela, comentario: comentarioRespondivel(mensagens) };
  });

// Sem janela de Direct aberta, a única forma de responder quem só comentou é a resposta
// privada ao comentário: uma por comentário, até 7 dias depois dele.
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

function comentarioRespondivel(
  mensagens: Pick<MensagemItem, "direcao" | "tipo" | "texto" | "dados" | "criado_em">[],
): { commentId: string; texto: string | null } | null {
  const ultima = [...mensagens].reverse().find((m) => m.direcao === "entrada");
  if (!ultima || ultima.tipo !== "comentario") return null;
  if (Date.now() - new Date(ultima.criado_em).getTime() > SETE_DIAS_MS) return null;
  const commentId = ultima.dados.comment_id;
  if (typeof commentId !== "string") return null;
  const jaRespondido = mensagens.some(
    (m) => m.direcao === "saida" && m.dados.responde_comentario === commentId,
  );
  return jaRespondido ? null : { commentId, texto: ultima.texto };
}

export const marcarConversaLida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    await supabaseAdmin.from("conv_conversas").update({ nao_lidas: 0 }).eq("id", data.id);
    return { ok: true };
  });

export const alterarConversa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["aberta", "fechada"]).optional(),
        automacao_pausada: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (data.status) patch.status = data.status;
    if (data.automacao_pausada !== undefined) patch.automacao_pausada = data.automacao_pausada;
    const { error } = await supabaseAdmin.from("conv_conversas").update(patch).eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar a conversa.");
    return { ok: true };
  });

interface Destino {
  conversaId: string;
  canal: Canal;
  externoId: string;
  contatoId: string;
  janela: Janela;
}

async function destinoDaConversa(conversaId: string): Promise<Destino> {
  const { data } = await supabaseAdmin
    .from("conv_conversas")
    .select("id, canal, ultima_entrada_em, contato:crm_contatos(id, ig_id, wa_id)")
    .eq("id", conversaId)
    .maybeSingle();
  if (!data) throw new Error("Conversa não encontrada.");
  const linha = data as unknown as {
    canal: Canal;
    ultima_entrada_em: string | null;
    contato: { id: string; ig_id: string | null; wa_id: string | null };
  };
  const externoId = linha.canal === "instagram" ? linha.contato.ig_id : linha.contato.wa_id;
  if (!externoId) throw new Error("Esse contato não tem ID no canal.");
  return {
    conversaId,
    canal: linha.canal,
    externoId,
    contatoId: linha.contato.id,
    janela: calcularJanela(linha.ultima_entrada_em),
  };
}

const MSG_JANELA_FECHADA = {
  instagram:
    "A janela de 24h fechou. O Instagram só libera responder depois que a pessoa mandar mensagem de novo.",
  whatsapp:
    "A janela de 24h fechou. No WhatsApp, fora dela, só sai modelo aprovado pela Meta (chega na fase 3).",
};

// Grava a mensagem que saiu. O eco da Meta pode chegar antes desta linha: nesse caso a linha
// já existe (mesmo meta_id) e só ganha o autor.
async function gravarSaida(
  destino: Destino,
  autorId: string,
  linha: {
    tipo: string;
    texto: string | null;
    midia_path?: string | null;
    midia_mime?: string | null;
    midia_nome?: string | null;
    dados?: Record<string, unknown>;
  },
  resultado: { metaId: string } | { erro: string },
) {
  const agora = new Date().toISOString();
  const base = {
    conversa_id: destino.conversaId,
    direcao: "saida",
    autor_id: autorId,
    criado_em: agora,
    midia_path: linha.midia_path ?? null,
    midia_mime: linha.midia_mime ?? null,
    midia_nome: linha.midia_nome ?? null,
    dados: linha.dados ?? {},
    tipo: linha.tipo,
    texto: linha.texto,
  };
  if ("erro" in resultado) {
    await supabaseAdmin
      .from("conv_mensagens")
      .insert({ ...base, status: "falhou", erro: resultado.erro });
    return;
  }
  const { error } = await supabaseAdmin
    .from("conv_mensagens")
    .insert({ ...base, status: "enviada", meta_id: resultado.metaId });
  if (error?.code === "23505") {
    await supabaseAdmin
      .from("conv_mensagens")
      .update({ autor_id: autorId, dados: base.dados })
      .eq("meta_id", resultado.metaId);
  }
  await supabaseAdmin
    .from("conv_conversas")
    .update({
      ultima_mensagem_em: agora,
      ultima_mensagem_resumo: resumoMensagem(linha.tipo as "texto", linha.texto),
      nao_lidas: 0,
      atualizado_em: agora,
    })
    .eq("id", destino.conversaId);
  await supabaseAdmin
    .from("crm_contatos")
    .update({ ultimo_contato_em: agora })
    .eq("id", destino.contatoId);
}

async function enviarEGravar(
  destino: Destino,
  autorId: string,
  envio: Envio,
  linha: Parameters<typeof gravarSaida>[2],
  comentarioId?: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  try {
    const metaId = await enviarPeloCanal(destino.canal, destino.externoId, envio, comentarioId);
    await gravarSaida(destino, autorId, linha, { metaId });
    return { ok: true };
  } catch (e) {
    const erro = e instanceof Error ? e.message : "Falha ao enviar.";
    await gravarSaida(destino, autorId, linha, { erro });
    return { ok: false, erro };
  }
}

export const enviarMensagem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversaId: z.string().uuid(),
        texto: z.string().trim().min(1, "Escreva a mensagem.").max(4000),
        // Resposta privada ao comentário, quando a janela do Direct ainda não abriu.
        comentarioId: z.string().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const destino = await destinoDaConversa(data.conversaId);

    const viaComentario = destino.canal === "instagram" && Boolean(data.comentarioId);
    if (!destino.janela.aberta && !viaComentario) {
      throw new Error(MSG_JANELA_FECHADA[destino.canal]);
    }

    const r = await enviarEGravar(
      destino,
      context.userId,
      { tipo: "texto", texto: data.texto },
      {
        tipo: "texto",
        texto: data.texto,
        dados: viaComentario ? { responde_comentario: data.comentarioId } : {},
      },
      viaComentario ? data.comentarioId : undefined,
    );
    await logAcaoAdminServer(context.userId, "conversa_enviar", data.conversaId);
    return r;
  });

const MIMES_PERMITIDOS: Record<string, "imagem" | "video" | "audio" | "arquivo"> = {
  "image/jpeg": "imagem",
  "image/png": "imagem",
  "video/mp4": "video",
  "audio/mpeg": "audio",
  "audio/ogg": "audio",
  "application/pdf": "arquivo",
};
const ANEXO_MAX_BYTES = 8 * 1024 * 1024;

export const enviarAnexo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversaId: z.string().uuid(),
        nome: z.string().trim().min(1).max(160),
        mime: z.string().max(80),
        base64: z.string().max(Math.ceil((ANEXO_MAX_BYTES * 4) / 3) + 8),
        legenda: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const tipo = MIMES_PERMITIDOS[data.mime];
    if (!tipo) throw new Error("Formato não aceito. Use JPG, PNG, MP4, MP3, OGG ou PDF.");

    const destino = await destinoDaConversa(data.conversaId);
    if (destino.canal === "instagram" && tipo !== "imagem") {
      throw new Error("No Instagram dá pra mandar texto e foto.");
    }
    if (!destino.janela.aberta) throw new Error(MSG_JANELA_FECHADA[destino.canal]);

    const binario = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    if (binario.byteLength > ANEXO_MAX_BYTES) throw new Error("Arquivo maior que 8 MB.");
    const path = await subirMidia(destino.conversaId, binario.buffer as ArrayBuffer, data.mime);

    // A Meta busca o arquivo por URL: assinada por 1h, tempo de sobra pro download dela.
    const { data: assinada } = await supabaseAdmin.storage
      .from(BUCKET_MIDIA)
      .createSignedUrl(path, 3600);
    if (!assinada?.signedUrl) throw new Error("Falha ao preparar o arquivo.");

    const legenda = data.legenda || undefined;
    const r = await enviarEGravar(
      destino,
      context.userId,
      { tipo, url: assinada.signedUrl, nome: data.nome, legenda },
      {
        tipo,
        texto: legenda ?? null,
        midia_path: path,
        midia_mime: data.mime,
        midia_nome: data.nome,
      },
    );
    await logAcaoAdminServer(context.userId, "conversa_enviar_anexo", data.conversaId);
    return r;
  });

export const registrarNota = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        conversaId: z.string().uuid(),
        texto: z.string().trim().min(1, "Escreva a nota.").max(4000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("conv_mensagens").insert({
      conversa_id: data.conversaId,
      direcao: "interna",
      tipo: "nota",
      texto: data.texto,
      status: "enviada",
      autor_id: context.userId,
    });
    if (error) throw new Error("Falha ao salvar a nota.");
    return { ok: true };
  });

export const contarNaoLidas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { count } = await supabaseAdmin
      .from("conv_conversas")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta")
      .gt("nao_lidas", 0);
    return { total: count ?? 0 };
  });
