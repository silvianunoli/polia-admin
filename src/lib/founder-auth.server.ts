import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Todo server fn do Founder Dashboard passa por aqui depois do
// requireSupabaseAuth: o middleware só garante JWT válido, não que é admin.
export async function assertAdmin(userId: string): Promise<void> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}
