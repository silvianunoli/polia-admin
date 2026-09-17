import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/negocio/assinaturas")({
  component: () => (
    <EmConstrucao
      titulo="Assinaturas"
      bloco={6}
      descricao="Novas assinaturas, ativas, por plano e pagamentos pendentes."
    />
  ),
});
