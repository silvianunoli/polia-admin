import { createFileRoute } from "@tanstack/react-router";
import { Conexoes } from "@/components/fabrica-social/Conexoes";

export const Route = createFileRoute("/fabrica-social/conexoes")({
  head: () => ({ meta: [{ title: "Conexões · Fábrica Social · Pólia" }] }),
  component: Conexoes,
});
