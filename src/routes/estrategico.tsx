import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buscarHtmlEstrategico } from "@/lib/boards.functions";

export const Route = createFileRoute("/estrategico")({
  head: () => ({
    meta: [{ title: "Gerenciamento Pólia" }],
  }),
  component: EstrategicoPage,
});

function EstrategicoPage() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    buscarHtmlEstrategico()
      .then(setHtml)
      .catch(() => setHtml(""));
  }, []);

  if (html === null) return null;
  if (html === "") {
    return <div className="p-8 text-[var(--muted)]">Não consegui carregar o board.</div>;
  }

  return (
    <iframe
      srcDoc={html}
      title="Gerenciamento Pólia"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
    />
  );
}
