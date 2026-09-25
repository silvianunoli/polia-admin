import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { SkeletonBloco, SkeletonNumero } from "@/components/Skeleton";
import { listarCampanhasMeta, type CampanhaMeta } from "@/lib/meta-ads.functions";
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

function TrafegoMeta() {
  const [campanhas, setCampanhas] = useState<CampanhaMeta[]>([]);
  const [resumo, setResumo] = useState({ gastoTotal: 0, leadsTotal: 0, campanhasAtivas: 0 });
  const [atualizadoEm, setAtualizadoEm] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await listarCampanhasMeta();
      setCampanhas(r.campanhas);
      setResumo(r.resumo);
      setAtualizadoEm(r.atualizadoEm);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não conseguimos carregar as campanhas agora.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const cpl = resumo.leadsTotal > 0 ? resumo.gastoTotal / resumo.leadsTotal : null;

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

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        {[
          { label: "Gasto (30 dias)", valor: formatarReais(resumo.gastoTotal), cor: "var(--ink)" },
          {
            label: "Leads (30 dias)",
            valor: formatarNumero(resumo.leadsTotal),
            cor: "var(--secondary-text)",
          },
          {
            label: "Custo por Lead",
            valor: cpl === null ? "—" : formatarReais(cpl),
            cor: "var(--ink)",
          },
          {
            label: "Campanhas ativas",
            valor: formatarNumero(resumo.campanhasAtivas),
            cor: "var(--ink)",
          },
        ].map((c) => (
          <div key={c.label} className={`${cardClass} p-6`}>
            <p className="font-cabinet mb-2 text-[32px] leading-none" style={{ color: c.cor }}>
              {carregando ? <SkeletonNumero className="h-8 w-24" /> : c.valor}
            </p>
            <p className="font-sans text-[13px] text-[var(--muted)]">{c.label}</p>
          </div>
        ))}
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
                {campanhas.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--line)] last:border-b-0">
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
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </>
  );
}
