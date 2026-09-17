import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { getNegocioChurn } from "@/lib/founder-negocio.functions";
import { ALERTA_ERRO_CLASS, BTN_LINK, TH_CLASS } from "@/lib/botoes";
import { formatarDataBRT, formatarPct } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarrasDiarias } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/negocio/churn")({
  component: Churn,
});

function Churn() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getNegocioChurn({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o churn.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Churn = assinaturas canceladas no período ÷ assinantes no início do período (snapshot diário
        do monitor; sem snapshot, usa ativas agora + canceladas). Quem marcou "cancelar ao fim"
        ainda está ativa, mas já decidiu.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Churn"
          valor={d ? formatarPct(d.churnPct, 1) : null}
          semDados={d?.churnPct === null}
          descricao={d ? `base ${d.base} (${d.baseOrigem})` : undefined}
          carregando={carregando}
          invertido
        />
        <StatCard
          label="Canceladas"
          valor={d?.canceladas}
          variacaoPct={d?.canceladasVariacao}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
          invertido
        />
        <StatCard
          label="Churn anterior"
          valor={d ? formatarPct(d.churnAnteriorPct, 1) : null}
          semDados={d?.churnAnteriorPct === null}
          descricao="período anterior"
          carregando={carregando}
        />
        <StatCard
          label="Vão cancelar"
          valor={d?.cancelamAoFim}
          descricao="ativas com cancel_at_period_end"
          carregando={carregando}
          invertido
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Secao titulo="Cancelamentos por mês (12 meses)" carregando={carregando}>
          {d && d.porMes.length ? (
            <BarrasDiarias pontos={d.porMes} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Nenhum cancelamento registrado.
            </p>
          )}
        </Secao>
        <Secao titulo="Assinantes (snapshot, 180 dias)" carregando={carregando}>
          {d && d.serieAssinantes.length ? (
            <BarrasDiarias pontos={d.serieAssinantes} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">Ainda sem snapshot.</p>
          )}
        </Secao>
      </div>

      <Secao titulo="Canceladas no período" carregando={carregando} semPadding altura="h-32">
        {!d || d.lista.length === 0 ? (
          <Vazio>Nenhum cancelamento no período.</Vazio>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Usuária</th>
                <th className={TH_CLASS}>Cancelou em</th>
                <th className={TH_CLASS}>Acesso até</th>
              </tr>
            </thead>
            <tbody>
              {d.lista.map((c) => (
                <tr key={c.userId} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-2.5 font-sans text-[13px]">
                    <Link
                      to="/founder/analytics/usuarias/$id"
                      params={{ id: c.userId }}
                      search={(prev) => prev}
                      className={`${BTN_LINK} text-[13px]`}
                    >
                      {c.nome}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                    {formatarDataBRT(c.quando)}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                    {formatarDataBRT(c.fimAcesso)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>
    </>
  );
}
