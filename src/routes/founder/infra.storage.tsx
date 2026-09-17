import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/infra/storage")({
  component: () => (
    <EmConstrucao titulo="Storage" bloco={6} descricao="Uso por bucket, crescimento e erros." />
  ),
});
