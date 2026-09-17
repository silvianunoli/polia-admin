import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { getOperacaoLogs } from "@/lib/founder-operacao.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarDataHoraBRT, formatarMs } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista, BarrasDiarias } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/operacao/logs")({
  component: Logs,
});

const DESCRICAO_TIPO: Record<string, string> = {
  api_error: "server function que lançou erro",
  job_failure: "job do pg_cron que falhou",
  integration_failure: "integração externa recusou (Google, Stripe, Resend…)",
  latency: "chamada acima do limite de latência",
  ia_call: "chamada de IA concluída (com latência)",
  ia_failure: "chamada de IA que falhou",
  webhook_failure: "webhook do Stripe que não processou",
};

function Logs() {
  const search = useSearch({ from: "/founder" });
  const [filtro, setFiltro] = useState<string>("");
  const { dados, carregando, erro } = useCarregar(
    () => getOperacaoLogs({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os logs.</div>;
  const d = dados;
  const lista = (d?.recentes ?? []).filter((e) => !filtro || e.tipo === filtro);

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Eventos de sistema gravados pelo próprio app e pelas Edge Functions em{" "}
        <code className="font-mono text-[12px]">founder_eventos_sistema</code>: erro de API, falha
        de integração, chamada de IA, webhook. Não é o log bruto do Cloudflare, é o que a Pólia
        decidiu registrar.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard
          label="Eventos"
          valor={d?.total}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Falhas"
          valor={d?.falhas}
          descricao="tudo que não é ia_call"
          carregando={carregando}
          invertido
        />
        <StatCard label="Tipos distintos" valor={d?.porTipo.length} carregando={carregando} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Secao titulo="Falhas por dia" carregando={carregando} className="lg:col-span-2">
          {d && d.serie.some((p) => p.valor > 0) ? (
            <BarrasDiarias pontos={d.serie} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">Nenhuma falha no período.</p>
          )}
        </Secao>
        <Secao titulo="Por tipo" carregando={carregando}>
          <BarraLista
            itens={(d?.porTipo ?? []).map((t) => ({ ...t, detalhe: DESCRICAO_TIPO[t.rotulo] }))}
            vazio="Nenhum evento no período."
          />
        </Secao>
      </div>

      <Secao
        titulo="Eventos recentes"
        carregando={carregando}
        semPadding
        altura="h-48"
        acao={
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            aria-label="Filtrar por tipo"
            className="rounded-lg border border-[var(--line)] bg-white px-2 py-1 font-sans text-[12px] text-[var(--ink)]"
          >
            <option value="">todos os tipos</option>
            {(d?.porTipo ?? []).map((t) => (
              <option key={t.rotulo} value={t.rotulo}>
                {t.rotulo}
              </option>
            ))}
          </select>
        }
      >
        {lista.length === 0 ? (
          <Vazio>Nenhum evento no período.</Vazio>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Quando</th>
                  <th className={TH_CLASS}>Tipo</th>
                  <th className={TH_CLASS}>Origem</th>
                  <th className={TH_CLASS}>Serviço</th>
                  <th className={TH_CLASS}>Latência</th>
                  <th className={TH_CLASS}>Detalhes</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                      {formatarDataHoraBRT(e.quando)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink)]">
                      {e.tipo}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                      {e.origem}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                      {e.servico ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                      {formatarMs(e.latenciaMs)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--muted)]">
                      {e.detalhes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  );
}
