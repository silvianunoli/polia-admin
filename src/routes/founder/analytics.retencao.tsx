import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/retencao")({
  component: () => (
    <EmConstrucao
      titulo="Retenção"
      bloco={3}
      descricao="Retenção por coorte semanal e retorno em D1, D7 e D30."
    />
  ),
});
