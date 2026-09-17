import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { getAnalyticsFuncionalidades } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarDuracao, formatarPct } from "@/lib/founder-formato";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/funcionalidades")({
  component: Funcionalidades,
});

function Funcionalidades() {
  const search = useSearch({ from: "/founder" });
  const [limiarPct, setLimiarPct] = useState(10);
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsFuncionalidades({ data: { ...search, limiarPct } }),
    [search, limiarPct],
  );
  if (erro)
    return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o uso por funcionalidade.</div>;
  const f = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Acessos = vezes que a tela foi aberta; concluídas = ações de valor registradas nela; tempo =
        soma dos intervalos até o próximo evento da sessão (teto de 5 min por intervalo).
        {f ? ` ${f.usuariasAtivas} usuária(s) ativa(s) no período.` : ""}
      </p>

      <div className={`${CARD_CLASS} mb-6`}>
        <p className="border-b border-[var(--line)] px-5 py-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Mais usadas
        </p>
        {carregando || !f ? (
          <SkeletonBloco className="h-48" />
        ) : f.features.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
            Nenhum uso registrado no período.
          </p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Funcionalidade</th>
                <th className={TH_CLASS}>Usuárias</th>
                <th className={TH_CLASS}>% das ativas</th>
                <th className={TH_CLASS}>Acessos</th>
                <th className={TH_CLASS}>Concluídas</th>
                <th className={TH_CLASS}>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {f.features.map((x) => (
                <tr key={x.feature} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">{x.nome}</td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {x.usuarias}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {formatarPct(x.pctDasAtivas)}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {x.acessos}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {x.concluidos}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {formatarDuracao(x.tempoS)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
          <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Quase sem uso
          </p>
          <label className="flex items-center gap-2 font-sans text-[12px] text-[var(--muted)]">
            usadas por menos de
            <select
              value={limiarPct}
              onChange={(e) => setLimiarPct(Number(e.target.value))}
              className="rounded-md border border-[var(--line)] bg-white px-2 py-1 font-sans text-[12px] text-[var(--ink)]"
            >
              {[5, 10, 20, 30, 50].map((v) => (
                <option key={v} value={v}>
                  {v}%
                </option>
              ))}
            </select>
            das ativas
          </label>
        </div>
        {carregando || !f ? (
          <SkeletonBloco className="h-32" />
        ) : f.quaseSemUso.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--secondary-text)]">
            Nenhuma funcionalidade abaixo desse limiar.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {f.quaseSemUso.map((x) => (
              <div
                key={x.feature}
                className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] pb-1.5"
              >
                <span className="font-sans text-[13px] text-[var(--ink)]">{x.nome}</span>
                <span className="font-sans text-[12px] text-[var(--muted)]">
                  {x.usuarias} usuária(s)
                  {x.pctDasAtivas === null ? "" : ` · ${formatarPct(x.pctDasAtivas)}`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
