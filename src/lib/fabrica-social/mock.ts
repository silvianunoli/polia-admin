/*
  Dados mock espelhando as tabelas centrais do modelo de dados original:
  posts, brands, calendar_entries, inspirations, credit_transactions,
  portal_calendars, brand_members. Em produção viriam do Postgres via
  PostgREST (supabase.from(...)).
*/

import type { PlanKey } from "./credits";
import type { Platform } from "./formats";

/**
 * Briefing de design da marca. Alimenta as duas pontas da geração: entra no
 * prompt (pose, cenário, humor, palavras proibidas) e filtra quais templates
 * do catálogo aquela marca pode receber.
 */
export interface BrandBrief {
  photo_grade?: string;
  /**
   * Direção de cena da FOTO (expressão, styling, clima). Vai só para o gerador
   * de imagem — até 07/08/2026 ia, errado, para o prompt de texto.
   */
  mood?: string;
  signature?: string;
  /**
   * Dossiê da cliente: voz, posição e identidade visual. Preenchido UMA vez por
   * cliente e injetado em todas as etapas de todos os pipelines. É a peça mais
   * importante do briefing — dossiê raso produz conteúdo genérico por melhor que
   * seja o pipeline.
   */
  dossier?: string;
  /**
   * Um pipeline por família de formato. Cada um descreve as etapas em ordem
   * (estratégia → copy → layout/direção/spec) e é injetado só quando o formato
   * pedido pertence àquela família — ver `pipelineFor()` em lib/pipelines.ts.
   *
   * O contrato JSON (nomes dos campos que a engine lê) continua no código: aqui
   * entra direção, nunca estrutura de dados, senão uma edição inocente quebra
   * a geração inteira.
   */
  pipelines?: { carrossel?: string; foto_unica?: string; story?: string };

  /** @deprecated migrados para `dossier` em 07/08/2026. Só leitura de dados antigos. */
  facts?: string;
  /** @deprecated migrado para `dossier` em 07/08/2026. */
  voice_examples?: string;
  /** @deprecated migrados para `pipelines` em 07/08/2026. */
  prompts?: { caption?: string; slides?: string; cta?: string };
  character?: {
    name?: string;
    pose_style?: string;
    /** cenários permitidos */
    settings_prompt?: string;
    /** figurino permitido — separado do cenário de propósito */
    wardrobe_prompt?: string;
  };
  pet?: { name?: string; pose_style?: string };
  banned_words?: string[];
  /** CTAs por intenção do post: comentar, salvar, compartilhar, vender, divulgar */
  cta_library?: Record<string, string[]>;
  allowed_templates?: string[];
}

export interface Brand {
  id: string;
  name: string;
  emoji: string;
  sector: string;
  toneOfVoice: string;
  colors: string[];
  instagramHandle?: string;
  /** true = marca de demonstração (sem dono): não pode ser editada/excluída */
  isDemo: boolean;
  brief: BrandBrief;
  /** quantos retratos de referência existem para personagem e pet */
  characterRefs: number;
  petRefs: number;
}

export type PostStatus = "draft" | "scheduled" | "published" | "generating";
export type ApprovalState = "pending" | "approved" | "adjust";

export interface Post {
  id: string;
  brandId: string;
  title: string;
  caption: string;
  formatId: string;
  platforms: Platform[];
  status: PostStatus;
  scheduledFor?: string;
  approvalState?: ApprovalState;
  clientComment?: string;
  /** Estado do canvas (formato fabricJSON, como no original) — slides reeditáveis */
  fabricJson?: unknown;
  /**
   * Roteiro de gravação, só nos stories. A arte desenha o texto na tela; fala,
   * sticker, duração e instrução de gravação não cabem nela.
   */
  script?: string;
  /** Arte renderizada (PNG público) — exigida para publicar no Instagram */
  imageUrl?: string;
  /** Vídeo (reels, ou story em vídeo) — mesmo papel que imageUrl pra mídia de vídeo. */
  videoUrl?: string;
  /**
   * Só existe em post de upload manual (Criar postagem/edição leve). Post
   * gerado pela engine vem null e o publicador decide pela contagem de
   * slides — não dava pra preencher retroativamente sem inventar dado.
   */
  mediaType?: "image" | "carousel" | "reels" | "story" | null;
  publishError?: string;
  /** Falhas de publicação. O cron para em 2; publicar na mão zera. */
  publishAttempts?: number;
  /**
   * Resultado por destino (instagram, tiktok). É o que impede a retentativa de
   * republicar onde já saiu. `privacy` só no TikTok: antes da auditoria do app,
   * o post sai como SELF_ONLY — só o dono da conta vê.
   */
  publishResults?: Record<
    string,
    { ok: boolean; at?: string; id?: string; privacy?: string; error?: string }
  >;
  /** true = post de demonstração (sem dono), somente leitura */
  isDemo: boolean;
  createdAt: string;
}

export interface CalendarEntry {
  id: string;
  brandId: string;
  date: string; // yyyy-mm-dd
  title: string;
  /** Ângulo da pauta: o que o post defende. Vai inteiro para a geração. */
  summary?: string;
  /** Formato planejado (carrossel-portrait, post-quadrado, stories-unico…). */
  formatId?: string;
  /** Intenção: comentar | salvar | compartilhar | vender | divulgar */
  objective?: string;
  postId?: string;
  platforms: Platform[];
}

export interface InspirationSource {
  id: string;
  brandId: string;
  type: "website" | "web_search" | "youtube" | "pdf" | "txt" | "instagram";
  label: string;
  /** Caminho no bucket privado `inspiration-files` quando o PDF/TXT veio de upload. */
  filePath?: string;
  frequency?: "daily" | "twice_daily" | "weekly"; // recorrentes: website, web_search, instagram
}

export interface Inspiration {
  id: string;
  brandId: string;
  title: string;
  summary: string;
  sourceLabel: string;
}

export interface CreditTransaction {
  id: string;
  date: string;
  action: string;
  amount: number; // negativo = consumo
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "editor" | "viewer";
}

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  plan: PlanKey;
  credits: number;
}

export const currentUser: CurrentUser = {
  id: "user-1",
  name: "Silvia",
  email: "oi.silvianunoli@gmail.com",
  plan: "pro",
  credits: 612,
};

export const brands: Brand[] = [
  {
    id: "brand-1",
    name: "Estúdio Aurora",
    emoji: "🌅",
    sector: "Design & Branding",
    toneOfVoice: "Inspirador, próximo, direto",
    colors: ["#E8590C", "#FFF4E6", "#343A40"],
    instagramHandle: "@estudioaurora",
    isDemo: true,
    brief: {},
    characterRefs: 0,
    petRefs: 0,
  },
  {
    id: "brand-2",
    name: "Nutri Vida Leve",
    emoji: "🥗",
    sector: "Nutrição",
    toneOfVoice: "Acolhedor, científico sem jargão",
    colors: ["#2F9E44", "#EBFBEE", "#212529"],
    instagramHandle: "@nutrividaleve",
    isDemo: true,
    brief: {},
    characterRefs: 0,
    petRefs: 0,
  },
  {
    id: "brand-3",
    name: "Advocacia Prisma",
    emoji: "⚖️",
    sector: "Jurídico",
    toneOfVoice: "Autoridade acessível",
    colors: ["#1971C2", "#E7F5FF", "#212529"],
    isDemo: true,
    brief: {},
    characterRefs: 0,
    petRefs: 0,
  },
];

export const posts: Post[] = [
  {
    id: "post-1",
    brandId: "brand-1",
    title: "5 tendências de branding para 2027",
    caption: "O que separa marcas lembradas de marcas ignoradas? 🧵 Arrasta pro lado…",
    formatId: "carrossel-portrait",
    platforms: ["instagram", "linkedin"],
    status: "scheduled",
    scheduledFor: "2026-08-07T18:00:00",
    approvalState: "approved",
    isDemo: true,
    createdAt: "2026-08-03T10:12:00",
  },
  {
    id: "post-2",
    brandId: "brand-1",
    title: "Bastidores do rebranding da semana",
    caption: "Todo rebranding começa com uma pergunta incômoda…",
    formatId: "reels",
    platforms: ["instagram", "tiktok"],
    status: "draft",
    approvalState: "adjust",
    clientComment: "Trocar a trilha sonora, ficou muito agitada.",
    isDemo: true,
    createdAt: "2026-08-04T15:40:00",
  },
  {
    id: "post-3",
    brandId: "brand-2",
    title: "Mito ou verdade: jejum intermitente",
    caption: "Spoiler: depende do SEU contexto. Salva esse post 📌",
    formatId: "post-quadrado",
    platforms: ["instagram", "facebook"],
    status: "published",
    isDemo: true,
    createdAt: "2026-08-01T09:00:00",
  },
  {
    id: "post-4",
    brandId: "brand-2",
    title: "Semana da alimentação consciente",
    caption: "7 dias, 7 trocas simples. Dia 1: …",
    formatId: "stories-carrossel",
    platforms: ["instagram", "whatsapp"],
    status: "scheduled",
    scheduledFor: "2026-08-10T08:00:00",
    approvalState: "pending",
    isDemo: true,
    createdAt: "2026-08-05T08:30:00",
  },
  {
    id: "post-5",
    brandId: "brand-3",
    title: "O que muda com a nova lei de proteção de dados",
    caption: "Sua empresa está pronta? Os 3 pontos que ninguém explica direito.",
    formatId: "post-landscape",
    platforms: ["linkedin", "twitter"],
    status: "generating",
    isDemo: true,
    createdAt: "2026-08-05T11:05:00",
  },
];

export const calendarEntries: CalendarEntry[] = [
  {
    id: "cal-1",
    brandId: "brand-1",
    date: "2026-08-07",
    title: "Tendências de branding",
    postId: "post-1",
    platforms: ["instagram", "linkedin"],
  },
  {
    id: "cal-2",
    brandId: "brand-1",
    date: "2026-08-12",
    title: "Depoimento de cliente",
    platforms: ["instagram"],
  },
  {
    id: "cal-3",
    brandId: "brand-2",
    date: "2026-08-10",
    title: "Semana alimentação consciente",
    postId: "post-4",
    platforms: ["instagram", "whatsapp"],
  },
  {
    id: "cal-4",
    brandId: "brand-2",
    date: "2026-08-15",
    title: "Receita rápida de quinta",
    platforms: ["instagram"],
  },
  {
    id: "cal-5",
    brandId: "brand-3",
    date: "2026-08-11",
    title: "Nova lei de dados — parte 2",
    platforms: ["linkedin"],
  },
  {
    id: "cal-6",
    brandId: "brand-1",
    date: "2026-08-20",
    title: "Dia do publicitário 🎉",
    platforms: ["instagram", "facebook"],
  },
];

export const inspirationSources: InspirationSource[] = [
  {
    id: "src-1",
    brandId: "brand-1",
    type: "web_search",
    label: "branding + IA (busca web)",
    frequency: "daily",
  },
  {
    id: "src-2",
    brandId: "brand-1",
    type: "website",
    label: "blog.designculture.com.br",
    frequency: "weekly",
  },
  { id: "src-3", brandId: "brand-2", type: "youtube", label: "Vídeo: Guia de rotulagem 2026" },
  { id: "src-4", brandId: "brand-3", type: "pdf", label: "Cartilha LGPD para PMEs.pdf" },
];

export const inspirations: Inspiration[] = [
  {
    id: "insp-1",
    brandId: "brand-1",
    title: "Marcas estão trocando manuais por 'brand OS'",
    summary: "Movimento de transformar guidelines estáticos em sistemas vivos versionados.",
    sourceLabel: "busca web · hoje",
  },
  {
    id: "insp-2",
    brandId: "brand-1",
    title: "Tipografia variável dominou os rebrands de julho",
    summary: "12 dos 20 maiores rebrands do mês usaram fontes variáveis.",
    sourceLabel: "busca web · hoje",
  },
  {
    id: "insp-3",
    brandId: "brand-2",
    title: "Rotulagem frontal: o que muda em outubro",
    summary: "Nova fase da norma entra em vigor — oportunidade de série educativa.",
    sourceLabel: "YouTube · ontem",
  },
];

export const creditTransactions: CreditTransaction[] = [
  { id: "tx-1", date: "2026-08-05", action: "Gerar post (Advocacia Prisma)", amount: -15 },
  { id: "tx-2", date: "2026-08-04", action: "Editar post (Estúdio Aurora)", amount: -2 },
  { id: "tx-3", date: "2026-08-04", action: "Gerar inspiração diária", amount: -2 },
  { id: "tx-4", date: "2026-08-03", action: "Gerar post (Estúdio Aurora)", amount: -15 },
  { id: "tx-5", date: "2026-08-01", action: "Renovação mensal — plano Pro", amount: 800 },
];

export const teamMembers: TeamMember[] = [
  { id: "tm-1", name: "Silvia", email: "oi.silvianunoli@gmail.com", role: "owner" },
];
