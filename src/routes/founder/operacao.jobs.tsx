import { createFileRoute } from "@tanstack/react-router";
import { getOperacaoJobs } from "@/lib/founder-operacao.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarDataHoraBRT, formatarDuracao } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { EstadoPill, type Estado } from "@/components/founder/EstadoPill";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/operacao/jobs")({
  component: Jobs,
});

function estadoDoJob(j: {
  ativo: boolean;
  falhos24h: number;
  falhos7d: number;
  ultimoStatus: string | null;
}): Estado {
  if (!j.ativo) return "sem_dados";
  if (j.falhos24h > 0 || j.ultimoStatus === "failed") return "critico";
  if (j.falhos7d > 0) return "atencao";
  return "operacional";
}

function Jobs() {
  const { dados, carregando, erro } = useCarregar(() => getOperacaoJobs(), []);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os jobs.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Jobs agendados no pg_cron do Supabase. Contagens das últimas 24 h (falhas também em 7 dias).
        Não obedece ao filtro de período: job é "está rodando agora?", não histórico.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Jobs"
          valor={d?.jobs.length}
          descricao="agendados"
          carregando={carregando}
        />
        <StatCard
          label="Execuções"
          valor={d?.totalExecutados24h}
          descricao="últimas 24 h"
          carregando={carregando}
        />
        <StatCard
          label="Falhas"
          valor={d?.totalFalhos24h}
          descricao="últimas 24 h"
          carregando={carregando}
          invertido
        />
        <StatCard
          label="Pendentes"
          valor={d?.totalPendentes}
          descricao="em execução agora"
          carregando={carregando}
        />
      </div>

      <Secao titulo="Jobs agendados" carregando={carregando} semPadding altura="h-48">
        {!d || d.jobs.length === 0 ? (
          <Vazio>Nenhum job agendado.</Vazio>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Job</th>
                <th className={TH_CLASS}>Estado</th>
                <th className={TH_CLASS}>Agenda</th>
                <th className={TH_CLASS}>24 h</th>
                <th className={TH_CLASS}>Falhas 7 d</th>
                <th className={TH_CLASS}>Duração</th>
                <th className={TH_CLASS}>Última execução</th>
              </tr>
            </thead>
            <tbody>
              {d.jobs.map((j) => (
                <tr key={j.jobid} className="border-b border-[var(--line)] last:border-0 align-top">
                  <td className="px-5 py-3">
                    <p className="font-mono text-[13px] text-[var(--ink)]">{j.nome}</p>
                    {j.ultimoErro ? (
                      <p className="mt-1 max-w-[420px] font-sans text-[11px] text-[var(--danger)]">
                        {j.ultimoErro}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-3">
                    <EstadoPill
                      estado={estadoDoJob(j)}
                      texto={!j.ativo ? "Desativado" : undefined}
                    />
                  </td>
                  <td className="px-5 py-3 font-mono text-[12px] text-[var(--ink-soft)]">
                    {j.agenda}
                  </td>
                  <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink)]">
                    {j.executados24h}
                    {j.falhos24h ? (
                      <span className="text-[var(--danger)]"> · {j.falhos24h} falha(s)</span>
                    ) : null}
                    {j.pendentes ? (
                      <span className="text-[var(--muted)]"> · {j.pendentes} rodando</span>
                    ) : null}
                  </td>
                  <td
                    className={`px-5 py-3 font-sans text-[13px] ${j.falhos7d ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"}`}
                  >
                    {j.falhos7d}
                  </td>
                  <td className="px-5 py-3 font-sans text-[12px] text-[var(--ink-soft)]">
                    {j.duracaoMediaS === null
                      ? "—"
                      : `média ${formatarDuracao(j.duracaoMediaS)} · máx ${formatarDuracao(j.duracaoMaxS)}`}
                  </td>
                  <td className="px-5 py-3 font-sans text-[12px] text-[var(--muted)]">
                    {formatarDataHoraBRT(j.ultimaExecucao)}
                    {j.ultimoStatus ? ` · ${j.ultimoStatus}` : ""}
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
