import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/operacao/logs")({
  component: () => (
    <EmConstrucao
      titulo="Logs"
      bloco={6}
      descricao="Eventos de sistema: falhas de API, de job, de integração e picos de latência."
    />
  ),
});
