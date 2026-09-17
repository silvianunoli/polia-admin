import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/jornadas")({
  component: () => (
    <EmConstrucao
      titulo="Jornadas"
      bloco={3}
      descricao="Funil configurável: criou conta, completou onboarding, criou negócio, usou funcionalidade, voltou em 7 dias, recorrente."
    />
  ),
});
