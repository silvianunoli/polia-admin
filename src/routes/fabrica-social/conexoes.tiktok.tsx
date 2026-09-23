import { createFileRoute } from "@tanstack/react-router";
import { Conexoes } from "@/components/fabrica-social/Conexoes";

// Redirect URI cadastrado no portal do TikTok:
// https://office.usepolia.com.br/fabrica-social/conexoes/tiktok
export const Route = createFileRoute("/fabrica-social/conexoes/tiktok")({
  head: () => ({ meta: [{ title: "Conectando com o TikTok · Pólia" }] }),
  component: Conexoes,
});
