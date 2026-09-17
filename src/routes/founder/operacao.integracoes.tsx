import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/operacao/integracoes")({
  component: () => (
    <EmConstrucao
      titulo="Integrações"
      bloco={6}
      descricao="Status, falhas e última sincronização de Stripe, Resend, Google Agenda e Instagram."
    />
  ),
});
