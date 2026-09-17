import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getAnalyticsSessoes } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { formatarDuracao } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarrasDiarias } from "@/components/founder/Graficos";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/sessoes")({
  component: Sessoes,
});

function Sessoes() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsSessoes({ data: search }),
    [search],
  );

  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar as sessões.</div>;
  const s = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Sessão = uma visita contínua ao app (renova depois de 30 min parada). A duração vai do
        primeiro ao último evento, com heartbeat a cada 60 s enquanto a aba está visível e em uso.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Sessões"
          valor={s?.total}
          variacaoPct={s?.totalVariacao}
          descricao={s?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Por usuária"
          valor={s?.porUsuaria === null ? null : s?.porUsuaria?.toFixed(1)}
          semDados={s?.porUsuaria === null}
          descricao={`${s?.usuarias ?? "…"} usuária(s) com sessão`}
          carregando={carregando}
        />
        <StatCard
          label="Duração média"
          valor={s ? formatarDuracao(s.duracaoMediaS) : null}
          semDados={s?.duracaoMediaS === null}
          descricao="por sessão"
          carregando={carregando}
        />
        <StatCard
          label="Duração mediana"
          valor={s ? formatarDuracao(s.duracaoMedianaS) : null}
          semDados={s?.duracaoMedianaS === null}
          descricao="metade das sessões abaixo disso"
          carregando={carregando}
        />
        <StatCard
          label="Telas por sessão"
          valor={s?.telasPorSessao === null ? null : s?.telasPorSessao?.toFixed(1)}
          semDados={s?.telasPorSessao === null}
          descricao="páginas distintas abertas"
          carregando={carregando}
        />
        <StatCard
          label="Voltaram no mesmo dia"
          valor={s?.voltaramMesmoDia}
          descricao="usuárias com 2+ sessões num dia"
          carregando={carregando}
        />
        <StatCard
          label="Voltaram em 7 dias"
          valor={s?.voltaramEm7Dias}
          descricao="nova sessão até 7 dias após a 1ª"
          carregando={carregando}
        />
      </div>
      <div className={`${CARD_CLASS} p-6`}>
        <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Sessões por dia
        </p>
        {carregando || !s ? <SkeletonBloco className="h-28" /> : <BarrasDiarias pontos={s.serie} />}
      </div>
    </>
  );
}
