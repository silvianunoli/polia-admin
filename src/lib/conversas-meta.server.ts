// Caixa de entrada do CRM: tudo que fala com a Meta e com o banco. Só servidor.
//
// Entrada: o Worker (src/server.ts) desvia /api/meta/webhook pra tratarWebhookMeta antes do
// TanStack. O evento cru é gravado em conv_eventos e a resposta 200 sai na hora; o
// processamento roda depois, no waitUntil, porque a Meta reenvia se demorar.
// Saída: enviarPeloCanal, chamado pelas server functions de conversas.functions.ts.
//
// Secrets do Worker (nunca no git; .dev.vars local):
//   META_WEBHOOK_VERIFY_TOKEN  texto combinado no painel da Meta ao cadastrar o webhook
//   META_APP_SECRET            segredo do app da Meta (assina o webhook do WhatsApp)
//   INSTAGRAM_APP_SECRET       segredo do app do Instagram (assina o webhook do Instagram)
//   INSTAGRAM_ACCESS_TOKEN     token da conta @hub.polia (Instagram Login, vence em 60 dias)
//   WHATSAPP_ACCESS_TOKEN      token permanente de system user
//   WHATSAPP_PHONE_NUMBER_ID   ID do número (o de teste até o dia do corte)
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assinaturaValida,
  normalizarWebhook,
  resumoMensagem,
  variantesTelefoneBR,
  type Canal,
  type EventoConversa,
  type MidiaRecebida,
  type StatusEntrega,
} from "@/lib/conversas-meta";

const GRAPH_VERSAO = "v23.0";
const GRAPH_IG = `https://graph.instagram.com/${GRAPH_VERSAO}`;
const GRAPH_FB = `https://graph.facebook.com/${GRAPH_VERSAO}`;
export const BUCKET_MIDIA = "conv-midia";
const MIDIA_MAX_BYTES = 25 * 1024 * 1024;

export function canaisConfigurados() {
  return {
    webhook: Boolean(
      process.env.META_WEBHOOK_VERIFY_TOKEN &&
      (process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET),
    ),
    instagram: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_APP_SECRET),
    whatsapp: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN &&
      process.env.WHATSAPP_PHONE_NUMBER_ID &&
      process.env.META_APP_SECRET,
    ),
  };
}

// ---------------------------------------------------------------- Graph API

class ErroMeta extends Error {}

async function chamarGraph(url: string, token: string, corpo?: unknown): Promise<unknown> {
  const resp = await fetch(url, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(corpo ? { "content-type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = (await resp.json().catch(() => ({}))) as {
    error?: { message?: string; error_user_msg?: string; code?: number };
  };
  if (!resp.ok || json.error) {
    const e = json.error ?? {};
    // A mensagem da Meta vai pro histórico da conversa: ajuda a entender o "falhou".
    throw new ErroMeta(e.error_user_msg || e.message || `Meta respondeu ${resp.status}`);
  }
  return json;
}

function tokenInstagram(): string {
  const t = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!t) throw new ErroMeta("Instagram ainda não conectado (falta INSTAGRAM_ACCESS_TOKEN).");
  return t;
}

function configWhatsapp(): { token: string; numeroId: string } {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const numeroId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !numeroId) {
    throw new ErroMeta(
      "WhatsApp ainda não conectado (faltam WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID).",
    );
  }
  return { token, numeroId };
}

async function perfilInstagram(
  igsid: string,
): Promise<{ nome: string | null; username: string | null }> {
  try {
    const p = (await chamarGraph(
      `${GRAPH_IG}/${encodeURIComponent(igsid)}?fields=name,username`,
      tokenInstagram(),
    )) as { name?: string; username?: string };
    return { nome: p.name || null, username: p.username?.toLowerCase() || null };
  } catch (e) {
    console.warn("[conversas] perfil do Instagram indisponível", igsid, e);
    return { nome: null, username: null };
  }
}

export type Envio =
  | { tipo: "texto"; texto: string }
  | {
      tipo: "imagem" | "video" | "audio" | "arquivo";
      url: string;
      nome?: string;
      legenda?: string;
    };

const TIPO_WA_ENVIO = {
  imagem: "image",
  video: "video",
  audio: "audio",
  arquivo: "document",
} as const;

// Devolve o ID da Meta da mensagem enviada. `comentarioId` troca o destinatário: a resposta
// vira a "resposta privada" ao comentário (uma por comentário, até 7 dias depois dele).
export async function enviarPeloCanal(
  canal: Canal,
  externoId: string,
  envio: Envio,
  comentarioId?: string,
): Promise<string> {
  if (canal === "instagram") {
    if (envio.tipo !== "texto" && envio.tipo !== "imagem") {
      throw new ErroMeta("No Instagram dá pra mandar texto e foto.");
    }
    const message =
      envio.tipo === "texto"
        ? { text: envio.texto }
        : { attachment: { type: "image", payload: { url: envio.url } } };
    const r = (await chamarGraph(`${GRAPH_IG}/me/messages`, tokenInstagram(), {
      recipient: comentarioId ? { comment_id: comentarioId } : { id: externoId },
      message,
    })) as { message_id?: string };
    if (!r.message_id) throw new ErroMeta("A Meta não devolveu o ID da mensagem.");
    return r.message_id;
  }

  const { token, numeroId } = configWhatsapp();
  let corpo: Record<string, unknown>;
  if (envio.tipo === "texto") {
    corpo = { type: "text", text: { body: envio.texto, preview_url: true } };
  } else {
    const tipo = TIPO_WA_ENVIO[envio.tipo];
    const midia: Record<string, string> = { link: envio.url };
    if (envio.legenda && tipo !== "audio") midia.caption = envio.legenda;
    if (tipo === "document" && envio.nome) midia.filename = envio.nome;
    corpo = { type: tipo, [tipo]: midia };
  }
  const r = (await chamarGraph(`${GRAPH_FB}/${numeroId}/messages`, token, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: externoId,
    ...corpo,
  })) as { messages?: { id?: string }[] };
  const id = r.messages?.[0]?.id;
  if (!id) throw new ErroMeta("A Meta não devolveu o ID da mensagem.");
  return id;
}

// ---------------------------------------------------------------- mídia

const EXTENSAO: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "application/pdf": "pdf",
};

export async function subirMidia(
  conversaId: string,
  bytes: ArrayBuffer,
  mime: string,
): Promise<string> {
  const ext = EXTENSAO[mime.split(";")[0]] ?? "bin";
  const path = `${conversaId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET_MIDIA)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw new Error(`Falha ao guardar a mídia: ${error.message}`);
  return path;
}

// A URL que a Meta manda expira (minutos no WhatsApp, horas no Instagram): a cópia fica no bucket.
async function baixarMidia(
  midia: MidiaRecebida,
  conversaId: string,
): Promise<{ path: string; mime: string } | null> {
  let url = midia.url;
  let headers: Record<string, string> = {};
  let mime = midia.mime;

  if (midia.waMediaId) {
    const { token } = configWhatsapp();
    const info = (await chamarGraph(`${GRAPH_FB}/${midia.waMediaId}`, token)) as {
      url?: string;
      mime_type?: string;
    };
    url = info.url;
    mime = mime ?? info.mime_type;
    headers = { Authorization: `Bearer ${token}` };
  }
  if (!url) return null;

  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`Download da mídia respondeu ${resp.status}`);
  const tamanho = Number(resp.headers.get("content-length") ?? 0);
  if (tamanho > MIDIA_MAX_BYTES) throw new Error("Mídia maior que 25 MB, não guardada.");
  const bytes = await resp.arrayBuffer();
  if (bytes.byteLength > MIDIA_MAX_BYTES) throw new Error("Mídia maior que 25 MB, não guardada.");
  const tipo = mime ?? resp.headers.get("content-type") ?? "application/octet-stream";
  return { path: await subirMidia(conversaId, bytes, tipo), mime: tipo };
}

// ---------------------------------------------------------------- contato e conversa

interface ContatoMin {
  id: string;
}

async function acharOuCriarContato(ev: EventoConversa): Promise<ContatoMin> {
  const coluna = ev.canal === "instagram" ? "ig_id" : "wa_id";

  const { data: existente } = await supabaseAdmin
    .from("crm_contatos")
    .select("id")
    .eq(coluna, ev.externoId)
    .maybeSingle();
  if (existente) return existente as ContatoMin;

  let nome = ev.nome;
  let username = ev.username?.toLowerCase() ?? null;
  if (ev.canal === "instagram" && (!nome || !username)) {
    const perfil = await perfilInstagram(ev.externoId);
    nome = nome ?? perfil.nome;
    username = username ?? perfil.username;
  }

  // Liga a quem já está no CRM (veio do quiz, do manual, cadastrada à mão) em vez de duplicar.
  let jaNoCrm: ContatoMin | null = null;
  if (ev.canal === "instagram" && username) {
    const { data } = await supabaseAdmin
      .from("crm_contatos")
      .select("id")
      // ilike sem coringa: "_" é comum em @ e casaria qualquer letra.
      .ilike("instagram", username.replace(/[\\%_]/g, "\\$&"))
      .is("ig_id", null)
      .limit(1)
      .maybeSingle();
    jaNoCrm = (data as ContatoMin | null) ?? null;
  }
  if (ev.canal === "whatsapp") {
    const { data } = await supabaseAdmin
      .from("crm_contatos")
      .select("id")
      .in("telefone", variantesTelefoneBR(ev.externoId))
      .is("wa_id", null)
      .limit(1)
      .maybeSingle();
    jaNoCrm = (data as ContatoMin | null) ?? null;
  }
  if (jaNoCrm) {
    await supabaseAdmin
      .from("crm_contatos")
      .update({ [coluna]: ev.externoId, atualizado_em: new Date().toISOString() })
      .eq("id", jaNoCrm.id);
    return jaNoCrm;
  }

  const linha: Record<string, string | null> =
    ev.canal === "instagram"
      ? {
          nome: nome || (username ? `@${username}` : "Contato do Instagram"),
          instagram: username,
          ig_id: ev.externoId,
          origem: "instagram",
          status: "lead",
        }
      : {
          nome: nome || `+${ev.externoId}`,
          telefone: ev.externoId,
          wa_id: ev.externoId,
          origem: "whatsapp",
          status: "lead",
        };

  const { data: criado, error } = await supabaseAdmin
    .from("crm_contatos")
    .insert(linha)
    .select("id")
    .single();
  if (error?.code === "23505") {
    // Dois eventos da mesma pessoa ao mesmo tempo: o outro criou primeiro.
    const { data } = await supabaseAdmin
      .from("crm_contatos")
      .select("id")
      .eq(coluna, ev.externoId)
      .single();
    if (data) return data as ContatoMin;
  }
  if (error || !criado) throw new Error(`Falha ao criar contato: ${error?.message}`);
  return criado as ContatoMin;
}

interface ConversaLinha {
  id: string;
  nao_lidas: number;
  ultima_mensagem_em: string | null;
}

async function acharOuCriarConversa(contatoId: string, canal: Canal): Promise<ConversaLinha> {
  const campos = "id, nao_lidas, ultima_mensagem_em";
  const { data } = await supabaseAdmin
    .from("conv_conversas")
    .select(campos)
    .eq("contato_id", contatoId)
    .eq("canal", canal)
    .maybeSingle();
  if (data) return data as ConversaLinha;

  const { data: criada, error } = await supabaseAdmin
    .from("conv_conversas")
    .insert({ contato_id: contatoId, canal })
    .select(campos)
    .single();
  if (error?.code === "23505") {
    const { data: outra } = await supabaseAdmin
      .from("conv_conversas")
      .select(campos)
      .eq("contato_id", contatoId)
      .eq("canal", canal)
      .single();
    if (outra) return outra as ConversaLinha;
  }
  if (error || !criada) throw new Error(`Falha ao criar conversa: ${error?.message}`);
  return criada as ConversaLinha;
}

// ---------------------------------------------------------------- aplicar no banco

async function aplicarEvento(ev: EventoConversa): Promise<void> {
  const m = ev.mensagem;
  if (!m) return;

  // Repetido (a Meta reenvia) ou eco de mensagem que o próprio CRM gravou ao enviar.
  const { data: repetida } = await supabaseAdmin
    .from("conv_mensagens")
    .select("id")
    .eq("meta_id", m.metaId)
    .maybeSingle();
  if (repetida) return;

  const contato = await acharOuCriarContato(ev);
  const conversa = await acharOuCriarConversa(contato.id, ev.canal);

  let midia: { path: string; mime: string } | null = null;
  let erroMidia: string | null = null;
  if (m.midia) {
    try {
      midia = await baixarMidia(m.midia, conversa.id);
    } catch (e) {
      erroMidia = e instanceof Error ? e.message : String(e);
    }
  }

  const { error } = await supabaseAdmin.from("conv_mensagens").insert({
    conversa_id: conversa.id,
    direcao: m.direcao,
    tipo: m.tipo,
    texto: m.texto,
    midia_path: midia?.path ?? null,
    midia_mime: midia?.mime ?? m.midia?.mime ?? null,
    midia_nome: m.midia?.nome ?? null,
    dados: erroMidia ? { ...m.dados, midia_erro: erroMidia } : m.dados,
    meta_id: m.metaId,
    status: m.direcao === "entrada" ? "recebida" : "enviada",
    criado_em: m.quando,
  });
  if (error?.code === "23505") return;
  if (error) throw new Error(`Falha ao gravar mensagem: ${error.message}`);

  // Evento atrasado não pode puxar a conversa pra trás na lista.
  const maisRecente = !conversa.ultima_mensagem_em || m.quando >= conversa.ultima_mensagem_em;
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { atualizado_em: agora };
  if (maisRecente) {
    patch.ultima_mensagem_em = m.quando;
    patch.ultima_mensagem_resumo = resumoMensagem(m.tipo, m.texto);
  }
  if (m.direcao === "entrada") {
    patch.nao_lidas = conversa.nao_lidas + 1;
    patch.status = "aberta";
    if (m.abreJanela) patch.ultima_entrada_em = m.quando;
  }
  await supabaseAdmin.from("conv_conversas").update(patch).eq("id", conversa.id);
  await supabaseAdmin
    .from("crm_contatos")
    .update({ ultimo_contato_em: agora })
    .eq("id", contato.id);
}

const ORDEM_STATUS: Record<string, number> = {
  enviando: 0,
  recebida: 0,
  enviada: 1,
  entregue: 2,
  lida: 3,
  falhou: 4,
};

async function aplicarStatus(s: StatusEntrega): Promise<void> {
  const { data } = await supabaseAdmin
    .from("conv_mensagens")
    .select("id, status")
    .eq("meta_id", s.metaId)
    .maybeSingle();
  if (!data) return;
  const atual = (data as { status: string }).status;
  // "entregue" pode chegar depois de "lida": nunca rebaixar.
  if ((ORDEM_STATUS[s.status] ?? 0) <= (ORDEM_STATUS[atual] ?? 0)) return;
  await supabaseAdmin
    .from("conv_mensagens")
    .update({ status: s.status, erro: s.erro })
    .eq("id", (data as { id: string }).id);
}

export async function processarPayload(payload: unknown): Promise<void> {
  const { eventos, statuses } = normalizarWebhook(payload);
  // Em ordem: duas mensagens seguidas da mesma pessoa não podem criar dois contatos.
  for (const ev of eventos) await aplicarEvento(ev);
  for (const s of statuses) await aplicarStatus(s);
}

async function processarEventoGravado(id: number, payload: unknown): Promise<void> {
  try {
    await processarPayload(payload);
    await supabaseAdmin
      .from("conv_eventos")
      .update({ processado_em: new Date().toISOString(), erro: null })
      .eq("id", id);
  } catch (e) {
    console.error("[conversas] falha ao processar evento", id, e);
    await supabaseAdmin
      .from("conv_eventos")
      .update({ erro: e instanceof Error ? e.message : String(e) })
      .eq("id", id);
  }
}

// ---------------------------------------------------------------- rota

type ContextoWorker = { waitUntil?: (p: Promise<unknown>) => void };

function texto(corpo: string, status: number): Response {
  return new Response(corpo, { status, headers: { "content-type": "text/plain" } });
}

export async function tratarWebhookMeta(request: Request, ctx: unknown): Promise<Response> {
  const url = new URL(request.url);

  // Verificação feita uma vez pela Meta ao cadastrar o webhook no painel do app.
  if (request.method === "GET") {
    const esperado = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (
      esperado &&
      url.searchParams.get("hub.mode") === "subscribe" &&
      url.searchParams.get("hub.verify_token") === esperado
    ) {
      return texto(url.searchParams.get("hub.challenge") ?? "", 200);
    }
    return texto("Forbidden", 403);
  }

  if (request.method !== "POST") return texto("Method Not Allowed", 405);

  const segredos = [process.env.INSTAGRAM_APP_SECRET, process.env.META_APP_SECRET];
  if (!segredos.some(Boolean)) return texto("Webhook não configurado", 503);

  const corpo = await request.text();
  const ok = await assinaturaValida(corpo, request.headers.get("x-hub-signature-256"), segredos);
  if (!ok) return texto("Assinatura inválida", 401);

  let payload: { object?: unknown };
  try {
    payload = JSON.parse(corpo) as { object?: unknown };
  } catch {
    return texto("JSON inválido", 400);
  }

  const { data, error } = await supabaseAdmin
    .from("conv_eventos")
    .insert({ origem: String(payload.object ?? "desconhecido"), payload })
    .select("id")
    .single();
  // Sem gravar o evento, devolve erro: a Meta tenta de novo em vez de a mensagem sumir.
  if (error || !data) {
    console.error("[conversas] falha ao gravar evento", error);
    return texto("Erro ao gravar", 500);
  }

  const trabalho = processarEventoGravado((data as { id: number }).id, payload);
  const waitUntil = (ctx as ContextoWorker | undefined)?.waitUntil;
  if (waitUntil) waitUntil.call(ctx, trabalho);
  else await trabalho;

  return texto("EVENT_RECEIVED", 200);
}
