import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getProdutoAtivacao } from "@/lib/founder-produto.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarDataBRT, formatarDuracao, formatarPct } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { TabelaUsuarias } from "@/components/founder/TabelaUsuarias";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/produto/ativacao")({
  component: Ativacao,
});

function Ativacao() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getProdutoAtivacao({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a ativação.</div>;
  const a = dados;
  const variacao =
    a && a.taxaAtivacao !== null && a.taxaAtivacaoAnterior !== null
      ? a.taxaAtivacaoAnterior === 0
        ? a.taxaAtivacao === 0
          ? 0
          : null
        : ((a.taxaAtivacao - a.taxaAtivacaoAnterior) / a.taxaAtivacaoAnterior) * 100
      : undefined;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Ativada = concluiu o onboarding e fez a primeira ação de valor (produto, meta ou
        funcionalidade até o fim) em até 7 dias depois de criar a conta. Tempo até o primeiro valor
        = da conta à primeira ação de valor. Retorno D1/D7/D30 vem das coortes das últimas 12
        semanas.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Contas no período"
          valor={a?.contasNoPeriodo}
          descricao={a?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Taxa de ativação"
          valor={a ? formatarPct(a.taxaAtivacao) : null}
          semDados={a?.taxaAtivacao === null}
          variacaoPct={variacao}
          descricao={`${a?.ativadas ?? "…"} ativada(s)`}
          carregando={carregando}
        />
        <StatCard
          label="Até o 1º valor"
          valor={a ? formatarDuracao(a.ttfvMedianaS) : null}
          semDados={a?.ttfvMedianaS === null}
          descricao="mediana da coorte"
          carregando={carregando}
        />
        <StatCard
          label="Retorno D1"
          valor={a ? formatarPct(a.retorno.d1) : null}
          semDados={a?.retorno.d1 === null}
          descricao={`base ${a?.retorno.base ?? "…"}`}
          carregando={carregando}
        />
        <StatCard
          label="Retorno D7"
          valor={a ? formatarPct(a.retorno.d7) : null}
          semDados={a?.retorno.d7 === null}
          descricao="12 semanas"
          carregando={carregando}
        />
        <StatCard
          label="Retorno D30"
          valor={a ? formatarPct(a.retorno.d30) : null}
          semDados={a?.retorno.d30 === null}
          descricao="12 semanas"
          carregando={carregando}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={CARD_CLASS}>
          <p className="border-b border-[var(--line)] px-5 py-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Ativação por coorte semanal
          </p>
          {carregando || !a ? (
            <SkeletonBloco className="h-40" />
          ) : a.coortesAtivacao.length === 0 ? (
            <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
              Nenhuma conta nas últimas 12 semanas.
            </p>
          ) : (
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Semana</th>
                  <th className={TH_CLASS}>Contas</th>
                  <th className={TH_CLASS}>Ativadas</th>
                  <th className={TH_CLASS}>Taxa</th>
                  <th className={TH_CLASS}>1º valor</th>
                </tr>
              </thead>
              <tbody>
                {a.coortesAtivacao.map((c) => (
                  <tr key={c.semana} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">
                      {formatarDataBRT(c.semana)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                      {c.tamanho}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                      {c.ativadas}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                      {formatarPct(c.taxa)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                      {formatarDuracao(c.ttfvMedianaS)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={CARD_CLASS}>
          <p className="border-b border-[var(--line)] px-5 py-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Não ativaram no período ({a?.naoAtivadas.length ?? "…"})
          </p>
          {carregando || !a ? (
            <SkeletonBloco className="h-40" />
          ) : (
            <TabelaUsuarias usuarias={a.naoAtivadas} vazio="Todas as contas do período ativaram." />
          )}
        </div>
      </div>
    </>
  );
}
