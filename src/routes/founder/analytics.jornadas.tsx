import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { getAnalyticsJornadas } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { Funil } from "@/components/founder/Graficos";
import { TabelaUsuarias } from "@/components/founder/TabelaUsuarias";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/jornadas")({
  component: Jornadas,
});

function Jornadas() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsJornadas({ data: search }),
    [search],
  );
  const [selecionado, setSelecionado] = useState<number | null>(null);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o funil.</div>;
  const j = dados;
  const passo = selecionado !== null && j ? j.passos[selecionado] : null;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Coorte = contas criadas no período do filtro ({j?.tamanhoCoorte ?? "…"}); cada passo conta
        quem já tinha passado pelos anteriores. Clique num passo pra ver quem parou ali. Os passos
        vêm de <code className="font-mono text-[12px]">founder_funil_config</code> (funil "
        {j?.nomeFunil ?? "…"}"), editável sem deploy.
      </p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Funil
          </p>
          {carregando || !j ? (
            <SkeletonBloco className="h-64" />
          ) : (
            <Funil
              passos={j.passos.map((p) => ({ rotulo: p.rotulo, total: p.total }))}
              selecionado={selecionado}
              onSelecionar={(i) => setSelecionado(i === selecionado ? null : i)}
            />
          )}
        </div>
        <div className={CARD_CLASS}>
          <p className="border-b border-[var(--line)] px-5 py-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            {passo ? `Pararam em "${passo.rotulo}" (${passo.cairam.length})` : "Quem parou"}
          </p>
          {passo ? (
            <TabelaUsuarias usuarias={passo.cairam} vazio="Ninguém parou nesse passo." />
          ) : (
            <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
              Selecione um passo do funil.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
