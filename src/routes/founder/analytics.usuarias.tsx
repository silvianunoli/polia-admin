import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/analytics/usuarias")({
  component: () => (
    <EmConstrucao
      titulo="Usuárias"
      bloco={3}
      descricao="Lista com último acesso, plano, dias ativos e sessões; abre o perfil individual."
    />
  ),
});
