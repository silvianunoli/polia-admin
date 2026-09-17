import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/produto/ativacao")({
  component: () => (
    <EmConstrucao
      titulo="Ativação"
      bloco={5}
      descricao="Taxa de ativação, funil de onboarding e tempo até o primeiro valor."
    />
  ),
});
