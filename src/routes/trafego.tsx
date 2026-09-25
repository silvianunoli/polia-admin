import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, RefreshCcw } from "lucide-react";
import { SkeletonBloco, SkeletonNumero } from "@/components/Skeleton";
import { BarrasDiarias } from "@/components/founder/Graficos";
import {
  listarAnunciosDaCampanha,
  listarCampanhasMeta,
  obterTendenciaMeta,
  type Alerta,
  type AnuncioMeta,
  type CampanhaMeta,
  type ComparacaoPeriodo,
  type PontoDiario,
} from "@/lib/meta-ads.functions";
import {
  btnOutline,
  cardClass,
  formatarDataHora,
  formatarReais,
  tdClass,
  tdMuted,
  thClass,
} from "@/lib/crm-ui";

export const Route = createFileRoute("/trafego")({
  head: () => ({ meta: [{ title: "Tráfego · Pólia" }] }),
  component: TrafegoMeta,
});

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Ativa", className: "bg-[var(--secondary)] text-[var(--secondary-ink)]" },
  PAUSED: { label: "Pausada", className: "bg-[var(--line)] text-[var(--ink-soft)]" },
  CAMPAIGN_PAUSED: { label: "Pausada", className: "bg-[var(--line)] text-[var(--ink-soft)]" },
  ARCHIVED: { label: "Arquivada", className: "bg-[var(--line)] text-[var(--muted)]" },
  DELETED: { label: "Excluída", className: "bg-[var(--line)] text-[var(--muted)]" },
  PENDING_REVIEW: {
    label: "Em análise",
    className: "bg-[var(--accent)] text-[var(--accent-ink)]",
  },
  DISAPPROVED: { label: "Reprovada", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  WITH_ISSUES: { label: "Com problema", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

function badgeStatus(status: string) {
  const meta = STATUS_LABEL[status] ?? {
    label: status,
    className: "bg-[var(--line)] text-[var(--ink-soft)]",
  };
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 font-sans text-[11px] font-semibold ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function formatarNumero(v: number): string {
  return v.toLocaleString("pt-BR");
}

function formatarPercentual(v: number): string {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatarVariacao(atual: number, anterior: number): string {
  if (anterior === 0)
    return atual === 0 ? "sem dado no período anterior" : "período anterior zerado";
  const pct = ((atual - anterior) / anterior) * 100;
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toFixed(0)}% vs. 30 dias anteriores`;
}

function mensagemAlerta(a: Alerta): string {
  if (a.tipo === "sem_lead") {
    return `Gastou ${formatarReais(a.gasto ?? 0)} nos últimos 30 dias sem gerar nenhum lead.`;
  }
  if (a.tipo === "cpl_alto") {
    return `Custo por lead de ${formatarReais(a.custoPorLead ?? 0)} bem acima da média da conta (${formatarReais(a.cplMedioConta ?? 0)}).`;
  }
  return `Pausada há ${a.diasParada} dias — considera arquivar se não for retomar.`;
}

function LinhaAnuncios({ campanhaId, campanhaNome }: { campanhaId: string; campanhaNome: string }) {
  const [anuncios, setAnuncios] = useState<AnuncioMeta[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await listarAnunciosDaCampanha({ data: { campanhaId } });
        if (vivo) setAnuncios(r.anuncios);
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Não conseguimos carregar os anúncios.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [campanhaId]);

  return (
    <tr>
      <td colSpan={9} className="bg-[var(--surface)] p-4">
        <p className="mb-3 font-sans text-[12px] font-semibold uppercase tracking-[1px] text-[var(--muted)]">
          Anúncios de {campanhaNome}
        </p>
        {erro ? (
          <p className="font-sans text-[13px] text-[var(--danger)]">{erro}</p>
        ) : anuncios === null ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <SkeletonBloco key={i} className="h-10" />
            ))}
          </div>
        ) : anuncios.length === 0 ? (
          <p className="font-sans text-[13px] text-[var(--muted)]">
            Nenhum anúncio nessa campanha.
          </p>
        ) : (
          <div className="space-y-2">
            {anuncios.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-3"
              >
                {a.thumbnailUrl ? (
                  <img
                    src={a.thumbnailUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--line)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-sans text-[13px] font-medium text-[var(--ink)]">
                    {a.titulo || a.nome}
                  </p>
                  <p className="font-sans text-[12px] text-[var(--muted)]">
                    {formatarReais(a.gasto)} · {formatarNumero(a.impressoes)} impressões ·{" "}
                    {formatarNumero(a.cliques)} cliques · {a.leads} lead{a.leads === 1 ? "" : "s"}
                    {a.custoPorLead !== null ? ` · CPL ${formatarReais(a.custoPorLead)}` : ""}
                  </p>
                </div>
                {badgeStatus(a.status)}
              </div>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

function TrafegoMeta() {
  const [campanhas, setCampanhas] = useState<CampanhaMeta[]>([]);
  const [resumo, setResumo] = useState({
    gastoTotal: 0,
    leadsTotal: 0,
    campanhasAtivas: 0,
    cplMedioConta: null as number | null,
  });
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [diario, setDiario] = useState<PontoDiario[]>([]);
  const [comparacao, setComparacao] = useState<ComparacaoPeriodo | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const [r, tendencia] = await Promise.all([listarCampanhasMeta(), obterTendenciaMeta()]);
      setCampanhas(r.campanhas);
      setResumo(r.resumo);
      setAlertas(r.alertas);
      setAtualizadoEm(r.atualizadoEm);
      setDiario(tendencia.diario);
      setComparacao(tendencia.comparacao);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não conseguimos carregar as campanhas agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Tráfego (Meta Ads)</h1>
          <p className="font-sans text-[14px] text-[var(--muted)]">
            Campanhas da Conta de Anúncios Pólia, últimos 30 dias.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {atualizadoEm && !carregando && (
            <span className="font-sans text-[12px] text-[var(--muted)]">
              Atualizado {formatarDataHora(atualizadoEm)}
            </span>
          )}
          <button type="button" onClick={carregar} disabled={carregando} className={btnOutline}>
            <span className="inline-flex items-center gap-2">
              <RefreshCcw size={14} aria-hidden="true" />
              Atualizar
            </span>
          </button>
        </div>
      </div>

      {erro && (
        <div className="mb-6 rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-5">
          <p className="font-sans text-[13px] text-[var(--danger)]">{erro}</p>
        </div>
      )}

      {!carregando && alertas.length > 0 && (
        <div className="mb-6 space-y-2">
          {alertas.map((a, i) => (
            <div
              key={`${a.campanhaId}-${a.tipo}-${i}`}
              className="flex items-start gap-3 rounded-2xl border border-[var(--highlight)]/40 bg-[var(--accent)]/20 p-4"
            >
              <AlertTriangle
                size={16}
                className="mt-0.5 shrink-0 text-[var(--accent-ink)]"
                aria-hidden="true"
              />
              <p className="font-sans text-[13px] text-[var(--ink)]">
                <span className="font-semibold">{a.campanhaNome}</span>
                {" — "}
                {mensagemAlerta(a)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          {
            label: "Gasto (30 dias)",
            valor: formatarReais(resumo.gastoTotal),
            cor: "var(--ink)",
            variacao: comparacao
              ? formatarVariacao(comparacao.gastoAtual, comparacao.gastoAnterior)
              : null,
          },
          {
            label: "Leads (30 dias)",
            valor: formatarNumero(resumo.leadsTotal),
            cor: "var(--secondary-text)",
            variacao: comparacao
              ? formatarVariacao(comparacao.leadsAtual, comparacao.leadsAnterior)
              : null,
          },
          {
            label: "Custo por Lead",
            valor: resumo.cplMedioConta === null ? "—" : formatarReais(resumo.cplMedioConta),
            cor: "var(--ink)",
            variacao: null,
          },
          {
            label: "Campanhas ativas",
            valor: formatarNumero(resumo.campanhasAtivas),
            cor: "var(--ink)",
            variacao: null,
          },
        ].map((c) => (
          <div key={c.label} className={`${cardClass} p-6`}>
            <p className="font-cabinet mb-2 text-[32px] leading-none" style={{ color: c.cor }}>
              {carregando ? <SkeletonNumero className="h-8 w-24" /> : c.valor}
            </p>
            <p className="font-sans text-[13px] text-[var(--muted)]">{c.label}</p>
            {c.variacao && !carregando && (
              <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">{c.variacao}</p>
            )}
          </div>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className={`${cardClass} p-6`}>
          <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Gasto por dia
          </h2>
          {carregando ? (
            <SkeletonBloco className="h-24" />
          ) : (
            <BarrasDiarias
              pontos={diario.map((p) => ({ dia: p.dia, valor: p.gasto }))}
              formatar={formatarReais}
            />
          )}
        </div>
        <div className={`${cardClass} p-6`}>
          <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Leads por dia
          </h2>
          {carregando ? (
            <SkeletonBloco className="h-24" />
          ) : (
            <BarrasDiarias
              pontos={diario.map((p) => ({ dia: p.dia, valor: p.leads }))}
              formatar={formatarNumero}
            />
          )}
        </div>
      </div>

      <div className={cardClass}>
        {carregando ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBloco key={i} className="h-12" />
            ))}
          </div>
        ) : campanhas.length === 0 && !erro ? (
          <p className="p-6 font-sans text-[13px] text-[var(--muted)]">
            Nenhuma campanha encontrada nessa conta de anúncios.
          </p>
        ) : campanhas.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className={thClass}></th>
                  <th className={thClass}>Campanha</th>
                  <th className={thClass}>Objetivo</th>
                  <th className={thClass}>Orçamento</th>
                  <th className={thClass}>Gasto</th>
                  <th className={thClass}>Impressões</th>
                  <th className={thClass}>Cliques</th>
                  <th className={thClass}>CTR</th>
                  <th className={thClass}>Leads</th>
                  <th className={thClass}>Custo/Lead</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => {
                  const aberta = expandida === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        onClick={() => setExpandida(aberta ? null : c.id)}
                        className="cursor-pointer border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface)]/50"
                      >
                        <td className={tdMuted}>
                          {aberta ? (
                            <ChevronUp size={14} aria-hidden="true" />
                          ) : (
                            <ChevronDown size={14} aria-hidden="true" />
                          )}
                        </td>
                        <td className={tdClass}>
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{c.nome}</span>
                            {badgeStatus(c.statusEfetivo)}
                          </div>
                        </td>
                        <td className={tdMuted}>{c.objetivo}</td>
                        <td className={tdMuted}>
                          {c.orcamentoDiario
                            ? `${formatarReais(c.orcamentoDiario)}/dia`
                            : c.orcamentoTotal
                              ? `${formatarReais(c.orcamentoTotal)} total`
                              : "—"}
                        </td>
                        <td className={tdClass}>{formatarReais(c.gasto)}</td>
                        <td className={tdMuted}>{formatarNumero(c.impressoes)}</td>
                        <td className={tdMuted}>{formatarNumero(c.cliques)}</td>
                        <td className={tdMuted}>{formatarPercentual(c.ctr)}</td>
                        <td className={tdClass}>{formatarNumero(c.leads)}</td>
                        <td className={tdClass}>
                          {c.custoPorLead === null ? "—" : formatarReais(c.custoPorLead)}
                        </td>
                      </tr>
                      {aberta && <LinhaAnuncios campanhaId={c.id} campanhaNome={c.nome} />}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}
