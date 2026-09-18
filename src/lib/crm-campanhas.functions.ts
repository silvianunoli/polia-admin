import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { resendApiKey } from "@/lib/email-template";
import { montarHtmlCampanha, textoDoHtml } from "@/lib/crm-email-html";

// E-mail marketing da Pólia: lista (= filtro salvo espelhado num segment do
// Resend) + campanha (= broadcast). O descadastro e o header List-Unsubscribe
// são do Resend; a sincronização traz de volta quem saiu, pra crm_contatos
// continuar sendo a fonte da verdade.
//
// Endpoints usados (confirmados na doc em 18/09/2026):
//   POST   /segments                                  cria o segment
//   POST   /contacts                                  cria contato + segments[]
//   POST   /contacts/{email}/segments/{segmentId}     adiciona quem já existe
//   DELETE /contacts/{email}/segments/{segmentId}     tira quem saiu do filtro
//   GET    /segments/{id}/contacts                    lê o unsubscribed de volta
//   POST   /broadcasts                                cria a campanha
//   POST   /broadcasts/{id}/send                      dispara (ou agenda)
//   GET    /broadcasts/{id}/recipients?type=...       métricas

const RESEND = "https://api.resend.com";

// Remetente das campanhas. Diferente do transacional (naoresponda@) de
// propósito: newsletter que chega de um endereço que não recebe resposta é
// convite pra ninguém responder.
const REMETENTE = "Sil da Pólia <oi@usepolia.com.br>";
const RESPONDER_PARA = "oi@usepolia.com.br";

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

interface RespostaResend<T> {
  ok: boolean;
  status: number;
  dados: T | null;
  erro: string | null;
}

async function chamarResend<T>(
  caminho: string,
  init: { method: string; body?: unknown },
): Promise<RespostaResend<T>> {
  const resp = await fetch(`${RESEND}${caminho}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      "Content-Type": "application/json",
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });

  const texto = await resp.text();
  let dados: T | null = null;
  try {
    dados = texto ? (JSON.parse(texto) as T) : null;
  } catch {
    dados = null;
  }

  if (!resp.ok) {
    const msg =
      (dados as { message?: string } | null)?.message ?? texto.slice(0, 300) ?? "erro desconhecido";
    return { ok: false, status: resp.status, dados, erro: msg };
  }
  return { ok: true, status: resp.status, dados, erro: null };
}

export interface Lista {
  id: string;
  nome: string;
  descricao: string | null;
  filtro: FiltroLista;
  resend_segment_id: string | null;
  sincronizada_em: string | null;
  total_sincronizado: number;
  criado_em: string;
  atualizado_em: string;
}

export interface FiltroLista {
  status?: string[];
  origem?: string[];
  tags?: string[];
}

export interface Campanha {
  id: string;
  nome: string;
  assunto: string;
  preheader: string | null;
  corpo_html: string;
  lista_id: string | null;
  status: "rascunho" | "agendada" | "enviando" | "enviada" | "erro";
  resend_broadcast_id: string | null;
  destinatarios: number;
  entregues: number;
  abertos: number;
  cliques: number;
  rejeitados: number;
  descadastros: number;
  metricas_em: string | null;
  agendada_para: string | null;
  enviada_em: string | null;
  erro: string | null;
  criado_em: string;
  atualizado_em: string;
}

const filtroSchema = z.object({
  status: z.array(z.string().max(30)).max(10).optional(),
  origem: z.array(z.string().max(40)).max(20).optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
});

export const listarListas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("crm_listas")
      .select("*")
      .order("criado_em", { ascending: false });
    return { listas: (data ?? []) as unknown as Lista[] };
  });

export const salvarLista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1, "Dê um nome à lista.").max(120),
        descricao: z.string().trim().max(400).optional().or(z.literal("")),
        filtro: filtroSchema.default({}),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const linha = {
      nome: data.nome,
      descricao: data.descricao?.trim() || null,
      filtro: data.filtro,
      atualizado_em: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("crm_listas").update(linha).eq("id", data.id);
      if (error) throw new Error("Falha ao salvar a lista.");
      return { id: data.id };
    }
    const { data: criado, error } = await supabaseAdmin
      .from("crm_listas")
      .insert(linha)
      .select("id")
      .single();
    if (error) throw new Error("Falha ao criar a lista.");
    return { id: criado.id as string };
  });

export const excluirLista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    // O segment fica de pé no Resend de propósito: campanha já enviada aponta
    // pra ele e apagar lá some com o histórico de quem recebeu o quê.
    const { error } = await supabaseAdmin.from("crm_listas").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao excluir a lista.");
    return { ok: true };
  });

interface ContatoElegivel {
  id: string;
  nome: string;
  email: string;
}

// Quem pode receber campanha: tem e-mail, deu consentimento e não se
// descadastrou. O filtro da lista estreita a partir daí — nunca alarga.
async function contatosDoFiltro(filtro: FiltroLista): Promise<ContatoElegivel[]> {
  let q = supabaseAdmin
    .from("crm_contatos")
    .select("id, nome, email, status, origem, tags")
    .eq("consent_marketing", true)
    .is("descadastrado_em", null)
    .not("email", "is", null)
    .limit(5000);

  if (filtro.status?.length) q = q.in("status", filtro.status);
  if (filtro.origem?.length) q = q.in("origem", filtro.origem);
  if (filtro.tags?.length) q = q.overlaps("tags", filtro.tags);

  const { data, error } = await q;
  if (error) throw new Error("Falha ao montar o público.");

  return ((data ?? []) as unknown as { id: string; nome: string; email: string | null }[])
    .filter((c): c is ContatoElegivel => Boolean(c.email))
    .map((c) => ({ id: c.id, nome: c.nome, email: c.email.toLowerCase() }));
}

export const previaPublico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ filtro: filtroSchema }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const contatos = await contatosDoFiltro(data.filtro);
    return {
      total: contatos.length,
      amostra: contatos.slice(0, 8).map((c) => ({ nome: c.nome, email: c.email })),
    };
  });

export interface OpcaoFiltro {
  chave: string;
  pessoas: number;
  elegiveis: number;
}

// Só as origens, situações e marcadores que existem de verdade, com quantas
// pessoas cada um alcança. Oferecer as nove origens possíveis deixava montar
// um filtro que garantidamente traz zero (foi o que aconteceu com a primeira
// lista criada, em 18/09/2026: filtrou por "Cadastrei à mão", que não tinha
// ninguém).
export const opcoesDeFiltro = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data } = await supabaseAdmin
      .from("crm_contatos")
      .select("status, origem, tags, email, consent_marketing, descadastrado_em")
      .limit(5000);

    const linhas = (data ?? []) as unknown as {
      status: string;
      origem: string;
      tags: string[];
      email: string | null;
      consent_marketing: boolean;
      descadastrado_em: string | null;
    }[];

    const conta = (mapa: Map<string, OpcaoFiltro>, chave: string, elegivel: boolean) => {
      const atual = mapa.get(chave) ?? { chave, pessoas: 0, elegiveis: 0 };
      atual.pessoas += 1;
      if (elegivel) atual.elegiveis += 1;
      mapa.set(chave, atual);
    };

    const porStatus = new Map<string, OpcaoFiltro>();
    const porOrigem = new Map<string, OpcaoFiltro>();
    const porTag = new Map<string, OpcaoFiltro>();

    for (const l of linhas) {
      const elegivel = Boolean(l.email) && l.consent_marketing && !l.descadastrado_em;
      conta(porStatus, l.status, elegivel);
      conta(porOrigem, l.origem, elegivel);
      for (const t of l.tags ?? []) conta(porTag, t, elegivel);
    }

    const ordenar = (m: Map<string, OpcaoFiltro>) =>
      [...m.values()].sort((a, b) => b.elegiveis - a.elegiveis || b.pessoas - a.pessoas);

    return {
      status: ordenar(porStatus),
      origem: ordenar(porOrigem),
      tags: ordenar(porTag),
      totalElegiveis: linhas.filter(
        (l) => Boolean(l.email) && l.consent_marketing && !l.descadastrado_em,
      ).length,
    };
  });

function partesDoNome(nome: string): { first_name: string; last_name: string } {
  const partes = nome.trim().split(/\s+/);
  return {
    first_name: partes[0] ?? "",
    last_name: partes.length > 1 ? partes.slice(1).join(" ") : "",
  };
}

// Deixa o segment do Resend igual ao filtro: entra quem falta, sai quem não se
// qualifica mais, e quem clicou em descadastrar lá volta marcado aqui.
export const sincronizarLista = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: listaRaw } = await supabaseAdmin
      .from("crm_listas")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!listaRaw) throw new Error("Lista não encontrada.");
    const lista = listaRaw as unknown as Lista;

    let segmentId = lista.resend_segment_id;
    if (!segmentId) {
      const criado = await chamarResend<{ id: string }>("/segments", {
        method: "POST",
        body: { name: `Pólia · ${lista.nome}` },
      });
      if (!criado.ok || !criado.dados?.id) {
        throw new Error(`O Resend recusou criar a lista: ${criado.erro ?? "sem detalhe"}`);
      }
      segmentId = criado.dados.id;
      await supabaseAdmin
        .from("crm_listas")
        .update({ resend_segment_id: segmentId })
        .eq("id", lista.id);
    }

    const elegiveis = await contatosDoFiltro(lista.filtro ?? {});
    const elegiveisPorEmail = new Map(elegiveis.map((c) => [c.email, c]));

    // 1. Lê o que o Resend tem hoje nesse segment (e quem se descadastrou).
    const noResend = new Map<string, { id: string; unsubscribed: boolean }>();
    let after: string | null = null;
    for (let pagina = 0; pagina < 60; pagina += 1) {
      const url: string =
        `/segments/${segmentId}/contacts?limit=100` + (after ? `&after=${after}` : "");
      const resp = await chamarResend<{
        data: { id: string; email: string; unsubscribed: boolean }[];
        has_more: boolean;
      }>(url, { method: "GET" });
      if (!resp.ok) break;
      const linhas = resp.dados?.data ?? [];
      for (const c of linhas) {
        noResend.set(c.email.toLowerCase(), { id: c.id, unsubscribed: c.unsubscribed });
      }
      if (!resp.dados?.has_more || linhas.length === 0) break;
      after = linhas[linhas.length - 1]?.id ?? null;
      if (!after) break;
    }

    // 2. Descadastro feito lá vira descadastro aqui.
    let descadastrados = 0;
    for (const [email, info] of noResend) {
      if (!info.unsubscribed) continue;
      const contato = elegiveisPorEmail.get(email);
      if (!contato) continue;
      await supabaseAdmin
        .from("crm_contatos")
        .update({
          descadastrado_em: new Date().toISOString(),
          consent_marketing: false,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", contato.id);
      elegiveisPorEmail.delete(email);
      descadastrados += 1;
    }

    // 3. Entra quem falta.
    let adicionados = 0;
    const falhas: string[] = [];
    for (const contato of elegiveisPorEmail.values()) {
      if (noResend.has(contato.email)) continue;
      const nome = partesDoNome(contato.nome);
      const criado = await chamarResend("/contacts", {
        method: "POST",
        body: {
          email: contato.email,
          first_name: nome.first_name,
          last_name: nome.last_name,
          unsubscribed: false,
          segments: [{ id: segmentId }],
        },
      });
      if (criado.ok) {
        adicionados += 1;
        continue;
      }
      // Contato que já existe na conta só precisa entrar neste segment.
      const anexado = await chamarResend(
        `/contacts/${encodeURIComponent(contato.email)}/segments/${segmentId}`,
        { method: "POST" },
      );
      if (anexado.ok) adicionados += 1;
      else falhas.push(contato.email);
    }

    // 4. Sai quem não se qualifica mais.
    let removidos = 0;
    for (const email of noResend.keys()) {
      if (elegiveisPorEmail.has(email)) continue;
      const fora = await chamarResend(
        `/contacts/${encodeURIComponent(email)}/segments/${segmentId}`,
        { method: "DELETE" },
      );
      if (fora.ok) removidos += 1;
    }

    const total = elegiveisPorEmail.size;
    await supabaseAdmin
      .from("crm_listas")
      .update({
        sincronizada_em: new Date().toISOString(),
        total_sincronizado: total,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", lista.id);

    await logAcaoAdminServer(context.userId, "crm_sincronizar_lista", lista.nome);
    return { total, adicionados, removidos, descadastrados, falhas };
  });

export const listarCampanhas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [campanhasRes, listasRes] = await Promise.all([
      supabaseAdmin.from("crm_campanhas").select("*").order("criado_em", { ascending: false }),
      supabaseAdmin.from("crm_listas").select("*").order("nome", { ascending: true }),
    ]);
    return {
      campanhas: (campanhasRes.data ?? []) as unknown as Campanha[],
      listas: (listasRes.data ?? []) as unknown as Lista[],
    };
  });

export const obterCampanha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const [campanhaRes, listasRes] = await Promise.all([
      supabaseAdmin.from("crm_campanhas").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin.from("crm_listas").select("*").order("nome", { ascending: true }),
    ]);
    if (!campanhaRes.data) throw new Error("Campanha não encontrada.");
    return {
      campanha: campanhaRes.data as unknown as Campanha,
      listas: (listasRes.data ?? []) as unknown as Lista[],
    };
  });

export const salvarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1, "Dê um nome à campanha.").max(160),
        assunto: z.string().trim().min(1, "O assunto está vazio.").max(200),
        preheader: z.string().trim().max(200).optional().or(z.literal("")),
        corpo_html: z.string().max(200_000).default(""),
        lista_id: z.string().uuid().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    if (data.id) {
      const { data: atual } = await supabaseAdmin
        .from("crm_campanhas")
        .select("status")
        .eq("id", data.id)
        .maybeSingle();
      const status = (atual as { status?: string } | null)?.status;
      if (status === "enviada" || status === "enviando") {
        throw new Error("Essa campanha já saiu. Duplique pra escrever uma nova.");
      }
    }

    const linha = {
      nome: data.nome,
      assunto: data.assunto,
      preheader: data.preheader?.trim() || null,
      corpo_html: data.corpo_html,
      lista_id: data.lista_id ?? null,
      atualizado_em: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("crm_campanhas").update(linha).eq("id", data.id);
      if (error) throw new Error("Falha ao salvar a campanha.");
      return { id: data.id };
    }
    const { data: criado, error } = await supabaseAdmin
      .from("crm_campanhas")
      .insert(linha)
      .select("id")
      .single();
    if (error) throw new Error("Falha ao criar a campanha.");
    return { id: criado.id as string };
  });

export const excluirCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("crm_campanhas").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao excluir a campanha.");
    await logAcaoAdminServer(context.userId, "crm_excluir_campanha", data.id);
    return { ok: true };
  });

export const duplicarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: origemRaw } = await supabaseAdmin
      .from("crm_campanhas")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!origemRaw) throw new Error("Campanha não encontrada.");
    const origem = origemRaw as unknown as Campanha;

    const { data: criado, error } = await supabaseAdmin
      .from("crm_campanhas")
      .insert({
        nome: `${origem.nome} (cópia)`,
        assunto: origem.assunto,
        preheader: origem.preheader,
        corpo_html: origem.corpo_html,
        lista_id: origem.lista_id,
      })
      .select("id")
      .single();
    if (error) throw new Error("Falha ao duplicar.");
    return { id: criado.id as string };
  });

// Cria o broadcast no Resend e dispara. agendada_para vazio = sai agora.
export const enviarCampanha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        agendada_para: z.string().trim().max(40).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: campanhaRaw } = await supabaseAdmin
      .from("crm_campanhas")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!campanhaRaw) throw new Error("Campanha não encontrada.");
    const campanha = campanhaRaw as unknown as Campanha;

    if (campanha.status === "enviada" || campanha.status === "enviando") {
      throw new Error("Essa campanha já saiu.");
    }
    if (!campanha.lista_id) throw new Error("Escolha a lista que vai receber.");
    if (!campanha.corpo_html.trim()) throw new Error("O corpo do e-mail está vazio.");

    const { data: listaRaw } = await supabaseAdmin
      .from("crm_listas")
      .select("*")
      .eq("id", campanha.lista_id)
      .maybeSingle();
    if (!listaRaw) throw new Error("A lista dessa campanha não existe mais.");
    const lista = listaRaw as unknown as Lista;
    if (!lista.resend_segment_id) {
      throw new Error("Sincronize a lista antes de enviar — ela ainda não existe no Resend.");
    }

    const destinatarios = (await contatosDoFiltro(lista.filtro ?? {})).length;
    if (destinatarios === 0) {
      throw new Error("Ninguém se encaixa nessa lista agora. Nada foi enviado.");
    }

    const html = montarHtmlCampanha({
      assunto: campanha.assunto,
      preheader: campanha.preheader,
      corpo: campanha.corpo_html,
    });

    const criado = await chamarResend<{ id: string }>("/broadcasts", {
      method: "POST",
      body: {
        segment_id: lista.resend_segment_id,
        from: REMETENTE,
        reply_to: RESPONDER_PARA,
        subject: campanha.assunto,
        name: campanha.nome,
        ...(campanha.preheader ? { preview_text: campanha.preheader } : {}),
        html,
        text: textoDoHtml(campanha.corpo_html),
      },
    });

    if (!criado.ok || !criado.dados?.id) {
      const erro = criado.erro ?? "sem detalhe";
      await supabaseAdmin
        .from("crm_campanhas")
        .update({ status: "erro", erro, atualizado_em: new Date().toISOString() })
        .eq("id", campanha.id);
      throw new Error(`O Resend recusou a campanha: ${erro}`);
    }

    const broadcastId = criado.dados.id;
    const agendada = data.agendada_para?.trim() || null;

    const enviado = await chamarResend(`/broadcasts/${broadcastId}/send`, {
      method: "POST",
      body: agendada ? { scheduled_at: agendada } : {},
    });

    if (!enviado.ok) {
      const erro = enviado.erro ?? "sem detalhe";
      await supabaseAdmin
        .from("crm_campanhas")
        .update({
          status: "erro",
          erro,
          resend_broadcast_id: broadcastId,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", campanha.id);
      throw new Error(`A campanha foi criada mas não saiu: ${erro}`);
    }

    await supabaseAdmin
      .from("crm_campanhas")
      .update({
        status: agendada ? "agendada" : "enviando",
        resend_broadcast_id: broadcastId,
        destinatarios,
        agendada_para: agendada,
        enviada_em: agendada ? null : new Date().toISOString(),
        erro: null,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", campanha.id);

    await logAcaoAdminServer(
      context.userId,
      agendada ? "crm_agendar_campanha" : "crm_enviar_campanha",
      `${campanha.nome} · ${destinatarios} destinatárias`,
    );

    return { ok: true, destinatarios, agendada };
  });

async function contarRecipientes(broadcastId: string, tipo: string): Promise<number> {
  let total = 0;
  let after: string | null = null;
  for (let pagina = 0; pagina < 20; pagina += 1) {
    const url: string =
      `/broadcasts/${broadcastId}/recipients?type=${tipo}&limit=100` +
      (after ? `&after=${after}` : "");
    const resp = await chamarResend<{ data: { id: string }[]; has_more: boolean }>(url, {
      method: "GET",
    });
    if (!resp.ok) break;
    const linhas = resp.dados?.data ?? [];
    total += linhas.length;
    if (!resp.dados?.has_more || linhas.length === 0) break;
    after = linhas[linhas.length - 1]?.id ?? null;
    if (!after) break;
  }
  return total;
}

export const atualizarMetricas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: campanhaRaw } = await supabaseAdmin
      .from("crm_campanhas")
      .select("id, resend_broadcast_id, status")
      .eq("id", data.id)
      .maybeSingle();
    const campanha = campanhaRaw as unknown as Pick<
      Campanha,
      "id" | "resend_broadcast_id" | "status"
    > | null;
    if (!campanha?.resend_broadcast_id) throw new Error("Essa campanha ainda não saiu.");

    const broadcast = await chamarResend<{ status: string; sent_at: string | null }>(
      `/broadcasts/${campanha.resend_broadcast_id}`,
      { method: "GET" },
    );

    const [entregues, abertos, cliques, rejeitados, descadastros] = await Promise.all([
      contarRecipientes(campanha.resend_broadcast_id, "delivered"),
      contarRecipientes(campanha.resend_broadcast_id, "opened"),
      contarRecipientes(campanha.resend_broadcast_id, "clicked"),
      contarRecipientes(campanha.resend_broadcast_id, "bounced"),
      contarRecipientes(campanha.resend_broadcast_id, "unsubscribed"),
    ]);

    const statusResend = broadcast.dados?.status;
    const novoStatus =
      statusResend === "sent"
        ? "enviada"
        : campanha.status === "enviando"
          ? "enviando"
          : campanha.status;

    await supabaseAdmin
      .from("crm_campanhas")
      .update({
        entregues,
        abertos,
        cliques,
        rejeitados,
        descadastros,
        metricas_em: new Date().toISOString(),
        status: novoStatus,
        ...(statusResend === "sent" && broadcast.dados?.sent_at
          ? { enviada_em: broadcast.dados.sent_at }
          : {}),
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", campanha.id);

    return { entregues, abertos, cliques, rejeitados, descadastros, status: novoStatus };
  });

// Teste antes de mandar pra lista inteira: um e-mail avulso, com a mesma casca,
// pro endereço que ela escolher. Não passa por broadcast nem por segment.
export const enviarTeste = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), para: z.string().trim().toLowerCase().email() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: campanhaRaw } = await supabaseAdmin
      .from("crm_campanhas")
      .select("assunto, preheader, corpo_html")
      .eq("id", data.id)
      .maybeSingle();
    if (!campanhaRaw) throw new Error("Campanha não encontrada.");
    const campanha = campanhaRaw as unknown as Pick<
      Campanha,
      "assunto" | "preheader" | "corpo_html"
    >;

    // No teste o link de descadastro não é substituído pelo Resend (não é
    // broadcast), então vira âncora morta em vez de token quebrado.
    const html = montarHtmlCampanha({
      assunto: campanha.assunto,
      preheader: campanha.preheader,
      corpo: campanha.corpo_html,
    }).replace("{{{RESEND_UNSUBSCRIBE_URL}}}", "#");

    const resp = await chamarResend("/emails", {
      method: "POST",
      body: {
        from: REMETENTE,
        to: [data.para],
        reply_to: RESPONDER_PARA,
        subject: `[teste] ${campanha.assunto}`,
        html,
        text: textoDoHtml(campanha.corpo_html),
      },
    });
    if (!resp.ok) throw new Error(`Não saiu: ${resp.erro ?? "sem detalhe"}`);
    return { ok: true };
  });
