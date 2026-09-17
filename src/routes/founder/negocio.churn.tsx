import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/negocio/churn")({
  component: () => (
    <EmConstrucao titulo="Churn" bloco={6} descricao="Cancelamentos e churn por período." />
  ),
});
