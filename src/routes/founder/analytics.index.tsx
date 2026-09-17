import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/")({
  component: () => (
    <EmConstrucao
      titulo="Visão geral de uso"
      bloco={3}
      descricao="Total, acessaram hoje, WAU, MAU, novas usuárias e DAU/MAU."
    />
  ),
});
