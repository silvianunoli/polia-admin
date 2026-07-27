import { createFileRoute, redirect } from "@tanstack/react-router";

// "/" é só porta de entrada — sempre redireciona pra /central (o hub, que
// hoje só tem o card da Pólia mas existe pra crescer com outros produtos).
// O painel de verdade da Pólia mora em /painel.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/central" });
  },
});
