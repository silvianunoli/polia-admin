import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/infra/api")({
  component: () => (
    <EmConstrucao
      titulo="API"
      bloco={6}
      descricao="Requisições, taxa de erro, p95 e p99 das funções do produto."
    />
  ),
});
