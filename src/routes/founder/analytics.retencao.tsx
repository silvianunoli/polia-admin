import { createFileRoute } from "@tanstack/react-router";
import { getAnalyticsRetencao } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarDataBRT, formatarPct } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/retencao")({
  component: Retencao,
});

function Celula({ n, total }: { n: number; total: number }) {
  const pct = total ? (n / total) * 100 : 0;
  return (
    <td className="px-4 py-2.5">
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 rounded-full bg-[var(--surface)]">
          <div className="h-1.5 rounded-full bg-[var(--secondary)]" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[12px] text-[var(--ink-soft)]">
          {total ? `${pct.toFixed(0)}%` : "—"} <span className="text-[var(--muted)]">({n})</span>
        </span>
      </div>
    </td>
  );
}

function Retencao() {
  const { dados, carregando, erro } = useCarregar(() => getAnalyticsRetencao(), []);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a retenção.</div>;
  const r = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Coorte = semana de criação da conta (últimas 12 semanas). D1, D7 e D30 contam quem fez uma
        ação real exatamente naquele dia depois do cadastro; "até D7" conta quem fez em qualquer dia
        da primeira semana. Independe do filtro de período.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard
          label="Retorno D1"
          valor={r ? formatarPct(r.geral.d1Pct) : null}
          semDados={r?.geral.d1Pct === null}
          descricao={`de ${r?.geral.tamanho ?? "…"} contas`}
          carregando={carregando}
        />
        <StatCard
          label="Retorno D7"
          valor={r ? formatarPct(r.geral.d7Pct) : null}
          semDados={r?.geral.d7Pct === null}
          descricao="exatamente no 7º dia"
          carregando={carregando}
        />
        <StatCard
          label="Até D7"
          valor={r ? formatarPct(r.geral.ateD7Pct) : null}
          semDados={r?.geral.ateD7Pct === null}
          descricao="algum dia na 1ª semana"
          carregando={carregando}
        />
        <StatCard
          label="Retorno D30"
          valor={r ? formatarPct(r.geral.d30Pct) : null}
          semDados={r?.geral.d30Pct === null}
          descricao="exatamente no 30º dia"
          carregando={carregando}
        />
      </div>
      <div className={CARD_CLASS}>
        {carregando || !r ? (
          <SkeletonBloco className="h-48" />
        ) : r.coortes.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
            Nenhuma conta criada nas últimas 12 semanas.
          </p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Coorte (semana)</th>
                <th className={TH_CLASS}>Contas</th>
                <th className={TH_CLASS}>D1</th>
                <th className={TH_CLASS}>Até D7</th>
                <th className={TH_CLASS}>D7</th>
                <th className={TH_CLASS}>D30</th>
              </tr>
            </thead>
            <tbody>
              {r.coortes.map((c) => (
                <tr key={c.coorte} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-2.5 font-sans text-[13px] text-[var(--ink)]">
                    {formatarDataBRT(c.coorte)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {c.tamanho}
                  </td>
                  <Celula n={c.d1} total={c.tamanho} />
                  <Celula n={c.ate_d7} total={c.tamanho} />
                  <Celula n={c.d7} total={c.tamanho} />
                  <Celula n={c.d30} total={c.tamanho} />
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
