import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/operacao/jobs")({
  component: () => (
    <EmConstrucao
      titulo="Jobs"
      bloco={6}
      descricao="Jobs agendados: executados, falhos, pendentes e duração."
    />
  ),
});
