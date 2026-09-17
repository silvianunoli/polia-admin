import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/features/experimentos")({
  component: () => (
    <EmConstrucao
      titulo="Experimentos"
      bloco={5}
      descricao="Configuração dos experimentos: hipótese, flag, variantes e métrica alvo."
    />
  ),
});
