import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import kanbanHtml from "./boards/kanban-operacional.html?raw";
import estrategicoHtml from "./boards/gerenciamento-estrategico.html?raw";

// O conteúdo dos dois boards só existe dentro do bundle do servidor (import
// ?raw num arquivo consumido só por server functions, nunca por componente
// client). Servido por RPC autenticado em vez de asset estático: um HTML de
// public/ seria entregue pelo ASSETS binding sem passar pelo guard de auth
// (client-side, via __root.tsx) -- exatamente a classe de exposição que o
// GRW-05 achou em /central no polia-app.
async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export const buscarHtmlKanban = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return kanbanHtml;
  });

export const buscarHtmlEstrategico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return estrategicoHtml;
  });
