import { createFileRoute, redirect } from "@tanstack/react-router";

// A tela antiga escrevia em feature_flags, tabela substituída por founder_flags
// em 17/09/2026 (Founder Dashboard, bloco 4). Quem cair aqui por link velho vai
// pro lugar que tem efeito de verdade.
export const Route = createFileRoute("/flags")({
  beforeLoad: () => {
    throw redirect({ to: "/founder/features/flags", search: { periodo: "7" } });
  },
});
