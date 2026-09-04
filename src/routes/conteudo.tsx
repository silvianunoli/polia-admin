import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  buscarHtmlConteudo,
  criarConteudo,
  atualizarConteudo,
  moverConteudo,
  removerConteudo,
  renomearColunaConteudo,
} from "@/lib/boards.functions";

export const Route = createFileRoute("/conteudo")({
  head: () => ({
    meta: [{ title: "Criação de Conteúdo · Pólia" }],
  }),
  component: ConteudoPage,
});

// Ações que o board (dentro do iframe) pede via postMessage -- ele não tem
// como chamar uma server function autenticada sozinho (é HTML estático puro),
// então a escrita passa por aqui, que já roda com o Bearer token da sessão.
// Mesmo padrão de src/routes/kanban.tsx.
const ACOES: Record<string, (payload: unknown) => Promise<unknown>> = {
  criar: (payload) => criarConteudo({ data: payload as never }),
  mover: (payload) => moverConteudo({ data: payload as never }),
  atualizar: (payload) => atualizarConteudo({ data: payload as never }),
  remover: (payload) => removerConteudo({ data: payload as never }),
  renomearColuna: (payload) => renomearColunaConteudo({ data: payload as never }),
};

function ConteudoPage() {
  const [html, setHtml] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    buscarHtmlConteudo()
      .then(setHtml)
      .catch(() => setHtml(""));
  }, []);

  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      // Só processa pedido do NOSSO iframe -- ignora qualquer outra origem/frame.
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as { tipo?: string; reqId?: string; acao?: string; payload?: unknown };
      if (!msg || msg.tipo !== "conteudo:acao" || !msg.reqId) return;

      const executar = msg.acao ? ACOES[msg.acao] : undefined;
      const responder = (resposta: { ok: boolean; dados?: unknown; erro?: string }) => {
        iframeRef.current?.contentWindow?.postMessage(
          { tipo: "conteudo:resposta", reqId: msg.reqId, ...resposta },
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
      title="Criação de Conteúdo"
      style={{ width: "100%", height: "100vh", border: "none", display: "block" }}
    />
  );
}
