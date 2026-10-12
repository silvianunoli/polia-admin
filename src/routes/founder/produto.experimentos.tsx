import { createFileRoute, redirect } from "@tanstack/react-router";

// Experimentos aparecia duas vezes no menu (Produto e Features), com a mesma
// fonte. Desde 11/10/2026 (FND-09) mora só em Features: criar, pausar,
// concluir e ver o resultado na mesma tela.
export const Route = createFileRoute("/founder/produto/experimentos")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/founder/features/experimentos", search });
  },
});
