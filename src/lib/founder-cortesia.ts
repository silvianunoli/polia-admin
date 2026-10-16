// Cortesia (cupom de 100%, campanha UGC, 16/10/2026): o stripe-webhook do
// polia-app grava propriedades.cortesia = true em subscription_started,
// subscription_cancelled e payment_failed quando a assinatura é cortesia. Os
// contadores do Founder Dashboard tiram esses eventos: não é venda, churn nem
// inadimplência.
export function eventoDeCortesia(e: { propriedades?: unknown }): boolean {
  const p = e.propriedades;
  return typeof p === "object" && p !== null && (p as Record<string, unknown>).cortesia === true;
}
