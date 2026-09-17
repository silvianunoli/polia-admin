import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/operacao/erros")({
  component: () => (
    <EmConstrucao
      titulo="Erros"
      bloco={6}
      descricao="Erros do app (client e server) por página e origem, com contexto."
    />
  ),
});
