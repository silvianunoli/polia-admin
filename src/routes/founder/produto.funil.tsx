import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/produto/funil")({
  component: () => (
    <EmConstrucao
      titulo="Funil de produto"
      bloco={5}
      descricao="Retenção por coorte e retorno em 1, 7 e 30 dias."
    />
  ),
});
