import { createFileRoute, redirect } from "@tanstack/react-router";

// Tela antiga apagada em 11/10/2026 (FND-09): repetia o Founder Dashboard com
// fontes velhas (eventos_analytics, alertas_abertos, profiles.updated_at como
// "ativa"). Link velho cai em os Alertas do founder (founder_alertas, gerados pelo monitor).
export const Route = createFileRoute("/alertas")({
  beforeLoad: () => {
    throw redirect({ to: "/founder/alertas", search: { periodo: "7" } });
  },
});
