import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAcaoAdmin } from "@/lib/audit-log";
import { toastErro, toastSucesso } from "@/lib/toast";
import { getFounderOverview, type FounderOverview } from "@/lib/founder-overview.functions";
import { CARD_CLASS, BTN_SECUNDARIO, ALERTA_ERRO_CLASS, BTN_LINK } from "@/lib/botoes";
import { SkeletonBloco } from "@/components/Skeleton";
import { EstadoPill } from "@/components/founder/EstadoPill";
import { StatCard } from "@/components/founder/StatCard";
import { useCarregar } from "@/components/founder/useCarregar";
import { getFounderFlagsResumo } from "@/lib/founder-flags.functions";

export const Route = createFileRoute("/founder/")({
  component: FounderPulse,
});

function formatarBRL(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FounderPulse() {
  const search = useSearch({ from: "/founder" });
  const [dados, setDados] = useState<FounderOverview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const r = await getFounderOverview({ data: search });
      setDados(r);
      setErro(false);
    } catch {
      setErro(true);
    } finally {
      setCarregando(false);
    }
  }, [search]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const verificarAgora = async () => {
    setVerificando(true);
    try {
      const { error } = await supabase.functions.invoke("founder-monitor", { body: {} });
      if (error) throw error;
      await logAcaoAdmin("founder_verificar_agora");
      toastSucesso("Verificação concluída.");
      await carregar();
    } catch {
      toastErro("Não consegui rodar a verificação agora. Tenta de novo em instantes.");
    } finally {
      setVerificando(false);
    }
  };

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
    carregar();
  };

  if (erro) {
    return (
      <div className={ALERTA_ERRO_CLASS}>
        Não consegui carregar o Founder Pulse agora. Tenta recarregar a página.
      </div>
    );
  }

  const n = dados?.numeros;
  const criticos = dados?.servicos.filter((s) => s.status === "critico").length ?? 0;
  const operacionais = dados?.servicos.filter((s) => s.status === "operacional").length ?? 0;

  return (
    <>
      <div className={`${CARD_CLASS} mb-6 p-6`}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Founder Pulse
          </p>
          <button
            type="button"
            onClick={verificarAgora}
            disabled={verificando || carregando}
            className={BTN_SECUNDARIO}
          >
            {verificando ? "Verificando…" : "Verificar agora"}
          </button>
        </div>
        {carregando || !dados ? (
          <SkeletonBloco className="h-14" />
        ) : (
          <p className="font-sans text-[17px] leading-relaxed text-[var(--ink)]">{dados.pulso}</p>
        )}
        {dados && dados.baselineDias < 3 && (
          <p className="mt-3 font-sans text-[12px] text-[var(--muted)]">
            Ainda sem base de comparação: os alertas por anomalia começam depois de 3 dias de
            snapshot ({dados.baselineDias}/3).
          </p>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard
          label="Usuárias"
          valor={n?.usuariasTotal.atual}
          variacaoPct={n?.usuariasTotal.variacaoPct}
          descricao="total cadastradas"
          carregando={carregando}
          href="/founder/numeros"
        />
        <StatCard
          label="Novas contas"
          valor={n?.novasContas.atual}
          variacaoPct={n?.novasContas.variacaoPct}
          descricao="no período"
          carregando={carregando}
          href="/founder/numeros"
        />
        <StatCard
          label="Ativas"
          valor={n?.usuariasAtivas.atual}
          variacaoPct={n?.usuariasAtivas.variacaoPct}
          descricao="com ação real no período"
          carregando={carregando}
          href="/founder/numeros"
        />
        <StatCard
          label="Assinantes"
          valor={n?.assinantes.atual}
          variacaoPct={n?.assinantes.variacaoPct}
          descricao="ativas agora"
          carregando={carregando}
          href="/founder/negocio/assinaturas"
        />
        <StatCard
          label="MRR"
          valor={n ? formatarBRL(n.mrrCentavos.atual ?? 0) : null}
          variacaoPct={n?.mrrCentavos.variacaoPct}
          descricao="via Stripe"
          carregando={carregando}
          href="/founder/negocio/receita"
        />
        <StatCard
          label="Churn"
          valor={n?.churnPct.atual === null ? null : `${n?.churnPct.atual?.toFixed(1)}%`}
          semDados={n?.churnPct.atual === null}
          descricao="no período"
          carregando={carregando}
          href="/founder/negocio/churn"
        />
        <StatCard
          label="Erros"
          valor={n?.erros.atual}
          variacaoPct={n?.erros.variacaoPct}
          descricao="registrados no período"
          carregando={carregando}
          invertido
          href="/founder/operacao/erros"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-6`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
              Saúde do sistema
            </p>
            {dados && dados.atualizadoEm && (
              <span className="font-sans text-[12px] text-[var(--muted)]">
                {criticos > 0
                  ? `Atenção necessária — ${criticos} serviço(s) com problema`
                  : `Sistema saudável — ${operacionais}/${dados.servicos.length} operacionais`}
              </span>
            )}
          </div>
          {carregando || !dados ? (
            <SkeletonBloco className="h-48" />
          ) : (
            <div className="space-y-3">
              {dados.servicos.map((s) => (
                <div
                  key={s.service}
                  className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"
                >
                  <span className="font-sans text-[14px] text-[var(--ink)]">{s.label}</span>
                  <div className="text-right">
                    <EstadoPill estado={s.status} />
                    {s.detalhe && (
                      <p className="mt-0.5 font-sans text-[11px] text-[var(--muted)]">
                        {s.detalhe}
                      </p>
                    )}
                  </div>
                </div>
              ))}
              <Link
                to="/founder/saude"
                search={(prev) => prev}
                className={`${BTN_LINK} text-[13px]`}
              >
                Ver histórico de verificações →
              </Link>
            </div>
          )}
        </div>

        <div className={`${CARD_CLASS} p-6`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
              Alertas
            </p>
            <Link
              to="/founder/alertas"
              search={(prev) => prev}
              className={`${BTN_LINK} text-[13px]`}
            >
              Ver todos →
            </Link>
          </div>
          {carregando || !dados ? (
            <SkeletonBloco className="h-48" />
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
                      {a.link && (
                        <Link
                          to={a.link}
                          search={(prev) => prev}
                          className={`${BTN_LINK} mt-1 inline-block text-[12px]`}
                        >
                          Ver contexto →
                        </Link>
                      )}
                    </div>
                    <button
                      type="button"
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

      <FlagsResumo />
    </>
  );
}

function FlagsResumo() {
  const { dados, carregando } = useCarregar(() => getFounderFlagsResumo(), []);
  const ligadas = dados?.filter((f) => f.estado !== "off").length ?? 0;
  return (
    <div className={`${CARD_CLASS} p-6`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Feature flags (prod)
        </p>
        <Link
          to="/founder/features/flags"
          search={(prev) => prev}
          className={`${BTN_LINK} text-[13px]`}
        >
          {dados ? `${ligadas}/${dados.length} ligadas · gerenciar →` : "gerenciar →"}
        </Link>
      </div>
      {carregando || !dados ? (
        <SkeletonBloco className="h-16" />
      ) : dados.length === 0 ? (
        <p className="font-sans text-[13px] text-[var(--muted)]">Nenhuma flag cadastrada.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {dados.map((f) => (
            <div
              key={f.key}
              className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-1.5"
            >
              <span className="truncate font-mono text-[12px] text-[var(--ink)]">{f.key}</span>
              <span className="shrink-0 font-sans text-[12px] text-[var(--ink-soft)]">
                {f.estado === "off" ? "OFF" : f.estado === "beta" ? "Beta" : "ON"} · {f.rolloutPct}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
