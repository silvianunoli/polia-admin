import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { getAtivacaoReal, getProdutoAtivacao } from "@/lib/founder-produto.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, BTN_LINK, TH_CLASS } from "@/lib/botoes";
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
  // Janela fixa de 30 dias: não depende do filtro de período.
  const real = useCarregar(() => getAtivacaoReal(), []);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a ativação.</div>;
  const a = dados;
  const r = real.dados;
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
      {/* GRW-66 (20/10/2026): a ativação que importa pro teste do Pro. Só aqui,
          não repetir na Visão geral. */}
      <p className="mb-2 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Ativação real · contas dos últimos {r?.janelaDias ?? 30} dias
      </p>
      {real.erro ? (
        <div className={`mb-6 ${ALERTA_ERRO_CLASS}`}>Não consegui carregar a ativação real.</div>
      ) : (
        <div className="mb-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard
            label="Contas novas"
            valor={r?.contas}
            descricao="sem administradoras"
            carregando={real.carregando}
          />
          <StatCard
            label="Ativadas"
            valor={r ? formatarPct(r.taxa) : null}
            semDados={r?.taxa === null}
            descricao={r ? `${r.ativadas} de ${r.contas} contas` : undefined}
            carregando={real.carregando}
          />
          <StatCard
            label="Voltaram depois de 48h"
            valor={r ? formatarPct(r.taxa48h) : null}
            semDados={r?.taxa48h === null}
            descricao={r ? `${r.voltaram48h} de ${r.base48h} contas com 3+ dias` : undefined}
            carregando={real.carregando}
          />
        </div>
      )}
      <p className="mb-8 font-sans text-[13px] text-[var(--muted)]">
        Ativada = salvou pelo menos um produto pela calculadora e voltou à Pólia num dia diferente
        do cadastro, dentro dos 7 primeiros dias. Conta criada há menos de 7 dias entra na base e
        ainda pode ativar. Voltaram depois de 48h = das contas com 3 dias ou mais, quantas usaram a
        Pólia depois de 48 horas do cadastro. Janela fixa de 30 dias, não segue o filtro de período.
        Cobrança do Stripe não conta como volta.
      </p>

      <p className="mb-2 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Ativação por onboarding · período do filtro
      </p>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Ativada = concluiu o onboarding e fez a primeira ação de valor (produto, meta ou
        funcionalidade até o fim) em até 7 dias depois de criar a conta. Tempo até o primeiro valor
        = da conta à primeira ação de valor. O retorno D1/D7/D30 fica em{" "}
        <Link to="/founder/analytics/retencao" search={(prev) => prev} className={BTN_LINK}>
          Analytics › Retenção
        </Link>
        .
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Contas no período"
          valor={a?.contasNoPeriodo}
          descricao={a?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Ativação por onboarding"
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
