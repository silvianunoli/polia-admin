import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// integracao_instagram não tem NENHUMA policy de RLS (só service_role acessa),
// então o access_token nunca é lido nem exposto por aqui — essa serverFn só
// devolve os dias até o vencimento, o mínimo que o banner da Feature A precisa.
async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export const obterStatusTokenInstagram = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("integracao_instagram")
      .select("expira_em")
      .eq("id", 1)
      .maybeSingle();
    if (!data?.expira_em) return { diasAteVencer: null };
    const diasAteVencer = Math.ceil(
      (new Date(data.expira_em).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    return { diasAteVencer };
  });
