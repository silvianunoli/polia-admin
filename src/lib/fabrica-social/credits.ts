/*
  Modelo de monetização — assinatura + créditos por ação, como o BestContent.
  Valores replicados dos fallbacks confirmados no bundle. Em produção esses
  números viriam das tabelas plan_config (planos) e credit_pricing (ações),
  com o código caindo neste fallback só se a consulta vier vazia.
*/

export type PlanKey = "freemium" | "basic" | "pro" | "max" | "enterprise";

export interface PlanConfig {
  key: PlanKey;
  name: string;
  creditsPerMonth: number;
  brands: number | null; // null = ilimitado
  teamMembers: number | null;
  slidesPerCarousel: number;
  canSchedule: boolean;
  priceMonthly: number | null;
}

export const PLANS: Record<PlanKey, PlanConfig> = {
  freemium: {
    key: "freemium",
    name: "Freemium",
    creditsPerMonth: 25,
    brands: 1,
    teamMembers: 1,
    slidesPerCarousel: 5,
    canSchedule: false,
    priceMonthly: 0,
  },
  basic: {
    key: "basic",
    name: "Basic",
    creditsPerMonth: 200,
    brands: 2,
    teamMembers: 1,
    slidesPerCarousel: 10,
    canSchedule: false,
    priceMonthly: 29.9,
  },
  pro: {
    key: "pro",
    name: "Pro",
    creditsPerMonth: 800,
    brands: 5,
    teamMembers: 1,
    slidesPerCarousel: 10,
    canSchedule: true,
    priceMonthly: 69.9,
  },
  max: {
    key: "max",
    name: "MAX",
    creditsPerMonth: 1800,
    brands: 20,
    teamMembers: 5,
    slidesPerCarousel: 20,
    canSchedule: true,
    priceMonthly: 129.9,
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    creditsPerMonth: 0,
    brands: null,
    teamMembers: null,
    slidesPerCarousel: 20,
    canSchedule: true,
    priceMonthly: null,
  },
};

/** Custo em créditos por ação (tabela credit_pricing → fallback). */
export const CREDIT_COST = {
  generate_post: 15,
  generate_template: 9,
  generate_inspiration: 2,
  generate_calendar: 2,
  enhance_prompt: 0,
  edit_post: 2,
  editor_chat: 1,
  video_per_image: 3,
  tts_narration: 1,
} as const;

export type CreditAction = keyof typeof CREDIT_COST;

export const ACTION_LABEL: Record<CreditAction, string> = {
  generate_post: "Gerar post",
  generate_template: "Gerar com template",
  generate_inspiration: "Gerar inspiração",
  generate_calendar: "Gerar calendário",
  enhance_prompt: "Melhorar prompt",
  edit_post: "Editar post",
  editor_chat: "Chat do editor",
  video_per_image: "Vídeo IA (por imagem)",
  tts_narration: "Narração TTS",
};

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
