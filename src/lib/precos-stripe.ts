// Catálogo dos preços vivos da conta Stripe nova (acct_1UBZN2…, desde 03/10/2026).
// Serve de reserva quando o Stripe não responde ao admin (chave vencida ou da
// conta antiga): sem isso o MRR caía pra R$ 0,00 e o plano aparecia como
// "price_1UM…" mesmo com as assinaturas certas no banco. Preço novo no Stripe
// precisa entrar aqui também, senão some da conta quando o Stripe falhar.

export type InfoPreco = { mensal: number; intervalo: string; nome: string };

const CATALOGO: Record<string, { nome: string; valor: number; intervalo: "month" | "year" }> = {
  price_1UMSv1DVrcnQlhIrFxvDWW2V: { nome: "Premium", valor: 2990, intervalo: "month" },
  price_1UMSv1DVrcnQlhIrAyQMWx3w: { nome: "Premium", valor: 29900, intervalo: "year" },
  price_1UMT0MDVrcnQlhIr8GipurBV: { nome: "Pro", valor: 4790, intervalo: "month" },
  price_1UMT0MDVrcnQlhIr8DLe4Thk: { nome: "Pro", valor: 47900, intervalo: "year" },
};

/** Valor mensal em centavos (anual dividido por 12), ou null se o preço não é conhecido. */
export function precoConhecido(priceId: string): InfoPreco | null {
  const p = CATALOGO[priceId];
  if (!p) return null;
  return {
    nome: p.nome,
    intervalo: p.intervalo,
    mensal: p.intervalo === "year" ? Math.round(p.valor / 12) : p.valor,
  };
}
