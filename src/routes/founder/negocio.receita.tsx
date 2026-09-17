import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/negocio/receita")({
  component: () => (
    <EmConstrucao
      titulo="Receita"
      bloco={6}
      descricao="Receita realizada, MRR e evolução por período."
    />
  ),
});
