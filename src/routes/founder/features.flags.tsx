import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/features/flags")({
  component: () => (
    <EmConstrucao
      titulo="Feature Flags"
      bloco={4}
      descricao="Ligar, desligar e fazer rollout gradual por ambiente, com histórico de quem mudou o quê."
    />
  ),
});
