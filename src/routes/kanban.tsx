import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { buscarHtmlKanban } from "@/lib/boards.functions";

export const Route = createFileRoute("/kanban")({
  head: () => ({
    meta: [{ title: "Kanban Operacional · Pólia" }],
  }),
  component: KanbanPage,
});

function KanbanPage() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    buscarHtmlKanban()
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
      title="Kanban Operacional"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
    />
  );
}
