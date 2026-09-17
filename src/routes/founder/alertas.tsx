import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAcaoAdmin } from "@/lib/audit-log";
import { toastErro } from "@/lib/toast";
import { getFounderAlertas, type FounderAlerta } from "@/lib/founder-overview.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, BTN_LINK } from "@/lib/botoes";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/alertas")({
  component: Alertas,
});

const REGRAS: { tipo: string; descricao: string }[] = [
  { tipo: "servico_indisponivel", descricao: "serviço crítico em duas verificações seguidas" },
  {
    tipo: "pico_erros_app",
    descricao: "erros do app em 24h acima de 3× a média dos últimos 7 dias (mínimo 10)",
  },
  { tipo: "falha_pagamento", descricao: "assinatura em past_due ou unpaid" },
  { tipo: "jobs_falhos", descricao: "execução de pg_cron falhou nas últimas 24h" },
  { tipo: "ia_falhas", descricao: "mais de 30% das chamadas de IA falharam (mínimo 5 chamadas)" },
];

function formatarHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Alertas() {
  const [alertas, setAlertas] = useState<FounderAlerta[] | null>(null);
  const [erro, setErro] = useState(false);

  const carregar = async () => {
    try {
      const r = await getFounderAlertas();
      setAlertas(r.alertas);
    } catch {
      setErro(true);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const resolver = async (id: string, titulo: string) => {
    const { error } = await supabase
      .from("founder_alertas")
      .update({ status: "resolvido", resolvido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toastErro("Não consegui marcar esse alerta como resolvido. Tenta de novo.");
      return;
    }
    await logAcaoAdmin("resolver_founder_alerta", id, { titulo });
    carregar();
  };

  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os alertas.</div>;

  const abertos = alertas?.filter((a) => a.status === "aberto") ?? [];
  const resolvidos = alertas?.filter((a) => a.status === "resolvido") ?? [];

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Avaliados a cada 10 minutos pelo monitor, com comparação contra a média dos últimos 7 dias
        quando existe histórico. Um alerta fecha sozinho quando a condição some.
      </p>

      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        {alertas ? `${abertos.length} aberto(s)` : "Abertos"}
      </p>
      <div className="mb-8 space-y-3">
        {!alertas ? (
          <SkeletonBloco className="h-20" />
        ) : abertos.length === 0 ? (
          <div className="rounded-xl border border-[var(--secondary)]/30 bg-[var(--secondary-light)]/30 p-4">
            <p className="font-sans text-[13px] text-[var(--secondary-text)]">
              Nenhum alerta aberto no momento.
            </p>
          </div>
        ) : (
          abertos.map((a) => (
            <div
              key={a.id}
              className={`rounded-xl border p-4 ${
                a.severidade === "critico"
                  ? "border-[var(--danger)]/25 bg-[var(--danger-soft)]"
                  : "border-[var(--highlight)]/40 bg-[var(--highlight)]/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className={`font-sans text-[13px] font-medium ${
                      a.severidade === "critico" ? "text-[var(--danger)]" : "text-[var(--ink)]"
                    }`}
                  >
                    {a.titulo}
                  </p>
                  {a.mensagem && (
                    <p className="mt-0.5 font-sans text-[12px] text-[var(--ink-soft)]">
                      {a.mensagem}
                    </p>
                  )}
                  <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">
                    {a.severidade === "critico" ? "crítico" : "atenção"} ·{" "}
                    {formatarHora(a.criadoEm)}
                    {a.link && (
                      <>
                        {" · "}
                        <Link
                          to={a.link}
                          search={(prev) => prev}
                          className={`${BTN_LINK} text-[11px]`}
                        >
                          ver contexto →
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => resolver(a.id, a.titulo)}
                  className="shrink-0 cursor-pointer font-sans text-[12px] text-[var(--ink-soft)] hover:underline"
                >
                  Resolver
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Resolvidos recentemente
      </p>
      <div className={`${CARD_CLASS} mb-8`}>
        {!alertas ? (
          <SkeletonBloco className="h-24" />
        ) : resolvidos.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--muted)]">Nenhum ainda.</p>
        ) : (
          resolvidos.map((a) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="font-sans text-[13px] text-[var(--ink)]">{a.titulo}</p>
                <p className="font-sans text-[11px] text-[var(--muted)]">
                  aberto {formatarHora(a.criadoEm)}
                  {a.resolvidoEm ? ` · resolvido ${formatarHora(a.resolvidoEm)}` : ""}
                </p>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Regras ativas
      </p>
      <div className={CARD_CLASS}>
        {REGRAS.map((r) => (
          <div key={r.tipo} className="border-b border-[var(--line)] px-5 py-3 last:border-0">
            <p className="font-mono text-[12px] text-[var(--ink)]">{r.tipo}</p>
            <p className="font-sans text-[12px] text-[var(--muted)]">{r.descricao}</p>
          </div>
        ))}
        <p className="px-5 py-3 font-sans text-[12px] text-[var(--muted)]">
          Regras de API (erros e latência), queda de ativação e queda de uso entram com a
          instrumentação de eventos (blocos 2 e 3).
        </p>
      </div>
    </>
  );
}
