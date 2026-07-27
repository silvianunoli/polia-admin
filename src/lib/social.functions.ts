import { supabase } from "@/integrations/supabase/client";
import { lintTextoSocial } from "./social-lint.functions";

// Client sem generic <Database> neste app (mesmo padrão pragmático do resto
// do polia-admin) — tipo definido à mão em vez de Tables<"social_posts">.
export interface SocialPost {
  id: string;
  tipo: string;
  pilar: string | null;
  gancho: string | null;
  caption: string;
  alt_text: string[] | null;
  midias: string[];
  status: string;
  origem_criacao: string;
  legenda_por_ia: boolean;
  scheduled_at: string | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  erro: string | null;
  permalink: string | null;
  created_at?: string;
}

export type SocialTipoManual = "feed" | "carrossel" | "story";

const BUCKET = "social";

const TIPOS_IMAGEM = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const TIPOS_VIDEO = ["video/mp4"];
const TAMANHO_MAX_IMAGEM_BYTES = 8 * 1024 * 1024;
const TAMANHO_MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const TOLERANCIA_PROPORCAO = 0.05;

// Nunca usa file.name cru no caminho do Storage (path traversal via "../" ou
// "/" num nome forjado) — só a extensão, validada por allowlist.
function extensaoSeguraSocial(nomeArquivo: string): string {
  const match = nomeArquivo.match(/\.([a-zA-Z0-9]{1,5})$/);
  const ext = match?.[1]?.toLowerCase();
  return ext && /^(jpe?g|png|webp|mp4)$/.test(ext) ? ext : "jpg";
}

/** R3 — quantidade e tipo de arquivo por formato. Checagem síncrona e barata. */
export function validarQuantidadeETipo(tipo: SocialTipoManual, arquivos: File[]): string | null {
  if (tipo === "feed" && arquivos.length !== 1) {
    return "Foto única leva exatamente 1 imagem.";
  }
  if (tipo === "carrossel" && (arquivos.length < 2 || arquivos.length > 10)) {
    return "Carrossel vai de 2 a 10 imagens.";
  }
  if (tipo === "story" && arquivos.length < 1) {
    return "Adiciona ao menos 1 imagem ou vídeo pro story.";
  }

  for (const arquivo of arquivos) {
    const aceitos = tipo === "story" ? [...TIPOS_IMAGEM, ...TIPOS_VIDEO] : TIPOS_IMAGEM;
    if (!aceitos.includes(arquivo.type)) {
      return tipo === "story"
        ? "Essa mídia não serve pro formato. Story: imagem ou vídeo 9:16 (MP4)."
        : "Essa mídia não serve pro formato. Feed e carrossel: imagem 4:5 (1080x1350).";
    }
    const tamanhoMax = arquivo.type.startsWith("video/")
      ? TAMANHO_MAX_VIDEO_BYTES
      : TAMANHO_MAX_IMAGEM_BYTES;
    if (arquivo.size > tamanhoMax) {
      return "Arquivo grande demais. Reduz e envia de novo.";
    }
  }
  return null;
}

// A Graph API do Instagram só processa imagem em JPEG (PNG/webp viram
// "Media ID is not available" na publicação, silenciosamente). O formulário
// aceita os 3 formatos por conveniência de upload, então convertemos aqui.
function converterParaJpeg(arquivo: File): Promise<File> {
  if (arquivo.type === "image/jpeg" || arquivo.type === "image/jpg") {
    return Promise.resolve(arquivo);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Não deu pra converter essa imagem."));
        return;
      }
      // Fundo branco: PNG/webp podem ter transparência, JPEG não tem canal alfa.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            reject(new Error("Não deu pra converter essa imagem."));
            return;
          }
          const nomeBase = arquivo.name.replace(/\.[a-zA-Z0-9]{1,5}$/, "");
          resolve(new File([blob], `${nomeBase}.jpg`, { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.92,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não deu pra converter essa imagem."));
    };
    img.src = url;
  });
}

function obterProporcao(arquivo: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(arquivo);
    if (arquivo.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const proporcao = video.videoWidth / video.videoHeight;
        URL.revokeObjectURL(url);
        resolve(proporcao);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não deu pra ler o vídeo."));
      };
      video.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        const proporcao = img.naturalWidth / img.naturalHeight;
        URL.revokeObjectURL(url);
        resolve(proporcao);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não deu pra ler a imagem."));
      };
      img.src = url;
    }
  });
}

/** R3 — proporção 4:5 (feed/carrossel) ou 9:16 (story). Assíncrona (lê dimensões reais). */
export async function validarProporcao(
  tipo: SocialTipoManual,
  arquivos: File[],
): Promise<string | null> {
  const alvo = tipo === "story" ? 9 / 16 : 4 / 5;
  for (const arquivo of arquivos) {
    let proporcao: number;
    try {
      proporcao = await obterProporcao(arquivo);
    } catch {
      return "Não deu pra ler essa mídia. Tenta outro arquivo.";
    }
    if (Math.abs(proporcao - alvo) > TOLERANCIA_PROPORCAO) {
      return tipo === "story"
        ? "Essa mídia não serve pro formato. Story: imagem ou vídeo 9:16 (MP4)."
        : "Essa mídia não serve pro formato. Feed e carrossel: imagem 4:5 (1080x1350).";
    }
  }
  return null;
}

export interface NovoPostManualInput {
  tipo: SocialTipoManual;
  pilar: string | null;
  caption: string;
  altText: string[];
  arquivos: File[];
}

export interface LintFalhouErro {
  tipo: "lint";
  termo: string;
  trecho: string;
}

export type CriarPostManualResultado =
  | { ok: true; id: string }
  | { ok: false; erro: string | LintFalhouErro };

/** Criação manual (upload direto): pula pauta/copy/revisora — só o lint R1 roda. */
export async function criarPostManual(
  input: NovoPostManualInput,
): Promise<CriarPostManualResultado> {
  const lint = lintTextoSocial(input.caption);
  if (!lint.aprovado) {
    return {
      ok: false,
      erro: { tipo: "lint", termo: lint.violacoes[0].termo, trecho: lint.violacoes[0].trecho },
    };
  }
  if (input.altText.some((alt) => alt.trim().length === 0)) {
    return { ok: false, erro: "Falta o texto alternativo de alguma mídia." };
  }

  const id = crypto.randomUUID();
  const midias: string[] = [];
  for (let i = 0; i < input.arquivos.length; i++) {
    let arquivo = input.arquivos[i];
    if (arquivo.type.startsWith("image/")) {
      try {
        arquivo = await converterParaJpeg(arquivo);
      } catch {
        return { ok: false, erro: "Não deu pra preparar essa imagem. Tenta outro arquivo." };
      }
    }
    const caminho = `${id}/${i}-${crypto.randomUUID()}.${extensaoSeguraSocial(arquivo.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(caminho, arquivo, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      return { ok: false, erro: "A mídia não subiu. Tenta de novo." };
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(caminho);
    midias.push(data.publicUrl);
  }

  const { error: erroInsert } = await supabase.from("social_posts").insert({
    id,
    tipo: input.tipo,
    pilar: input.pilar,
    gancho: input.caption.slice(0, 80),
    caption: input.caption,
    alt_text: input.altText,
    midias,
    status: "rascunho",
    origem_criacao: "manual",
    legenda_por_ia: false,
  });
  if (erroInsert) {
    return { ok: false, erro: "A peça não salvou. Tenta de novo." };
  }
  return { ok: true, id };
}

export interface EditarCaptionResultado {
  ok: boolean;
  erro?: string | LintFalhouErro;
}

/** Toda edição de legenda/alt re-roda o lint (R1) — inclusive texto escrito à mão. */
export async function editarCaptionEAlt(
  post: SocialPost,
  novaCaption: string,
  novoAltText: string[],
): Promise<EditarCaptionResultado> {
  const lint = lintTextoSocial(novaCaption);
  if (!lint.aprovado) {
    return {
      ok: false,
      erro: { tipo: "lint", termo: lint.violacoes[0].termo, trecho: lint.violacoes[0].trecho },
    };
  }
  // Editar peça aprovada rebaixa pra revisado: mudou o texto, mudou o risco (R2).
  const novoStatus =
    post.status === "aprovado" || post.status === "agendado" ? "revisado" : post.status;
  const { error } = await supabase
    .from("social_posts")
    .update({ caption: novaCaption, alt_text: novoAltText, status: novoStatus })
    .eq("id", post.id);
  return { ok: !error, erro: error ? "Não salvou a edição. Tenta de novo." : undefined };
}

export async function marcarRevisado(id: string) {
  return supabase.from("social_posts").update({ status: "revisado" }).eq("id", id);
}

export async function devolverParaRascunho(id: string) {
  return supabase.from("social_posts").update({ status: "rascunho" }).eq("id", id);
}

/** R2 — só aprovação humana (clique) muda o status pra aprovado. */
export async function aprovarPost(id: string) {
  const { data: userData } = await supabase.auth.getUser();
  return supabase
    .from("social_posts")
    .update({
      status: "aprovado",
      aprovado_por: userData.user?.id ?? null,
      aprovado_em: new Date().toISOString(),
    })
    .eq("id", id);
}

export async function agendarPost(id: string, scheduledAtIso: string) {
  return supabase
    .from("social_posts")
    .update({ status: "agendado", scheduled_at: scheduledAtIso })
    .eq("id", id);
}

export async function reagendarPost(id: string, scheduledAtIso: string) {
  return supabase.from("social_posts").update({ scheduled_at: scheduledAtIso }).eq("id", id);
}

/** Cancelar só é permitido até 2 min antes do horário (checagem fica na UI, que já sabe o scheduled_at). */
export async function cancelarAgendamento(id: string) {
  return supabase.from("social_posts").update({ status: "cancelado" }).eq("id", id);
}

/** "Tentar de novo" numa peça que falhou: volta pra aprovado e replica imediatamente (o cron do publisher assume). */
export async function tentarDeNovo(id: string) {
  return supabase
    .from("social_posts")
    .update({ status: "aprovado", scheduled_at: new Date().toISOString(), erro: null })
    .eq("id", id);
}

export async function excluirPost(id: string) {
  return supabase.from("social_posts").delete().eq("id", id);
}
