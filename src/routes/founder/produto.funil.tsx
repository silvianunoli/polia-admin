import { createFileRoute, redirect } from "@tanstack/react-router";

// Produto › Funil repetia Analytics › Caminhos (mesmo layout, mesma coorte de
// contas do período, só com os passos fixos no código). Desde 11/10/2026
// (FND-09) fica só Caminhos, que lê os passos de founder_funil_config.
export const Route = createFileRoute("/founder/produto/funil")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/founder/analytics/jornadas", search });
  },
});
