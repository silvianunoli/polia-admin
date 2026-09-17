import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/segmentos")({
  component: () => (
    <EmConstrucao
      titulo="Segmentos"
      bloco={3}
      descricao="Ativas, pagantes sem uso, abandonaram, altamente engajadas, em risco, e uso cruzado com assinatura."
    />
  ),
});
