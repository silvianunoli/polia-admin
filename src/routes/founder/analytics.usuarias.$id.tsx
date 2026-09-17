import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/usuarias/$id")({
  component: () => (
    <EmConstrucao
      titulo="Perfil da usuária"
      bloco={3}
      descricao="Último acesso, plano, dias ativos, sessões, tempo total e linha do tempo de eventos."
    />
  ),
});
