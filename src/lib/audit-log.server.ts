import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

// Versão server-side do log de auditoria — usada dentro de server functions
// que já autenticaram e checaram is_admin.
export async function logAcaoAdminServer(
  adminId: string,
  acao: string,
  alvo?: string,
  detalhes?: Record<string, unknown>,
) {
  try {
    await supabaseAdmin.from("admin_audit_log").insert({
      admin_id: adminId,
      acao,
      alvo: alvo ?? null,
      detalhes: (detalhes ?? {}) as Json,
    });
  } catch {
    // Log de auditoria nunca pode quebrar a ação que ele está registrando.
  }
}
