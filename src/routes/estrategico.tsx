import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  buscarHtmlEstrategico,
  criarTarefaLocalKanban,
  marcarConcluidoKanban,
  moverTarefaLocalKanban,
  removerTarefaLocalKanban,
} from "@/lib/boards.functions";

export const Route = createFileRoute("/estrategico")({
  head: () => ({
    meta: [{ title: "Gerenciamento Pólia" }],
  }),
  component: EstrategicoPage,
});

// Mesma ponte do /kanban (ver kanban.tsx) -- reaproveita as mesmas 4 server
// functions, porque os dois boards escrevem na mesma tabela
// office_tarefas_catalogo.
const ACOES: Record<string, (payload: unknown) => Promise<unknown>> = {
  criar: (payload) => criarTarefaLocalKanban({ data: payload as never }),
  mover: (payload) => moverTarefaLocalKanban({ data: payload as never }),
  remover: (payload) => removerTarefaLocalKanban({ data: payload as never }),
  concluir: (payload) => {
    const { id } = payload as { id: string };
    return marcarConcluidoKanban({ data: { tarefaId: id } });
  },
};

function EstrategicoPage() {
  const [html, setHtml] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    buscarHtmlEstrategico()
      .then(setHtml)
      .catch(() => setHtml(""));
  }, []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as { tipo?: string; reqId?: string; acao?: string; payload?: unknown };
      if (!msg || msg.tipo !== "kanban:acao" || !msg.reqId) return;

      const executar = msg.acao ? ACOES[msg.acao] : undefined;
      const responder = (resposta: { ok: boolean; dados?: unknown; erro?: string }) => {
        iframeRef.current?.contentWindow?.postMessage(
          { tipo: "kanban:resposta", reqId: msg.reqId, ...resposta },
          "*",
        );
      };

      if (!executar) {
        responder({ ok: false, erro: "ação desconhecida" });
        return;
      }
      executar(msg.payload)
        .then((dados) => responder({ ok: true, dados }))
        .catch((erro: unknown) =>
          responder({ ok: false, erro: erro instanceof Error ? erro.message : "falha" }),
        );
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  if (html === null) return null;
  if (html === "") {
    return <div className="p-8 text-[var(--muted)]">Não consegui carregar o board.</div>;
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="Gerenciamento Pólia"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
    />
  );
}
