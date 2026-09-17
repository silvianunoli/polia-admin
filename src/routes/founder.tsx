import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAcaoAdmin } from "@/lib/audit-log";
import { toastErro, toastSucesso } from "@/lib/toast";
import { getFounderOverview, type FounderOverview } from "@/lib/founder-dashboard.functions";
import { CARD_CLASS, BTN_SECUNDARIO, ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { SkeletonBloco, SkeletonNumero } from "@/components/Skeleton";

export const Route = createFileRoute("/founder")({
  head: () => ({ meta: [{ title: "Founder · Pólia" }] }),
  component: FounderDashboard,
});

const PERIODOS = [
  { chave: "1", label: "Hoje" },
  { chave: "7", label: "7 dias" },
  { chave: "30", label: "30 dias" },
  { chave: "90", label: "90 dias" },
] as const;

type ChavePeriodo = (typeof PERIODOS)[number]["chave"];

function formatarBRL(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function segundosDesde(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}

function tempoRelativo(iso: string) {
  const s = segundosDesde(iso);
  if (s < 60) return `há ${s} segundo(s)`;
  if (s < 3600) return `há ${Math.floor(s / 60)} minuto(s)`;
  return `há ${Math.floor(s / 3600)} hora(s)`;
}

const STATUS_ESTILO: Record<string, { cor: string; ponto: string; texto: string }> = {
  operacional: {
    cor: "text-[var(--secondary-text)]",
    ponto: "bg-[var(--secondary)]",
    texto: "Operacional",
  },
  atencao: { cor: "text-[var(--highlight-ink)]", ponto: "bg-[var(--highlight)]", texto: "Atenção" },
  critico: { cor: "text-[var(--danger)]", ponto: "bg-[var(--danger)]", texto: "Crítico" },
  sem_dados: { cor: "text-[var(--muted)]", ponto: "bg-[var(--line)]", texto: "Sem dados" },
};

function PontoStatus({ status }: { status: string }) {
  const s = STATUS_ESTILO[status] ?? STATUS_ESTILO.sem_dados;
  return (
    <span className={`inline-flex items-center gap-2 font-sans text-[13px] ${s.cor}`}>
      <span className={`h-2 w-2 rounded-full ${s.ponto}`} aria-hidden="true" />
      {s.texto}
    </span>
  );
}

function FounderDashboard() {
  const [dados, setDados] = useState<FounderOverview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(false);
  const [periodo, setPeriodo] = useState<ChavePeriodo>("7");

  const carregar = async (mostrarSpinnerBotao = false) => {
    if (mostrarSpinnerBotao) setAtualizando(true);
    try {
      const overview = await getFounderOverview();
      setDados(overview);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const numerosPeriodo = dados?.periodos[periodo];

  const servicosCriticos = useMemo(
    () => dados?.servicos.filter((s) => s.status === "critico").length ?? 0,
    [dados],
  );
  const servicosOperacionais = useMemo(
    () => dados?.servicos.filter((s) => s.status === "operacional").length ?? 0,
    [dados],
  );

  const resolverAlerta = async (id: string, titulo: string) => {
    const { error } = await supabase
      .from("founder_alertas")
      .update({ status: "resolvido", resolvido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toastErro("Não consegui marcar esse alerta como resolvido. Tenta de novo.");
      return;
    }
    await logAcaoAdmin("resolver_founder_alerta", id, { titulo });
    toastSucesso("Alerta marcado como resolvido.");
    carregar();
  };

  if (erro) {
    return (
      <>
        <h1 className="font-cabinet mb-4 text-[40px] text-[var(--ink)]">Pólia Founder</h1>
        <div className={ALERTA_ERRO_CLASS}>
          Não consegui carregar o Founder Dashboard agora. Tenta recarregar a página.
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-cabinet text-[40px] text-[var(--ink)]">Pólia Founder</h1>
          {dados && (
            <p className="mt-1 font-sans text-[13px] text-[var(--muted)]">
              Última atualização: {tempoRelativo(dados.atualizadoEm)}
            </p>
          )}
        </div>
        <button
          onClick={() => carregar(true)}
          disabled={atualizando || carregando}
          className={BTN_SECUNDARIO}
        >
          {atualizando ? "Verificando…" : "Verificar agora"}
        </button>
      </div>

      {/* Founder Pulse */}
      <div className={`${CARD_CLASS} mb-6 p-6`}>
        {carregando || !dados ? (
          <SkeletonBloco className="h-16" />
        ) : (
          <p className="font-sans text-[16px] leading-relaxed text-[var(--ink)]">{dados.pulso}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Saúde do sistema */}
        <div className={`${CARD_CLASS} p-6`}>
          <div className="mb-4 flex items-center justify-between">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
              Saúde do sistema
            </p>
            {dados && (
              <span className="font-sans text-[12px] text-[var(--muted)]">
                {servicosCriticos > 0
                  ? `Atenção necessária — ${servicosCriticos} serviço(s) com problema`
                  : `Sistema saudável — ${servicosOperacionais}/${dados.servicos.length} operacionais`}
              </span>
            )}
          </div>
          {carregando || !dados ? (
            <SkeletonBloco className="h-40" />
          ) : (
            <div className="space-y-3">
              {dados.servicos.map((s) => (
                <div
                  key={s.service}
                  className="flex items-center justify-between border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"
                >
                  <span className="font-sans text-[14px] text-[var(--ink)]">{s.label}</span>
                  <div className="text-right">
                    <PontoStatus status={s.status} />
                    {s.detalhe && (
                      <p className="mt-0.5 font-sans text-[11px] text-[var(--muted)]">
                        {s.detalhe}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Alertas */}
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Alertas
          </p>
          {carregando || !dados ? (
            <SkeletonBloco className="h-40" />
          ) : dados.alertas.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--secondary-text)]">
              Nenhum alerta aberto no momento.
            </p>
          ) : (
            <div className="space-y-3">
              {dados.alertas.map((a) => (
                <div
                  key={a.id}
                  className={`rounded-xl border p-4 ${
                    a.severidade === "critico"
                      ? "border-[var(--danger)]/25 bg-[var(--danger-soft)]"
                      : "border-[var(--highlight)]/40 bg-[var(--highlight)]/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
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
                    </div>
                    <button
                      onClick={() => resolverAlerta(a.id, a.titulo)}
                      className="shrink-0 cursor-pointer font-sans text-[12px] text-[var(--ink-soft)] hover:underline"
                    >
                      Resolver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Números principais */}
      <div className={`${CARD_CLASS} mt-6 p-6`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Números principais
          </p>
          <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
            {PERIODOS.map((p) => (
              <button
                key={p.chave}
                onClick={() => setPeriodo(p.chave)}
                className={`rounded-md px-3 py-1.5 font-sans text-[12px] font-medium ${
                  periodo === p.chave
                    ? "bg-white text-[var(--ink)] shadow-sm"
                    : "text-[var(--ink-soft)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              label: "Usuárias",
              valor: dados ? String(dados.numeros.usuariasTotal) : null,
              desc: "total",
            },
            {
              label: "Novas contas",
              valor: numerosPeriodo ? String(numerosPeriodo.novasContas) : null,
              desc: "no período",
            },
            {
              label: "Usuárias ativas",
              valor: numerosPeriodo ? String(numerosPeriodo.usuariasAtivas) : null,
              desc: "atualizaram algo no período",
            },
            {
              label: "Assinantes",
              valor: dados ? String(dados.numeros.assinantes) : null,
              desc: "ativos agora",
            },
            {
              label: "MRR",
              valor: dados ? formatarBRL(dados.numeros.mrrCentavos) : null,
              desc: "valor real via Stripe",
            },
            {
              label: "Churn",
              valor: numerosPeriodo
                ? numerosPeriodo.churnPct === null
                  ? "sem dados"
                  : `${numerosPeriodo.churnPct.toFixed(1)}%`
                : null,
              desc: "no período",
            },
          ].map((m) => (
            <div key={m.label}>
              <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
                {m.label}
              </p>
              <p className="font-cabinet text-[24px] leading-none text-[var(--ink)]">
                {carregando || m.valor === null ? <SkeletonNumero /> : m.valor}
              </p>
              <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">{m.desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 font-sans text-[12px] text-[var(--muted)]">
          Erros registrados no período: {numerosPeriodo ? numerosPeriodo.errosNoPeriodo : "…"}{" "}
          (contagem bruta — ainda sem volume de requisições pra virar taxa percentual).
        </p>
      </div>
    </>
  );
}
