import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { PLANOS_CONVITE, type PlanoConvite } from "@/lib/planos-convite";

// CRM-10 (08/10/2026): mudar plano ou acesso de administradora de quem JÁ tem
// conta. Até aqui isso era feito à mão no banco, porque o convite só vale no
// nascimento da conta (ver atualizarAcessoDoConvite em convites.functions.ts).
//
// Usa supabaseAdmin (profiles.plano e is_admin não são editáveis pela própria
// usuária), então assertAdmin é a única trava e roda ANTES de qualquer leitura.
//
// Limite que a tela avisa: o webhook do Stripe também escreve profiles.plano.
// Quem tem assinatura e cancela volta pra 'cancelada' e a concessão daqui se
// perde. Mudar o plano aqui não mexe na cobrança.

const idInput = z.object({ userId: z.string().uuid() });

const acessoInput = idInput.extend({
  plano: z.enum(PLANOS_CONVITE.map((p) => p.valor) as [PlanoConvite, ...PlanoConvite[]]),
  is_admin: z.boolean(),
});

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export interface AcessoDaUsuaria {
  plano: string | null;
  is_admin: boolean;
  /** Assinatura mais recente no Stripe. null = nunca assinou. */
  assinatura: { status: string; cancel_at_period_end: boolean } | null;
}

export const lerAcessoDaUsuaria = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }): Promise<AcessoDaUsuaria> => {
    await assertAdmin(context.userId);

    const { data: perfil, error } = await supabaseAdmin
      .from("profiles")
      .select("plano, is_admin")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error("Falha ao ler o acesso dessa usuária.");
    if (!perfil) throw new Error("Não achei essa usuária.");

    const { data: assinatura } = await supabaseAdmin
      .from("assinaturas")
      .select("status, cancel_at_period_end")
      .eq("user_id", data.userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const p = perfil as { plano: string | null; is_admin: boolean | null };
    const a = assinatura as { status: string; cancel_at_period_end: boolean | null } | null;
    return {
      plano: p.plano,
      is_admin: Boolean(p.is_admin),
      assinatura: a
        ? { status: a.status, cancel_at_period_end: Boolean(a.cancel_at_period_end) }
        : null,
    };
  });

export const atualizarAcessoDaUsuaria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => acessoInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    // Tirar o próprio admin trancaria quem está mexendo pra fora do office no
    // meio da ação. Se precisar, outra administradora faz.
    if (context.userId === data.userId && !data.is_admin) {
      throw new Error(
        "O seu próprio acesso de administradora não sai por aqui. Outra administradora pode tirar.",
      );
    }

    const { data: antes } = await supabaseAdmin
      .from("profiles")
      .select("plano, is_admin")
      .eq("id", data.userId)
      .maybeSingle();
    if (!antes) throw new Error("Não achei essa usuária.");
    const anterior = antes as { plano: string | null; is_admin: boolean | null };

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ plano: data.plano, is_admin: data.is_admin })
      .eq("id", data.userId);
    if (error) throw new Error("Falha ao mudar o acesso dessa usuária.");

    // Mexer em is_admin (dar ou tirar) tem ação própria no log, igual ao convite.
    const mexeuNoAdmin = Boolean(anterior.is_admin) !== data.is_admin;
    await logAcaoAdminServer(
      context.userId,
      mexeuNoAdmin ? "usuaria_acesso_admin" : "usuaria_acesso",
      `${data.userId} · plano ${data.plano}`,
      {
        antes: { plano: anterior.plano, is_admin: Boolean(anterior.is_admin) },
        depois: { plano: data.plano, is_admin: data.is_admin },
      },
    );
    return { ok: true };
  });
