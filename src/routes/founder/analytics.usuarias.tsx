import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { getAnalyticsUsuarias } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, INPUT_CLASS } from "@/lib/botoes";
import { StatCard } from "@/components/founder/StatCard";
import { TabelaUsuarias } from "@/components/founder/TabelaUsuarias";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/usuarias")({
  component: Usuarias,
});

type Filtro = "todas" | "com_atividade" | "sem_atividade" | "pagantes";

function Usuarias() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsUsuarias({ data: search }),
    [search],
  );
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todas");

  const lista = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    return dados.usuarias.filter((u) => {
      if (filtro === "com_atividade" && !u.ultimoAcesso) return false;
      if (filtro === "sem_atividade" && u.ultimoAcesso) return false;
      if (filtro === "pagantes" && !u.pagante) return false;
      return !termo || u.nome.toLowerCase().includes(termo);
    });
  }, [dados, busca, filtro]);

  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar as usuárias.</div>;

  return (
    <>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Usuárias"
          valor={dados?.usuarias.length}
          descricao="total cadastradas"
          carregando={carregando}
        />
        <StatCard
          label="Com atividade"
          valor={dados?.comAtividade}
          descricao={`algum evento em ${dados?.periodo.rotulo ?? "…"}`}
          carregando={carregando}
        />
        <StatCard
          label="Sem atividade"
          valor={dados?.semAtividade}
          descricao="nenhum evento no período"
          carregando={carregando}
          invertido
        />
      </div>

      <div className={CARD_CLASS}>
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-5 py-3">
          <input
            type="search"
            placeholder="Buscar por nome"
            aria-label="Buscar usuária"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`${INPUT_CLASS} w-56 py-1.5 text-[13px]`}
          />
          <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
            {(
              [
                ["todas", "Todas"],
                ["com_atividade", "Com atividade"],
                ["sem_atividade", "Sem atividade"],
                ["pagantes", "Pagantes"],
              ] as [Filtro, string][]
            ).map(([chave, label]) => (
              <button
                key={chave}
                type="button"
                onClick={() => setFiltro(chave)}
                className={`cursor-pointer rounded-md px-3 py-1 font-sans text-[12px] font-medium ${
                  filtro === chave
                    ? "bg-white text-[var(--ink)] shadow-sm"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="ml-auto font-sans text-[12px] text-[var(--muted)]">
            {lista.length} usuária(s)
          </span>
        </div>
        {carregando || !dados ? (
          <SkeletonBloco className="h-48" />
        ) : (
          <TabelaUsuarias usuarias={lista} vazio="Nenhuma usuária com esse filtro." limite={200} />
        )}
      </div>
      <p className="mt-3 font-sans text-[12px] text-[var(--muted)]">
        Último acesso, dias ativos e sessões consideram só o período do filtro. Clique no nome pra
        abrir o perfil com a linha do tempo.
      </p>
    </>
  );
}
