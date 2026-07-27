// Recorte mínimo de src/lib/stripe.functions.ts do polia-app — só o client,
// pro resumo de monetização (MRR). Checkout/webhook continuam só no produto.
import Stripe from "stripe";

let _stripe: Stripe | undefined;

export function stripeClient(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("[Stripe] Missing STRIPE_SECRET_KEY environment variable.");
    throw new Error("Missing STRIPE_SECRET_KEY environment variable.");
  }
  _stripe = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return _stripe;
}
