import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/infra/banco")({
  component: () => (
    <EmConstrucao
      titulo="Banco de dados"
      bloco={6}
      descricao="Tamanho, conexões, tabelas maiores e consultas lentas."
    />
  ),
});
