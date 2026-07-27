import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stripeClient } from "@/lib/stripe.functions";

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

const STATUS_ATIVOS = ["active", "trialing", "past_due"];

export interface PlanoResumo {
  priceId: string;
  plano: "mensal" | "anual" | "desconhecido";
  quantidade: number;
  valorMensalCentavos: number;
}

export const getResumoMonetizacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: assinaturas } = await supabaseAdmin
      .from("assinaturas" as never)
      .select("price_id, status")
      .in("status", STATUS_ATIVOS);

    const rows = (assinaturas ?? []) as { price_id: string; status: string }[];
    const porPriceId = new Map<string, number>();
    rows.forEach((r) => porPriceId.set(r.price_id, (porPriceId.get(r.price_id) ?? 0) + 1));

    const priceIdMensal = process.env.STRIPE_PRICE_ID_MENSAL;
    const priceIdAnual = process.env.STRIPE_PRICE_ID_ANUAL;

    const stripe = stripeClient();
    const porPlano: PlanoResumo[] = [];
    for (const [priceId, quantidade] of porPriceId.entries()) {
      let valorMensalCentavos = 0;
      let plano: PlanoResumo["plano"] = "desconhecido";
      try {
        const price = await stripe.prices.retrieve(priceId);
        const valor = price.unit_amount ?? 0;
        if (priceId === priceIdAnual) {
          plano = "anual";
          valorMensalCentavos = Math.round(valor / 12);
        } else if (priceId === priceIdMensal) {
          plano = "mensal";
          valorMensalCentavos = valor;
        } else {
          valorMensalCentavos = valor;
        }
      } catch (err) {
        console.error(`[Negócio] Falha ao buscar price ${priceId} no Stripe:`, err);
      }
      porPlano.push({ priceId, plano, quantidade, valorMensalCentavos });
    }

    const mrrCentavos = porPlano.reduce((s, p) => s + p.valorMensalCentavos * p.quantidade, 0);
    const assinantesAtivas = rows.length;

    return { mrrCentavos, assinantesAtivas, porPlano };
  });
