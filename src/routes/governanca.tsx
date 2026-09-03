import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toastErro, toastSucesso } from "@/lib/toast";
import { logAcaoAdmin } from "@/lib/audit-log";
import { BTN_PRIMARIO, CARD_CLASS } from "@/lib/botoes";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/governanca")({
  head: () => ({
    meta: [{ title: "Governança · Pólia" }],
  }),
  component: AdminGovernanca,
});

type TamanhoTabela = { tabela: string; tamanho_bytes: number; tamanho_legivel: string };

const RETENCAO = [
  {
    tabela: "edge_function_logs",
    politica: "30 dias",
    motivo: "log operacional, sem valor depois disso",
  },
  { tabela: "erros_app", politica: "90 dias", motivo: "diagnóstico de erro, útil por mais tempo" },
  {
    tabela: "eventos_analytics",
    politica: "sem limpeza ainda",
    motivo: "dado de negócio, decisão de reter fica pra depois",
  },
  {
    tabela: "admin_audit_log",
    politica: "permanente",
    motivo: "registro de compliance, nunca apaga",
  },
];

const DOCS = [
  {
    titulo: "Política de Backup",
    desc: "Regras de backup, retenção e RPCs de limpeza",
    arquivo: "docs/backup-policy.md",
  },
  {
    titulo: "Plano de Rollback",
    desc: "Como reverter código, schema e dado em caso de falha",
    arquivo: "docs/rollback-plan.md",
  },
  {
    titulo: "Checklist de Segurança",
    desc: "Gate de segurança antes de subir pra produção",
    arquivo: "docs/checklist-seguranca.md",
  },
  {
    titulo: "Checklist de Arquitetura",
    desc: "SOLID, camadas, quando escrever um ADR",
    arquivo: "docs/checklist-arquitetura.md",
  },
];

function AdminGovernanca() {
  const [tamanhos, setTamanhos] = useState<TamanhoTabela[]>([]);
  const [carregandoTamanhos, setCarregandoTamanhos] = useState(true);
  const [erroTamanhos, setErroTamanhos] = useState(false);
  const [limpando, setLimpando] = useState(false);

  const carregar = async () => {
    const { data, error } = await supabase.rpc("admin_tamanhos_tabelas");
    setErroTamanhos(Boolean(error));
    setTamanhos((data ?? []) as TamanhoTabela[]);
    setCarregandoTamanhos(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const limpar = async () => {
    if (
      !window.confirm(
        "Remover edge_function_logs com mais de 30 dias e erros_app com mais de 90 dias? Essa ação não pode ser desfeita.",
      )
    ) {
      return;
    }
    setLimpando(true);
    try {
      const { data, error } = await supabase.rpc("admin_limpar_logs_antigos");
      if (error) throw error;
      const total = (data ?? []).reduce(
        (s: number, r: { linhas_removidas?: number }) => s + (r.linhas_removidas ?? 0),
        0,
      );
      await logAcaoAdmin("limpar_logs_antigos", undefined, { total_removido: total });
      toastSucesso(`${total} linhas removidas.`);
      carregar();
    } catch {
      toastErro("Não consegui limpar os logs.");
    } finally {
      setLimpando(false);
    }
  };

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Governança</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Retenção de dado, tamanho de tabela e limpeza de log antigo.
      </p>

      <div className={`${CARD_CLASS} mb-6 p-6`}>
        <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Política de retenção
        </p>
        <div className="space-y-3">
          {RETENCAO.map((r) => (
            <div
              key={r.tabela}
              className="flex items-center justify-between gap-3 border-b border-[var(--line)] pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="font-mono text-[13px] text-[var(--ink)]">{r.tabela}</p>
                <p className="font-sans text-[12px] text-[var(--muted)]">{r.motivo}</p>
              </div>
              <span className="shrink-0 rounded-full bg-[var(--line)] px-2.5 py-1 font-sans text-[11px] font-medium text-[var(--ink-soft)]">
                {r.politica}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Tamanho das tabelas
          </p>
          <div className="space-y-2">
            {tamanhos.map((t) => (
              <div key={t.tabela} className="flex items-center justify-between">
                <p className="font-mono text-[12px] text-[var(--ink-soft)]">{t.tabela}</p>
                <p className="font-sans text-[12px] text-[var(--ink)]">{t.tamanho_legivel}</p>
              </div>
            ))}
            {carregandoTamanhos && (
              <>
                <SkeletonBloco className="h-4" />
                <SkeletonBloco className="h-4" />
                <SkeletonBloco className="h-4" />
                <SkeletonBloco className="h-4" />
              </>
            )}
            {!carregandoTamanhos && erroTamanhos && (
              <p className="font-sans text-[13px] text-[var(--danger)]">
                Não consegui ler o tamanho das tabelas agora. Tenta recarregar a página.
              </p>
            )}
            {!carregandoTamanhos && !erroTamanhos && tamanhos.length === 0 && (
              <p className="font-sans text-[13px] text-[var(--muted)]">
                Nenhuma tabela retornada pela consulta.
              </p>
            )}
          </div>
        </div>

        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-2 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Limpeza de logs
          </p>
          <p className="mb-4 font-sans text-[13px] text-[var(--muted)]">
            Remove <code className="font-mono text-[12px]">edge_function_logs</code> com mais de 30
            dias e <code className="font-mono text-[12px]">erros_app</code> com mais de 90 dias.
            Eventos de negócio e auditoria não são afetados.
          </p>
          <button onClick={limpar} disabled={limpando} className={`${BTN_PRIMARIO} cursor-pointer`}>
            {limpando ? "Limpando…" : "Executar limpeza"}
          </button>
        </div>
      </div>

      <div className={`${CARD_CLASS} p-6`}>
        <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Documentação técnica
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCS.map((d) => (
            <div key={d.arquivo} className="rounded-xl border border-[var(--line)] p-4">
              <p className="font-sans text-[14px] font-medium text-[var(--ink)]">{d.titulo}</p>
              <p className="mb-2 font-sans text-[12px] text-[var(--muted)]">{d.desc}</p>
              <p className="font-mono text-[11px] text-[var(--secondary-text)]">{d.arquivo}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
