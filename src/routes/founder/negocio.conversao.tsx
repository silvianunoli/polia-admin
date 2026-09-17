import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/negocio/conversao")({
  component: () => (
    <EmConstrucao
      titulo="Conversão"
      bloco={6}
      descricao="De conta pra assinatura e de teste pra paga, por período."
    />
  ),
});
