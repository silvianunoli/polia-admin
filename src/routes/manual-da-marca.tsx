import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { buscarHtmlManualMarca } from "@/lib/boards.functions";

export const Route = createFileRoute("/manual-da-marca")({
  head: () => ({ meta: [{ title: "Manual da Marca · Pólia" }] }),
  component: ManualDaMarcaPage,
});

// Mesmo padrão dos boards (kanban, estrategico, conteudo): o documento é HTML
// próprio, com paleta e tipografia da marca fechadas dentro dele, então entra
// por iframe srcDoc em vez de virar JSX -- assim o CSS dele não briga com o
// .polia-v3 do admin. A diferença é que aqui não existe escrita: é leitura.
function ManualDaMarcaPage() {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    buscarHtmlManualMarca()
      .then(setHtml)
      .catch(() => setHtml(""));
  }, []);

  return (
    <div className="polia-v3 flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4 md:px-10">
        <Link
          to="/central"
          className="flex items-center gap-2 font-sans text-[14px] text-[var(--ink-soft)] no-underline hover:text-[var(--ink)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Central
        </Link>
        <span className="font-sans text-[14px] text-[var(--muted)]">Manual da Marca</span>
      </header>

      {html === null ? (
        <div className="p-8 font-sans text-[15px] text-[var(--muted)]">Carregando o manual…</div>
      ) : html === "" ? (
        <div className="p-8 font-sans text-[15px] text-[var(--muted)]">
          Não consegui carregar o manual.
        </div>
      ) : (
        <iframe
          srcDoc={html}
          title="Manual da Marca"
          style={{ width: "100%", flex: 1, border: "none", display: "block" }}
        />
      )}
    </div>
  );
}
