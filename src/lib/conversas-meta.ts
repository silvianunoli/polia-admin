// Caixa de entrada do CRM: a parte pura (sem banco, sem rede) do que chega e sai da Meta.
// Fica separada de conversas-meta.server.ts pra ser testável sem mock de Supabase.
//
// Dois formatos de webhook chegam no mesmo endereço (/api/meta/webhook):
//   object "instagram"                 -> Instagram API com Instagram Login
//   object "whatsapp_business_account" -> WhatsApp Cloud API
// Os dois viram EventoConversa, o formato único que o resto do código entende.

export type Canal = "instagram" | "whatsapp";

export type TipoMensagem =
  | "texto"
  | "imagem"
  | "video"
  | "audio"
  | "arquivo"
  | "figurinha"
  | "story_resposta"
  | "story_mencao"
  | "comentario"
  | "reacao"
  | "botao"
  | "outro";

export interface MidiaRecebida {
  // Instagram manda a URL pronta (expira); WhatsApp manda um ID que precisa ser trocado por URL.
  url?: string;
  waMediaId?: string;
  mime?: string;
  nome?: string;
}

export interface MensagemRecebida {
  metaId: string;
  direcao: "entrada" | "saida";
  tipo: TipoMensagem;
  texto: string | null;
  midia: MidiaRecebida | null;
  dados: Record<string, unknown>;
  // Comentário não abre a janela de 24h do Direct. Só mensagem da pessoa abre.
  abreJanela: boolean;
  quando: string;
}

export interface EventoConversa {
  canal: Canal;
  // ID da pessoa no canal: IGSID no Instagram, wa_id (telefone) no WhatsApp.
  externoId: string;
  nome: string | null;
  username: string | null;
  mensagem: MensagemRecebida | null;
}

export interface StatusEntrega {
  metaId: string;
  status: "enviada" | "entregue" | "lida" | "falhou";
  erro: string | null;
}

export interface WebhookNormalizado {
  eventos: EventoConversa[];
  statuses: StatusEntrega[];
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : typeof v === "number" ? String(v) : null;
}

// Instagram manda timestamp em milissegundos; WhatsApp, em segundos (como string).
function isoDe(ts: unknown, emSegundos: boolean): string {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(emSegundos ? n * 1000 : n).toISOString();
}

// ---------------------------------------------------------------- assinatura

function hexParaBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

// X-Hub-Signature-256: "sha256=" + HMAC-SHA256(corpo cru, segredo do app).
// O Instagram Login assina com o segredo do app do Instagram, o WhatsApp com o segredo do
// app da Meta: por isso aceita uma lista e passa se qualquer um bater.
export async function assinaturaValida(
  corpo: string,
  cabecalho: string | null,
  segredos: (string | undefined)[],
): Promise<boolean> {
  if (!cabecalho?.startsWith("sha256=")) return false;
  const recebida = hexParaBytes(cabecalho.slice(7));
  if (!recebida) return false;

  const enc = new TextEncoder();
  for (const segredo of segredos) {
    if (!segredo) continue;
    const chave = await crypto.subtle.importKey(
      "raw",
      enc.encode(segredo),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const esperada = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(corpo)));
    if (esperada.length !== recebida.length) continue;
    let diff = 0;
    for (let i = 0; i < esperada.length; i++) diff |= esperada[i] ^ recebida[i];
    if (diff === 0) return true;
  }
  return false;
}

// ---------------------------------------------------------------- Instagram

const TIPO_ANEXO_IG: Record<string, TipoMensagem> = {
  image: "imagem",
  video: "video",
  audio: "audio",
  file: "arquivo",
  story_mention: "story_mencao",
  ig_reel: "video",
  reel: "video",
  share: "outro",
};

function mensagemInstagram(evento: Obj): EventoConversa | null {
  const remetente = str(obj(evento.sender).id);
  const destinatario = str(obj(evento.recipient).id);
  // Direct real vem em milissegundos; o botão "Teste" do painel da Meta manda em segundos.
  const ts = Number(evento.timestamp);
  const quando = isoDe(evento.timestamp, Number.isFinite(ts) && ts < 1e12);

  // Botão tocado (quick reply sem texto ou postback de ice breaker).
  const postback = obj(evento.postback);
  if (str(postback.mid) && remetente) {
    return {
      canal: "instagram",
      externoId: remetente,
      nome: null,
      username: null,
      mensagem: {
        metaId: str(postback.mid)!,
        direcao: "entrada",
        tipo: "botao",
        texto: str(postback.title),
        midia: null,
        dados: { payload: str(postback.payload) },
        abreJanela: true,
        quando,
      },
    };
  }

  const m = obj(evento.message);
  const mid = str(m.mid);
  if (!mid || m.is_deleted === true || m.is_unsupported === true) return null;

  // Eco = mensagem que saiu da conta da Pólia (pelo CRM, pelo celular ou pelo ManyChat).
  // A pessoa é o destinatário. Gravar o eco mantém a conversa inteira no CRM.
  const eco = m.is_echo === true;
  const externoId = eco ? destinatario : remetente;
  if (!externoId) return null;

  const anexo = obj(arr(m.attachments)[0]);
  const tipoAnexo = str(anexo.type);
  const urlAnexo = str(obj(anexo.payload).url);
  const storyResposta = obj(obj(m.reply_to).story);

  let tipo: TipoMensagem = "texto";
  if (tipoAnexo) tipo = TIPO_ANEXO_IG[tipoAnexo] ?? "outro";
  else if (str(storyResposta.id)) tipo = "story_resposta";
  if (str(obj(m.quick_reply).payload)) tipo = "botao";

  const dados: Obj = {};
  if (str(storyResposta.url)) dados.story_url = str(storyResposta.url);
  if (str(storyResposta.id)) dados.story_id = str(storyResposta.id);
  if (str(obj(m.quick_reply).payload)) dados.payload = str(obj(m.quick_reply).payload);
  if (tipoAnexo === "share" && urlAnexo) dados.link = urlAnexo;

  const guardaMidia = urlAnexo && tipoAnexo !== "share";
  return {
    canal: "instagram",
    externoId,
    nome: null,
    username: null,
    mensagem: {
      metaId: mid,
      direcao: eco ? "saida" : "entrada",
      tipo,
      texto: str(m.text),
      midia: guardaMidia ? { url: urlAnexo! } : null,
      dados,
      abreJanela: !eco,
      quando,
    },
  };
}

function comentarioInstagram(valor: Obj, contaId: string | null): EventoConversa | null {
  const de = obj(valor.from);
  const autor = str(de.id);
  const id = str(valor.id);
  if (!autor || !id) return null;
  // Comentário da própria conta (resposta pública da Pólia) não vira conversa.
  if (contaId && autor === contaId) return null;

  const media = obj(valor.media);
  return {
    canal: "instagram",
    externoId: autor,
    nome: null,
    username: str(de.username),
    mensagem: {
      metaId: `comentario:${id}`,
      direcao: "entrada",
      tipo: "comentario",
      texto: str(valor.text),
      midia: null,
      dados: {
        comment_id: id,
        media_id: str(media.id),
        media_tipo: str(media.media_product_type),
        parent_id: str(valor.parent_id),
      },
      abreJanela: false,
      quando: new Date().toISOString(),
    },
  };
}

// ---------------------------------------------------------------- WhatsApp

const TIPO_WA: Record<string, TipoMensagem> = {
  text: "texto",
  image: "imagem",
  video: "video",
  audio: "audio",
  voice: "audio",
  document: "arquivo",
  sticker: "figurinha",
  reaction: "reacao",
  button: "botao",
  interactive: "botao",
};

function mensagemWhatsapp(m: Obj, nomes: Map<string, string>): EventoConversa | null {
  const de = str(m.from);
  const id = str(m.id);
  if (!de || !id) return null;

  const tipoBruto = str(m.type) ?? "unknown";
  const tipo = TIPO_WA[tipoBruto] ?? "outro";
  const conteudo = obj(m[tipoBruto]);

  let texto: string | null = null;
  const dados: Obj = {};
  if (tipoBruto === "text") texto = str(obj(m.text).body);
  else if (tipoBruto === "button") {
    texto = str(obj(m.button).text);
    dados.payload = str(obj(m.button).payload);
  } else if (tipoBruto === "interactive") {
    const resposta = obj(conteudo.button_reply ?? conteudo.list_reply);
    texto = str(resposta.title);
    dados.payload = str(resposta.id);
  } else if (tipoBruto === "reaction") {
    texto = str(conteudo.emoji);
    dados.reage_a = str(conteudo.message_id);
  } else if (tipoBruto === "location") {
    const loc = obj(m.location);
    texto = [str(loc.name), str(loc.address)].filter(Boolean).join(" · ") || "Localização";
    dados.latitude = loc.latitude;
    dados.longitude = loc.longitude;
  } else texto = str(conteudo.caption);

  const contexto = obj(m.context);
  if (str(contexto.id)) dados.responde_a = str(contexto.id);

  const mediaId = ["image", "video", "audio", "voice", "document", "sticker"].includes(tipoBruto)
    ? str(conteudo.id)
    : null;

  return {
    canal: "whatsapp",
    externoId: de,
    nome: nomes.get(de) ?? null,
    username: null,
    mensagem: {
      metaId: id,
      direcao: "entrada",
      tipo,
      texto,
      midia: mediaId
        ? {
            waMediaId: mediaId,
            mime: str(conteudo.mime_type) ?? undefined,
            nome: str(conteudo.filename) ?? undefined,
          }
        : null,
      dados,
      abreJanela: true,
      quando: isoDe(m.timestamp, true),
    },
  };
}

const STATUS_WA: Record<string, StatusEntrega["status"]> = {
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "falhou",
};

function statusWhatsapp(s: Obj): StatusEntrega | null {
  const id = str(s.id);
  const status = STATUS_WA[str(s.status) ?? ""];
  if (!id || !status) return null;
  const erro = obj(arr(s.errors)[0]);
  const descricao = str(obj(erro.error_data).details) ?? str(erro.title) ?? str(erro.message);
  return { metaId: id, status, erro: status === "falhou" ? (descricao ?? "Falhou") : null };
}

// ---------------------------------------------------------------- entrada única

export function normalizarWebhook(payload: unknown): WebhookNormalizado {
  const raiz = obj(payload);
  const eventos: EventoConversa[] = [];
  const statuses: StatusEntrega[] = [];

  if (raiz.object === "instagram") {
    for (const entrada of arr(raiz.entry)) {
      const e = obj(entrada);
      const contaId = str(e.id);
      for (const msg of arr(e.messaging)) {
        const ev = mensagemInstagram(obj(msg));
        if (ev) eventos.push(ev);
      }
      for (const mudanca of arr(e.changes)) {
        const c = obj(mudanca);
        if (c.field === "comments" || c.field === "live_comments") {
          const ev = comentarioInstagram(obj(c.value), contaId);
          if (ev) eventos.push(ev);
        }
        // O botão "Teste" do painel manda a mensagem aqui, em changes, e não em messaging.
        if (c.field === "messages" || c.field === "messaging_postbacks") {
          const ev = mensagemInstagram(obj(c.value));
          if (ev) eventos.push(ev);
        }
      }
    }
  }

  if (raiz.object === "whatsapp_business_account") {
    for (const entrada of arr(raiz.entry)) {
      for (const mudanca of arr(obj(entrada).changes)) {
        const valor = obj(obj(mudanca).value);
        const nomes = new Map<string, string>();
        for (const c of arr(valor.contacts)) {
          const waId = str(obj(c).wa_id);
          const nome = str(obj(obj(c).profile).name);
          if (waId && nome) nomes.set(waId, nome);
        }
        for (const m of arr(valor.messages)) {
          const ev = mensagemWhatsapp(obj(m), nomes);
          if (ev) eventos.push(ev);
        }
        for (const s of arr(valor.statuses)) {
          const st = statusWhatsapp(obj(s));
          if (st) statuses.push(st);
        }
      }
    }
  }

  return { eventos, statuses };
}

// ---------------------------------------------------------------- janela de 24h

export const JANELA_MS = 24 * 60 * 60 * 1000;

export interface Janela {
  aberta: boolean;
  fechaEm: string | null;
}

export function calcularJanela(ultimaEntradaEm: string | null, agora = Date.now()): Janela {
  if (!ultimaEntradaEm) return { aberta: false, fechaEm: null };
  const fecha = new Date(ultimaEntradaEm).getTime() + JANELA_MS;
  return { aberta: fecha > agora, fechaEm: new Date(fecha).toISOString() };
}

// O wa_id de celular do Brasil às vezes vem sem o 9 (conta antiga de WhatsApp).
// Pra achar o contato que já existe no CRM, tenta as duas formas.
export function variantesTelefoneBR(waId: string): string[] {
  const d = waId.replace(/\D/g, "");
  const out = new Set([d]);
  if (d.startsWith("55") && d.length === 12) out.add(`${d.slice(0, 4)}9${d.slice(4)}`);
  if (d.startsWith("55") && d.length === 13 && d[4] === "9")
    out.add(`${d.slice(0, 4)}${d.slice(5)}`);
  return [...out];
}

// Linha curta pra lista de conversas.
export function resumoMensagem(
  tipo: TipoMensagem | "nota" | "sistema",
  texto: string | null,
): string {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  const rotulos: Partial<Record<string, string>> = {
    imagem: "Foto",
    video: "Vídeo",
    audio: "Áudio",
    arquivo: "Arquivo",
    figurinha: "Figurinha",
    story_mencao: "Mencionou a Pólia no story",
    story_resposta: "Respondeu o story",
    comentario: "Comentou",
    reacao: "Reagiu",
  };
  const rotulo = rotulos[tipo];
  if (rotulo && t) return `${rotulo}: ${t}`.slice(0, 140);
  return (t || rotulo || "Mensagem").slice(0, 140);
}
