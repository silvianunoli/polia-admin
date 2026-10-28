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

// Botão de resposta: no Instagram vira quick reply; no WhatsApp, botão (até 3) ou lista (até 10).
// O `payload` volta no webhook quando a pessoa toca, e é por ele que a automação sabe qual foi.
export interface BotaoEnvio {
  payload: string;
  titulo: string;
}

// Botão que abre um link ("Abrir o WhatsApp"). Não volta no webhook.
export interface LinkEnvio {
  titulo: string;
  url: string;
}

export type Envio =
  | { tipo: "texto"; texto: string; botoes?: BotaoEnvio[]; links?: LinkEnvio[] }
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
    const recipient = comentarioId ? { comment_id: comentarioId } : { id: externoId };
    const mandar = async (message: unknown) => {
      const r = (await chamarGraph(`${GRAPH_IG}/me/messages`, tokenInstagram(), {
        recipient,
        message,
      })) as { message_id?: string };
      if (!r.message_id) throw new ErroMeta("A Meta não devolveu o ID da mensagem.");
      return r.message_id;
    };

    if (envio.tipo !== "texto") {
      return mandar({ attachment: { type: "image", payload: { url: envio.url } } });
    }

    const respostas = (envio.botoes ?? []).slice(0, 13);
    const links = envio.links ?? [];
    // Botão de link = "button template" (texto até 640 e até 3 botões, link ou de resposta).
    // Se a Meta recusar o template, cai pra texto com o link escrito: a pessoa recebe do mesmo jeito.
    if (links.length > 0) {
      try {
        return await mandar({
          attachment: {
            type: "template",
            payload: {
              template_type: "button",
              text: envio.texto.slice(0, 640),
              buttons: [
                ...links.map((l) => ({
                  type: "web_url",
                  url: l.url,
                  title: l.titulo.slice(0, 20),
                })),
                ...respostas.map((b) => ({
                  type: "postback",
                  title: b.titulo.slice(0, 20),
                  payload: b.payload,
                })),
              ].slice(0, 3),
            },
          },
        });
      } catch (e) {
        console.warn("[conversas] template de botão recusado, mandando como texto", e);
      }
    }
    const texto = [envio.texto, ...links.map((l) => `${l.titulo}: ${l.url}`)].join("\n\n");
    return mandar({
      text: texto,
      ...(respostas.length
        ? {
            quick_replies: respostas.map((b) => ({
              content_type: "text",
              title: b.titulo.slice(0, 20),
              payload: b.payload,
            })),
          }
        : {}),
    });
  }

  const { token, numeroId } = configWhatsapp();
  let corpo: Record<string, unknown>;
  if (envio.tipo === "texto" && envio.links?.length) {
    // WhatsApp aceita um botão de link por mensagem; os outros vão escritos no texto.
    const [primeiro, ...resto] = envio.links;
    const texto = [envio.texto, ...resto.map((l) => `${l.titulo}: ${l.url}`)].join("\n\n");
    corpo = {
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: texto },
        action: {
          name: "cta_url",
          parameters: { display_text: primeiro.titulo.slice(0, 20), url: primeiro.url },
        },
      },
    };
  } else if (envio.tipo === "texto" && envio.botoes?.length) {
    const botoes = envio.botoes.slice(0, 10);
    corpo = {
      type: "interactive",
      interactive:
        botoes.length <= 3
          ? {
              type: "button",
              body: { text: envio.texto },
              action: {
                buttons: botoes.map((b) => ({
                  type: "reply",
                  reply: { id: b.payload, title: b.titulo.slice(0, 20) },
                })),
              },
            }
          : {
              type: "list",
              body: { text: envio.texto },
              action: {
                button: "Escolher",
                sections: [
                  {
                    rows: botoes.map((b) => ({ id: b.payload, title: b.titulo.slice(0, 24) })),
                  },
                ],
              },
            },
    };
  } else if (envio.tipo === "texto") {
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

// ---------------------------------------------------------------- tela de canais (/crm/canais)

// A conta do WhatsApp da Pólia (WABA "Pólia", no portfólio dela, com o ManyChat de parceiro).
// O número +55 11 99696-3296 mora nela. Lido no Gerenciador de Negócios em 26/10/2026.
export const WABA_POLIA = "2091097082282481";

export async function contaInstagramConectada(): Promise<{ id: string; username: string }> {
  const r = (await chamarGraph(`${GRAPH_IG}/me?fields=user_id,username`, tokenInstagram())) as {
    user_id?: string;
    id?: string;
    username?: string;
  };
  return { id: String(r.user_id ?? r.id ?? ""), username: r.username ?? "" };
}

function tokenWhatsapp(): string {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!t)
    throw new ErroMeta("Falta o WHATSAPP_ACCESS_TOKEN no Worker (token do usuário do sistema).");
  return t;
}

export interface NumeroWhatsapp {
  id: string;
  numero: string;
  nome: string;
  qualidade: string | null;
  status: string | null;
}

export interface ContaWhatsapp {
  nome: string;
  numeros: NumeroWhatsapp[];
  // Apps que recebem os eventos dessa conta. O ManyChat aparece aqui; o office entra ao lado.
  apps: { id: string; nome: string }[];
}

export async function lerContaWhatsapp(wabaId: string): Promise<ContaWhatsapp> {
  const token = tokenWhatsapp();
  const [conta, numeros, apps] = (await Promise.all([
    chamarGraph(`${GRAPH_FB}/${wabaId}?fields=name`, token),
    chamarGraph(
      `${GRAPH_FB}/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status`,
      token,
    ),
    chamarGraph(`${GRAPH_FB}/${wabaId}/subscribed_apps`, token),
  ])) as [
    { name?: string },
    {
      data?: {
        id: string;
        display_phone_number?: string;
        verified_name?: string;
        quality_rating?: string;
        status?: string;
      }[];
    },
    { data?: { whatsapp_business_api_data?: { id?: string; name?: string } }[] },
  ];
  return {
    nome: conta.name ?? "",
    numeros: (numeros.data ?? []).map((n) => ({
      id: n.id,
      numero: n.display_phone_number ?? "",
      nome: n.verified_name ?? "",
      qualidade: n.quality_rating ?? null,
      status: n.status ?? null,
    })),
    apps: (apps.data ?? []).map((a) => ({
      id: a.whatsapp_business_api_data?.id ?? "",
      nome: a.whatsapp_business_api_data?.name ?? "",
    })),
  };
}

// Liga o app dono do token (o "Silvia Nunoli") à conta: a partir daí a Meta manda os eventos do
// WhatsApp pro webhook do office também. Não tira nenhum outro app (o ManyChat continua).
export async function ligarAppNaContaWhatsapp(wabaId: string): Promise<void> {
  await chamarGraph(`${GRAPH_FB}/${wabaId}/subscribed_apps`, tokenWhatsapp(), {});
}

// "Antes de receber o link, segue o perfil": a Meta diz se a pessoa segue a conta conectada.
// Se a Meta não responder, deixa passar (melhor mandar o link do que travar a pessoa).
export async function seguePerfil(igsid: string): Promise<boolean> {
  try {
    const p = (await chamarGraph(
      `${GRAPH_IG}/${encodeURIComponent(igsid)}?fields=is_user_follow_business`,
      tokenInstagram(),
    )) as { is_user_follow_business?: boolean };
    return p.is_user_follow_business !== false;
  } catch (e) {
    console.warn("[conversas] não deu pra conferir se segue", igsid, e);
    return true;
  }
}

// Data de publicação de um post (pra "próxima publicação" saber se o post é novo).
export async function dataDoPost(mediaId: string): Promise<string | null> {
  try {
    const p = (await chamarGraph(
      `${GRAPH_IG}/${encodeURIComponent(mediaId)}?fields=timestamp`,
      tokenInstagram(),
    )) as { timestamp?: string };
    return p.timestamp ? new Date(p.timestamp).toISOString() : null;
  } catch {
    return null;
  }
}

// Resposta pública num comentário ("Te mandei no Direct"), opcional no gatilho de comentário.
export async function responderComentarioEmPublico(comentarioId: string, texto: string) {
  await chamarGraph(`${GRAPH_IG}/${encodeURIComponent(comentarioId)}/replies`, tokenInstagram(), {
    message: texto,
  });
}

export interface PostInstagram {
  id: string;
  legenda: string;
  link: string;
  imagem: string | null;
  quando: string;
}

// Últimos posts do @hub.polia, pro editor escolher em qual post o gatilho de comentário vale.
export async function listarPostsInstagram(): Promise<PostInstagram[]> {
  const r = (await chamarGraph(
    `${GRAPH_IG}/me/media?fields=id,caption,permalink,media_type,media_url,thumbnail_url,timestamp&limit=30`,
    tokenInstagram(),
  )) as {
    data?: {
      id: string;
      caption?: string;
      permalink?: string;
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
      timestamp?: string;
    }[];
  };
  return (r.data ?? []).map((p) => ({
    id: p.id,
    legenda: (p.caption ?? "").slice(0, 140),
    link: p.permalink ?? "",
    imagem: p.media_type === "VIDEO" ? (p.thumbnail_url ?? null) : (p.media_url ?? null),
    quando: p.timestamp ?? "",
  }));
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

  // Mensagem da pessoa pode começar ou continuar uma automação (CRM-27). Falha do motor não
  // pode desfazer a mensagem que já ficou gravada.
  if (m.direcao === "entrada") {
    try {
      const { aoReceberMensagem } = await import("@/lib/automacoes.server");
      await aoReceberMensagem({
        canal: ev.canal,
        externoId: ev.externoId,
        contatoId: contato.id,
        conversaId: conversa.id,
        mensagem: m,
      });
    } catch (e) {
      console.error("[conversas] automação falhou", e);
    }
  }
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
