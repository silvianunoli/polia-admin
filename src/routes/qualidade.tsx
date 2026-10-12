import { createFileRoute, redirect } from "@tanstack/react-router";

// Tela antiga apagada em 11/10/2026 (FND-09): repetia o Founder Dashboard com
// fontes velhas (eventos_analytics, alertas_abertos, profiles.updated_at como
// "ativa"). Link velho cai em Operação › Erros do founder.
export const Route = createFileRoute("/qualidade")({
  beforeLoad: () => {
    throw redirect({ to: "/founder/operacao/erros", search: { periodo: "7" } });
  },
});
