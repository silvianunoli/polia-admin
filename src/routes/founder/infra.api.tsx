import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getInfraApi } from "@/lib/founder-infra.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarMs, formatarNumero, formatarPct } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista, BarrasDiarias } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/infra/api")({
  component: Api,
});

function Api() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(() => getInfraApi({ data: search }), [search]);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a API.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Chamadas medidas pelo middleware do Worker (`founder_api_chamadas`): toda server function e
        uma amostra do SSR. Latência só das server functions, porque o relógio do Worker não anda
        durante o render do SSR.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard
          label="Requests"
          valor={d ? formatarNumero(d.requests) : null}
          variacaoPct={d?.requestsVariacao}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Taxa de erro"
          valor={d ? formatarPct(d.taxaErro, 2) : null}
          semDados={d?.taxaErro === null}
          descricao={
            d?.taxaErroAnterior === null || d?.taxaErroAnterior === undefined
              ? `${d?.erros ?? 0} erro(s)`
              : `antes ${formatarPct(d.taxaErroAnterior, 2)}`
          }
          carregando={carregando}
        />
        <StatCard
          label="p50"
          valor={d ? formatarMs(d.p50) : null}
          semDados={d?.p50 === null}
          descricao="server functions"
          carregando={carregando}
        />
        <StatCard
          label="p95"
          valor={d ? formatarMs(d.p95) : null}
          semDados={d?.p95 === null}
          variacaoPct={d?.p95Variacao}
          descricao="server functions"
          carregando={carregando}
          invertido
        />
        <StatCard
          label="p99"
          valor={d ? formatarMs(d.p99) : null}
          semDados={d?.p99 === null}
          descricao="server functions"
          carregando={carregando}
        />
        <StatCard
          label="Server fn × SSR"
          valor={d ? `${formatarNumero(d.serverFns)} × ${formatarNumero(d.ssr)}` : null}
          descricao="no período"
          carregando={carregando}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Secao titulo="Requests por dia" carregando={carregando}>
          {d && d.serie.length ? (
            <BarrasDiarias pontos={d.serie} formatar={formatarNumero} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">Sem chamadas no período.</p>
          )}
        </Secao>
        <Secao titulo="Erros por dia" carregando={carregando}>
          {d && d.serieErros.some((p) => p.valor > 0) ? (
            <BarrasDiarias pontos={d.serieErros} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">Nenhum erro no período.</p>
          )}
        </Secao>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Secao titulo="Mais lentas (p95)" carregando={carregando}>
          <BarraLista
            itens={(d?.maisLentas ?? []).map((f) => ({
              rotulo: f.fn,
              valor: f.p95 ?? 0,
              detalhe: `${f.total} chamadas`,
            }))}
            formatar={formatarMs}
            vazio="Sem latência medida no período."
          />
        </Secao>
        <Secao titulo="Mais erros" carregando={carregando}>
          <BarraLista
            itens={(d?.maisErros ?? []).map((f) => ({
              rotulo: f.fn,
              valor: f.erros,
              detalhe: formatarPct(f.taxaErro, 1),
            }))}
            vazio="Nenhum erro no período."
          />
        </Secao>
      </div>

      <Secao titulo="Por função" carregando={carregando} semPadding altura="h-48">
        {!d || d.funcoes.length === 0 ? (
          <Vazio>Sem chamadas no período.</Vazio>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Função</th>
                <th className={TH_CLASS}>Chamadas</th>
                <th className={TH_CLASS}>Erros</th>
                <th className={TH_CLASS}>Taxa de erro</th>
                <th className={TH_CLASS}>p95</th>
              </tr>
            </thead>
            <tbody>
              {d.funcoes.map((f) => (
                <tr key={f.fn} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink)]">{f.fn}</td>
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarNumero(f.total)}
                  </td>
                  <td
                    className={`px-5 py-2.5 font-sans text-[13px] ${f.erros ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"}`}
                  >
                    {f.erros}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarPct(f.taxaErro, 1)}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarMs(f.p95)}
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
