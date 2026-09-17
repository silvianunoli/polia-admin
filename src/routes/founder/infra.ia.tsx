import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/infra/ia")({
  component: () => (
    <EmConstrucao
      titulo="IA"
      bloco={6}
      descricao="Chamadas, falhas, latência e custo estimado por modelo."
    />
  ),
});
