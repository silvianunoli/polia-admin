import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getAnalyticsComportamento } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { StatCard } from "@/components/founder/StatCard";
import { Heatmap } from "@/components/founder/Graficos";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/comportamento")({
  component: Comportamento,
});

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function Comportamento() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsComportamento({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o mapa de uso.</div>;
  const c = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Quando as usuárias usam: eventos por dia da semana e hora, em horário de Brasília. Heartbeat
        e fim de sessão ficam de fora pra não pesar quem deixa a aba aberta.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard
          label="Eventos"
          valor={c?.totalEventos}
          descricao={c?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Hora de pico"
          valor={c?.horaPico === null ? null : `${c?.horaPico}h`}
          semDados={c?.horaPico === null}
          descricao="mais eventos"
          carregando={carregando}
        />
        <StatCard
          label="Dia de pico"
          valor={c?.diaPico === null || c?.diaPico === undefined ? null : DIAS[c.diaPico]}
          semDados={c?.diaPico === null}
          descricao="mais eventos"
          carregando={carregando}
        />
      </div>
      <div className={`${CARD_CLASS} p-6`}>
        <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Mapa de calor · dia da semana × hora
        </p>
        {carregando || !c ? <SkeletonBloco className="h-40" /> : <Heatmap celulas={c.celulas} />}
      </div>
    </>
  );
}
