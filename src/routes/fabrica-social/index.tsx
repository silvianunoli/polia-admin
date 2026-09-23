import { createFileRoute, redirect } from "@tanstack/react-router";

// Só existe uma seção pronta por enquanto — sem escolha de verdade a se
// fazer, então /fabrica-social entra direto nela em vez de mostrar um menu
// de um item só.
export const Route = createFileRoute("/fabrica-social/")({
  beforeLoad: () => {
    throw redirect({ to: "/fabrica-social/biblioteca" });
  },
});
