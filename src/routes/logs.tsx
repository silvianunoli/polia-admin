import { createFileRoute, redirect } from "@tanstack/react-router";

// Tela antiga apagada em 11/10/2026 (FND-09): repetia o Founder Dashboard com
// fontes velhas (eventos_analytics, alertas_abertos, profiles.updated_at como
// "ativa"). Link velho cai em Operação › Logs do founder.
export const Route = createFileRoute("/logs")({
  beforeLoad: () => {
    throw redirect({ to: "/founder/operacao/logs", search: { periodo: "7" } });
  },
});
