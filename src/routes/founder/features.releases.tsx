import { createFileRoute } from "@tanstack/react-router";
import { EmConstrucao } from "@/components/founder/EmConstrucao";

export const Route = createFileRoute("/founder/features/releases")({
  component: () => (
    <EmConstrucao
      titulo="Releases"
      bloco={6}
      descricao="Registro do que subiu pra produção e quando."
    />
  ),
});
