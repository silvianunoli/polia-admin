import { createFileRoute, redirect } from "@tanstack/react-router";

// Números principais repetia os 7 cards do Founder Pulse (mesma função, mesmos
// campos). Desde 11/10/2026 (FND-09) as definições moram no Pulse.
export const Route = createFileRoute("/founder/numeros")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/founder", search });
  },
});
