import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ProdutoEditor } from "@/components/loja/ProdutoEditor";
import { listarCategoriasParaEditor, type Categoria } from "@/lib/loja.functions";
import { btnOutline, cardClass } from "@/lib/crm-ui";

export const Route = createFileRoute("/loja/produtos/novo")({
  head: () => ({ meta: [{ title: "Novo serviço · Loja de serviços · Gestão Pólia" }] }),
  component: NovoProduto,
});

function NovoProduto() {
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    try {
      setCategorias((await listarCategoriasParaEditor()).categorias);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra abrir o editor.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  if (erro) {
    return (
      <div className={`${cardClass} max-w-xl p-8`}>
        <p className="text-[14px] text-[var(--ink-soft)]">{erro}</p>
        <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
          Tentar de novo
        </button>
      </div>
    );
  }
  if (!categorias) {
    return <div className="h-64 max-w-6xl animate-pulse rounded-2xl bg-[var(--surface)]" />;
  }
  return <ProdutoEditor produto={null} categorias={categorias} />;
}
