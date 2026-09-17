import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/produto/experimentos")({
  component: () => (
    <EmConstrucao
      titulo="Experimentos"
      bloco={5}
      descricao="Resultados dos experimentos em andamento, por variante."
    />
  ),
});
