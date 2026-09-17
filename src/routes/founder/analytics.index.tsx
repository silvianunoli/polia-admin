import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getAnalyticsVisaoGeral } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { formatarPct } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarrasDiarias } from "@/components/founder/Graficos";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/")({
  component: VisaoGeralDeUso,
});

function VisaoGeralDeUso() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsVisaoGeral({ data: search }),
    [search],
  );

  if (erro)
    return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a visão geral de uso.</div>;

  const v = dados;
  const variacao = (atual: number | undefined, anterior: number | undefined) =>
    atual === undefined || anterior === undefined
      ? undefined
      : anterior === 0
        ? atual === 0
          ? 0
          : null
        : ((atual - anterior) / anterior) * 100;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        "Ativa" é quem fez uma ação real (criou ou editou produto ou meta, concluiu onboarding, usou
        uma funcionalidade até o fim). Abrir tela e heartbeat não contam. DAU, WAU e MAU são janelas
        de 1, 7 e 30 dias até agora; os outros cards seguem o período do filtro.
      </p>

      {v && !v.temEventos && (
        <div className={`${CARD_CLASS} mb-6 p-5`}>
          <p className="font-sans text-[13px] text-[var(--ink-soft)]">
            Ainda não chegou nenhum evento: a instrumentação entrou no ar em 17/09/2026 e só
            registra a partir daí. Os números abaixo vão encher conforme as usuárias entrarem.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Usuárias"
          valor={v?.totalUsuarias}
          descricao="total cadastradas"
          carregando={carregando}
          href="/founder/analytics/usuarias"
        />
        <StatCard
          label="Acessaram hoje"
          valor={v?.acessaramHoje}
          descricao="qualquer evento hoje (BRT)"
          carregando={carregando}
          href="/founder/analytics/usuarias"
        />
        <StatCard
          label="DAU"
          valor={v?.dau}
          variacaoPct={variacao(v?.dau, v?.dauAnterior)}
          rotuloComparacao="vs dia anterior"
          descricao="ativas nas últimas 24h"
          carregando={carregando}
        />
        <StatCard
          label="WAU"
          valor={v?.wau}
          variacaoPct={variacao(v?.wau, v?.wauAnterior)}
          rotuloComparacao="vs semana anterior"
          descricao="ativas nos últimos 7 dias"
          carregando={carregando}
        />
        <StatCard
          label="MAU"
          valor={v?.mau}
          variacaoPct={variacao(v?.mau, v?.mauAnterior)}
          rotuloComparacao="vs mês anterior"
          descricao="ativas nos últimos 30 dias"
          carregando={carregando}
        />
        <StatCard
          label="DAU / MAU"
          valor={v ? formatarPct(v.dauSobreMau, 0) : null}
          semDados={v?.dauSobreMau === null}
          descricao="frequência de uso"
          carregando={carregando}
        />
        <StatCard
          label="Novas no período"
          valor={v?.novasContas}
          variacaoPct={v?.novasContasVariacao}
          descricao={v?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Ativas no período"
          valor={v?.ativasPeriodo}
          variacaoPct={v?.ativasPeriodoVariacao}
          descricao={v?.periodo.rotulo}
          carregando={carregando}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Usuárias ativas por dia
          </p>
          {carregando || !v ? (
            <SkeletonBloco className="h-28" />
          ) : (
            <BarrasDiarias pontos={v.serieAtivas} />
          )}
        </div>
        <div className={`${CARD_CLASS} p-6`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
              Sessões por dia
            </p>
            {v && (
              <span className="font-sans text-[12px] text-[var(--muted)]">
                {v.sessoesPeriodo} no período
              </span>
            )}
          </div>
          {carregando || !v ? (
            <SkeletonBloco className="h-28" />
          ) : (
            <BarrasDiarias pontos={v.serieSessoes} />
          )}
        </div>
      </div>
    </>
  );
}
