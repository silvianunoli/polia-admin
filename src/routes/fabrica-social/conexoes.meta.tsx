import { createFileRoute } from "@tanstack/react-router";
import { Conexoes } from "@/components/fabrica-social/Conexoes";

// Redirect URI cadastrado no painel da Meta:
// https://office.usepolia.com.br/fabrica-social/conexoes/meta
export const Route = createFileRoute("/fabrica-social/conexoes/meta")({
  head: () => ({ meta: [{ title: "Conectando com a Meta · Pólia" }] }),
  component: Conexoes,
});
