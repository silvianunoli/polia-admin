import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ProdutoEditor } from "@/components/loja/ProdutoEditor";
import { obterProduto, type Categoria, type Produto } from "@/lib/loja.functions";
import { btnOutline, cardClass } from "@/lib/crm-ui";

export const Route = createFileRoute("/loja/produtos/$id")({
  head: () => ({ meta: [{ title: "Editar serviço · Loja de serviços · Gestão Pólia" }] }),
  component: EditarProduto,
});

// Carrega no client (useEffect), não no loader: a server function precisa do
// token da sessão, que só existe no navegador. Mesmo motivo do CRM.
function EditarProduto() {
  const { id } = Route.useParams();
  const [estado, setEstado] = useState<
    | { tipo: "carregando" }
    | { tipo: "erro"; mensagem: string }
    | { tipo: "nao_existe" }
    | { tipo: "pronto"; produto: Produto; categorias: Categoria[] }
  >({ tipo: "carregando" });

  const carregar = useCallback(async () => {
    setEstado({ tipo: "carregando" });
    try {
      const r = await obterProduto({ data: { id } });
      if (!r.produto) setEstado({ tipo: "nao_existe" });
      else setEstado({ tipo: "pronto", produto: r.produto, categorias: r.categorias });
    } catch (e) {
      setEstado({
        tipo: "erro",
        mensagem: e instanceof Error ? e.message : "Não deu pra abrir esse serviço.",
      });
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (estado.tipo === "carregando") {
    return <div className="h-64 max-w-6xl animate-pulse rounded-2xl bg-[var(--surface)]" />;
  }
  if (estado.tipo === "nao_existe") {
    return (
      <div className={`${cardClass} max-w-xl p-8`}>
        <p className="text-[14px] text-[var(--ink-soft)]">Esse serviço não existe mais.</p>
        <Link to="/loja/produtos" className={`${btnOutline} mt-4 inline-flex no-underline`}>
          Voltar pra lista
        </Link>
      </div>
    );
  }
  if (estado.tipo === "erro") {
    return (
      <div className={`${cardClass} max-w-xl p-8`}>
        <p className="text-[14px] text-[var(--ink-soft)]">{estado.mensagem}</p>
        <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
          Tentar de novo
        </button>
      </div>
    );
  }
  // key: duplicar navega de um id pro outro sem desmontar a rota; o editor
  // precisa nascer de novo com o estado do serviço novo.
  return (
    <ProdutoEditor
      key={estado.produto.id}
      produto={estado.produto}
      categorias={estado.categorias}
    />
  );
}
