import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/funcionalidades")({
  component: () => (
    <EmConstrucao
      titulo="Funcionalidades"
      bloco={3}
      descricao="Features mais acessadas (usuárias, acessos, tempo) e features quase sem uso."
    />
  ),
});
