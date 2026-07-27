import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export const buscarUsuariaPorEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ email: z.string().trim().toLowerCase() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: usersPage, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error("Falha ao buscar usuária.");
    const user = usersPage.users.find((u) => u.email?.toLowerCase() === data.email);
    if (!user) return { encontrada: false as const };

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("id", user.id)
      .maybeSingle();

    return {
      encontrada: true as const,
      id: user.id,
      email: user.email ?? "",
      nome: profile?.full_name ?? "—",
    };
  });
