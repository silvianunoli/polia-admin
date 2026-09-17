import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/sessoes")({
  component: () => (
    <EmConstrucao
      titulo="Sessões"
      bloco={3}
      descricao="Sessões, por usuária, duração média e mediana, telas por sessão, retorno no mesmo dia e em 7 dias."
    />
  ),
});
