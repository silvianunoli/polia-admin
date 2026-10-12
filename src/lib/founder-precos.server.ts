import { stripeClient } from "@/lib/stripe.functions";
import { precoConhecido, type InfoPreco } from "@/lib/precos-stripe";

// Preço mensal de um price_id, usado por todo MRR do founder (Visão geral,
// Receita, Assinaturas). Era escrito duas vezes até 11/10/2026 (FND-09).

const cachePreco = new Map<string, InfoPreco>();
export async function infoPreco(priceId: string): Promise<InfoPreco> {
  const c = cachePreco.get(priceId);
  if (c) return c;
  try {
    const price = await stripeClient().prices.retrieve(priceId, { expand: ["product"] });
    const valor = price.unit_amount ?? 0;
    const intervalo = price.recurring?.interval ?? "month";
    const nome =
      typeof price.product === "object" && price.product && "name" in price.product
        ? (price.product as { name: string }).name
        : (price.nickname ?? priceId);
    const info = { mensal: intervalo === "year" ? Math.round(valor / 12) : valor, intervalo, nome };
    cachePreco.set(priceId, info);
    return info;
  } catch {
    // Stripe fora (ex.: chave do admin vencida): o catálogo local mantém MRR e nome do plano.
    const conhecido = precoConhecido(priceId);
    if (conhecido) {
      cachePreco.set(priceId, conhecido);
      return conhecido;
    }
    return { mensal: 0, intervalo: "desconhecido", nome: priceId };
  }
}
