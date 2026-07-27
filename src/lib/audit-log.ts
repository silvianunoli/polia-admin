import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

// Trilha de auditoria de ações administrativas. RLS só deixa a própria admin
// logada gravar em nome dela mesma — não precisa checar is_admin aqui.
export async function logAcaoAdmin(acao: string, alvo?: string, detalhes?: Record<string, unknown>) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;
    await supabase.from("admin_audit_log").insert({
      admin_id: userData.user.id,
      acao,
      alvo: alvo ?? null,
      detalhes: (detalhes ?? {}) as Json,
    });
  } catch {
    // Log de auditoria nunca pode quebrar a ação que ele está registrando.
  }
}
