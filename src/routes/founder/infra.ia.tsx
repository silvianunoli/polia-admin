import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getInfraIa } from "@/lib/founder-infra.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import {
  formatarDataHoraBRT,
  formatarMs,
  formatarNumero,
  formatarPct,
  formatarUsd,
} from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/infra/ia")({
  component: Ia,
});

function Ia() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(() => getInfraIa({ data: search }), [search]);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a IA.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Chamadas ao Gemini registradas em `ia_geracoes` (tokens, sucesso) e latência medida pelo
        servidor. Custo é <strong className="text-[var(--ink)]">estimado</strong> pela tabela
        pública de preços por modelo; a fatura real fica no console do Google.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard
          label="Chamadas"
          valor={d ? formatarNumero(d.chamadas) : null}
          variacaoPct={d?.chamadasVariacao}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Falhas"
          valor={d?.falhas}
          descricao={d ? formatarPct(d.taxaFalha, 1) : undefined}
          carregando={carregando}
          invertido
        />
        <StatCard
          label="Latência p50"
          valor={d ? formatarMs(d.latenciaP50) : null}
          semDados={d?.latenciaP50 === null}
          descricao={d ? `${d.latenciaMedida} medidas` : undefined}
          carregando={carregando}
        />
        <StatCard
          label="Latência p95"
          valor={d ? formatarMs(d.latenciaP95) : null}
          semDados={d?.latenciaP95 === null}
          carregando={carregando}
        />
        <StatCard
          label="Custo estimado"
          valor={d ? formatarUsd(d.custoUsd) : null}
          descricao={
            d?.semPreco ? `${d.semPreco} chamada(s) sem preço conhecido` : "USD, tabela pública"
          }
          carregando={carregando}
        />
        <StatCard
          label="Tokens"
          valor={d ? `${formatarNumero(d.tokensIn)} → ${formatarNumero(d.tokensOut)}` : null}
          descricao="entrada → saída"
          carregando={carregando}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Secao titulo="Por feature" carregando={carregando}>
          <BarraLista
            itens={(d?.porFeature ?? []).map((f) => ({
              rotulo: f.feature,
              valor: f.chamadas,
              detalhe: f.falhas ? `${f.falhas} falha(s)` : undefined,
            }))}
            vazio="Nenhuma chamada no período."
          />
        </Secao>
        <Secao titulo="Por modelo" carregando={carregando} semPadding altura="h-32">
          {!d || d.porModelo.length === 0 ? (
            <Vazio>Nenhuma chamada no período.</Vazio>
          ) : (
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Modelo</th>
                  <th className={TH_CLASS}>Chamadas</th>
                  <th className={TH_CLASS}>Tokens</th>
                  <th className={TH_CLASS}>Custo est.</th>
                </tr>
              </thead>
              <tbody>
                {d.porModelo.map((m) => (
                  <tr key={m.modelo} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink)]">
                      {m.modelo}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                      {m.chamadas}
                      {m.falhas ? (
                        <span className="text-[var(--danger)]"> · {m.falhas} falha(s)</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                      {formatarNumero(m.tokensIn)} → {formatarNumero(m.tokensOut)}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                      {formatarUsd(m.custo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>
      </div>

      <Secao titulo="Falhas recentes" carregando={carregando} semPadding altura="h-32">
        {!d || d.falhasRecentes.length === 0 ? (
          <Vazio>Nenhuma falha no período.</Vazio>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Quando</th>
                <th className={TH_CLASS}>Feature</th>
                <th className={TH_CLASS}>Modelo</th>
                <th className={TH_CLASS}>Erro</th>
              </tr>
            </thead>
            <tbody>
              {d.falhasRecentes.map((f, i) => (
                <tr
                  key={`${f.quando}-${i}`}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                    {formatarDataHoraBRT(f.quando)}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">
                    {f.feature}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {f.modelo}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--danger)]">
                    {f.erro || "—"}
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
