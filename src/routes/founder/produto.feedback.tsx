import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/produto/feedback")({
  component: () => (
    <EmConstrucao
      titulo="Feedback"
      bloco={5}
      descricao="Feedback das usuárias: notas, comentários e chamados."
    />
  ),
});
