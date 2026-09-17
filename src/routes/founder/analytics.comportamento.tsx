import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/comportamento")({
  component: () => (
    <EmConstrucao
      titulo="Comportamento"
      bloco={3}
      descricao="Quando as usuárias usam: mapa de calor por dia da semana e hora."
    />
  ),
});
