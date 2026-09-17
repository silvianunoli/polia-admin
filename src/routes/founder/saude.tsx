import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getFounderSaude } from "@/lib/founder-overview.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { SkeletonBloco } from "@/components/Skeleton";
import { EstadoPill } from "@/components/founder/EstadoPill";

export const Route = createFileRoute("/founder/saude")({
  component: SaudeDoSistema,
});

type Dados = Awaited<ReturnType<typeof getFounderSaude>>;

function formatarHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SaudeDoSistema() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setDados(await getFounderSaude());
      } catch {
        setErro(true);
      }
    })();
  }, []);

  if (erro) {
    return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a saúde do sistema.</div>;
  }

  const criticos = dados?.servicos.filter((s) => s.status === "critico").length ?? 0;
  const operacionais = dados?.servicos.filter((s) => s.status === "operacional").length ?? 0;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Verificação a cada 10 minutos pelo monitor (pg_cron → founder-monitor). Estado consolidado:{" "}
        {dados ? (
          <strong className="text-[var(--ink)]">
            {criticos > 0
              ? `atenção necessária, ${criticos} serviço(s) com problema`
              : `sistema saudável, ${operacionais}/${dados.servicos.length} operacionais`}
          </strong>
        ) : (
          "…"
        )}
      </p>

      <div className={`${CARD_CLASS} mb-6`}>
        {!dados ? (
          <SkeletonBloco className="h-64" />
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Serviço</th>
                <th className={TH_CLASS}>Status</th>
                <th className={TH_CLASS}>Informação</th>
                <th className={TH_CLASS}>Latência</th>
                <th className={TH_CLASS}>Checado</th>
              </tr>
            </thead>
            <tbody>
              {dados.servicos.map((s) => (
                <tr key={s.service} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-3 font-sans text-[14px] text-[var(--ink)]">{s.label}</td>
                  <td className="px-5 py-3">
                    <EstadoPill estado={s.status} />
                  </td>
                  <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                    {s.detalhe}
                  </td>
                  <td className="px-5 py-3 font-mono text-[13px] text-[var(--ink-soft)]">
                    {s.latenciaMs === null ? "—" : `${s.latenciaMs} ms`}
                  </td>
                  <td className="px-5 py-3 font-sans text-[12px] text-[var(--muted)]">
                    {s.checadoEm ? formatarHora(s.checadoEm) : "nunca"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Últimas verificações
      </p>
      <div className={CARD_CLASS}>
        {!dados ? (
          <SkeletonBloco className="h-40" />
        ) : dados.historico.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
            Nenhuma verificação registrada ainda.
          </p>
        ) : (
          <div className="max-h-[480px] overflow-y-auto">
            {dados.historico.map((h, i) => (
              <div
                key={`${h.service}-${h.checadoEm}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-2.5 last:border-0"
              >
                <span className="w-24 shrink-0 font-sans text-[12px] text-[var(--muted)]">
                  {formatarHora(h.checadoEm)}
                </span>
                <span className="flex-1 font-sans text-[13px] text-[var(--ink)]">{h.label}</span>
                <span className="font-sans text-[12px] text-[var(--muted)]">
                  {h.latenciaMs === null ? "" : `${h.latenciaMs} ms`}
                </span>
                <EstadoPill estado={h.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
