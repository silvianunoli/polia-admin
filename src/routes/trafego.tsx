import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ImageOff,
  RefreshCcw,
} from "lucide-react";
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

// Texto neutro (usado pro gasto: gastar mais não é bom nem ruim por si só).
function formatarVariacao(atual: number, anterior: number): string {
  if (anterior === 0)
    return atual === 0 ? "sem dado no período anterior" : "período anterior zerado";
  const pct = ((atual - anterior) / anterior) * 100;
  const sinal = pct > 0 ? "+" : "";
  return `${sinal}${pct.toFixed(0)}% vs. 30 dias anteriores`;
}

// Com cor (usado pro lead: mais lead é bom, menos é sinal de atenção).
function variacaoComCor(
  atual: number,
  anterior: number,
): { texto: string; className: string } | null {
  if (anterior === 0) {
    if (atual === 0) return null;
    return { texto: "novo neste período", className: "text-[var(--muted)]" };
  }
  const pct = ((atual - anterior) / anterior) * 100;
  const texto = formatarVariacao(atual, anterior);
  if (Math.abs(pct) < 1) return { texto, className: "text-[var(--muted)]" };
  return {
    texto,
    className: pct > 0 ? "text-[var(--secondary-text)]" : "text-[var(--danger)]",
  };
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
        console.error("[Tráfego] anúncios da campanha", campanhaId, e);
        if (vivo) setErro("Não conseguimos carregar os anúncios dessa campanha agora.");
      }
    })();
    return () => {
      vivo = false;
    };
  }, [campanhaId]);

  return (
    <tr>
      <td colSpan={10} className="bg-[var(--surface)] p-4">
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
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[var(--line)]">
                    <ImageOff size={16} className="text-[var(--muted)]" aria-hidden="true" />
                  </div>
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

type CampoOrdenacao = "gasto" | "leads" | "custoPorLead";

function TrafegoMeta() {
  const [campanhas, setCampanhas] = useState<CampanhaMeta[]>([]);
  const [resumo, setResumo] = useState({
    gastoTotal: 0,
    leadsTotal: 0,
    campanhasAtivas: 0,
    cplMedioConta: null as number | null,
  });
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [alertasAbertos, setAlertasAbertos] = useState(false);
  const [diario, setDiario] = useState<PontoDiario[]>([]);
  const [comparacao, setComparacao] = useState<ComparacaoPeriodo | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [ordenacao, setOrdenacao] = useState<{ campo: CampoOrdenacao; asc: boolean }>({
    campo: "gasto",
    asc: false,
  });

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
      console.error("[Tráfego]", e);
      setErro(
        "Não conseguimos buscar os dados do Meta Ads agora. Tenta de novo em alguns minutos.",
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alternarOrdenacao(campo: CampoOrdenacao) {
    setOrdenacao((o) => (o.campo === campo ? { campo, asc: !o.asc } : { campo, asc: false }));
  }

  function thOrdenavel(label: string, campo: CampoOrdenacao) {
    const ativo = ordenacao.campo === campo;
    return (
      <th className={thClass}>
        <button
          type="button"
          onClick={() => alternarOrdenacao(campo)}
          className="inline-flex items-center gap-1 hover:text-[var(--ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--secondary)]"
        >
          {label}
          <ArrowUpDown
            size={11}
            className={ativo ? "text-[var(--ink)]" : "text-[var(--line)]"}
            aria-hidden="true"
          />
        </button>
      </th>
    );
  }

  const campanhasOrdenadas = [...campanhas].sort((a, b) => {
    const va = a[ordenacao.campo];
    const vb = b[ordenacao.campo];
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return ordenacao.asc ? va - vb : vb - va;
  });

  const variacaoLeads = comparacao
    ? variacaoComCor(comparacao.leadsAtual, comparacao.leadsAnterior)
    : null;
  const variacaoGasto = comparacao
    ? formatarVariacao(comparacao.gastoAtual, comparacao.gastoAnterior)
    : null;

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
              <RefreshCcw
                size={14}
                className={carregando ? "animate-spin" : ""}
                aria-hidden="true"
              />
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

      {/* Leads é a métrica que os anúncios otimizam — é a resposta que importa
          em 5 segundos, por isso domina; gasto e campanhas ativas são apoio. */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
        <div className={`${cardClass} p-8`}>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="font-sans text-[13px] text-[var(--muted)]">Leads (30 dias)</p>
              <p className="font-cabinet mt-1 text-[56px] leading-none text-[var(--secondary-text)]">
                {carregando ? (
                  <SkeletonNumero className="h-12 w-24" />
                ) : (
                  formatarNumero(resumo.leadsTotal)
                )}
              </p>
              {variacaoLeads && !carregando && (
                <p className={`mt-2 font-sans text-[13px] font-medium ${variacaoLeads.className}`}>
                  {variacaoLeads.texto}
                </p>
              )}
            </div>
            <div className="border-l border-[var(--line)] pl-6">
              <p className="font-sans text-[13px] text-[var(--muted)]">Custo por lead</p>
              <p className="font-cabinet mt-1 text-[32px] leading-none text-[var(--ink)]">
                {carregando ? (
                  <SkeletonNumero className="h-8 w-20" />
                ) : resumo.cplMedioConta === null ? (
                  "—"
                ) : (
                  formatarReais(resumo.cplMedioConta)
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className={`${cardClass} p-5`}>
            <p className="font-cabinet text-[24px] leading-none text-[var(--ink)]">
              {carregando ? (
                <SkeletonNumero className="h-6 w-16" />
              ) : (
                formatarReais(resumo.gastoTotal)
              )}
            </p>
            <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">Gasto (30 dias)</p>
            {variacaoGasto && !carregando && (
              <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">{variacaoGasto}</p>
            )}
          </div>
          <div className={`${cardClass} p-5`}>
            <p className="font-cabinet text-[24px] leading-none text-[var(--ink)]">
              {carregando ? (
                <SkeletonNumero className="h-6 w-10" />
              ) : (
                formatarNumero(resumo.campanhasAtivas)
              )}
            </p>
            <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">Campanhas ativas</p>
          </div>
        </div>
      </div>

      {!carregando && alertas.length > 0 && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setAlertasAbertos((v) => !v)}
            aria-expanded={alertasAbertos}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-[var(--highlight)]/40 bg-[var(--accent)]/20 px-4 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--secondary)]"
          >
            <span className="flex items-center gap-2 font-sans text-[13px] font-semibold text-[var(--ink)]">
              <AlertTriangle size={16} className="text-[var(--accent-ink)]" aria-hidden="true" />
              <span aria-live="polite">
                {alertas.length} alerta{alertas.length === 1 ? "" : "s"} pra revisar
              </span>
            </span>
            {alertasAbertos ? (
              <ChevronUp size={16} aria-hidden="true" />
            ) : (
              <ChevronDown size={16} aria-hidden="true" />
            )}
          </button>
          {alertasAbertos && (
            <div className="mt-2 space-y-2">
              {alertas.map((a, i) => (
                <div
                  key={`${a.campanhaId}-${a.tipo}-${i}`}
                  className="flex items-start gap-3 rounded-2xl border border-[var(--line)] bg-white p-4"
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
        </div>
      )}

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
                  <th className={thClass}>
                    <span className="sr-only">Expandir</span>
                  </th>
                  <th className={thClass}>Campanha</th>
                  <th className={thClass}>Objetivo</th>
                  <th className={thClass}>Orçamento</th>
                  {thOrdenavel("Gasto", "gasto")}
                  <th className={thClass}>Impressões</th>
                  <th className={thClass}>Cliques</th>
                  <th className={thClass}>CTR</th>
                  {thOrdenavel("Leads", "leads")}
                  {thOrdenavel("Custo por lead", "custoPorLead")}
                </tr>
              </thead>
              <tbody>
                {campanhasOrdenadas.map((c) => {
                  const aberta = expandida === c.id;
                  return (
                    <Fragment key={c.id}>
                      <tr
                        role="button"
                        tabIndex={0}
                        aria-expanded={aberta}
                        onClick={() => setExpandida(aberta ? null : c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandida(aberta ? null : c.id);
                          }
                        }}
                        className="cursor-pointer border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--surface)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--secondary)] focus-visible:outline-offset-[-2px]"
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
