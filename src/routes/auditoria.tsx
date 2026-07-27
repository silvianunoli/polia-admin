import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auditoria")({
  head: () => ({
    meta: [{ title: "Auditoria · Pólia" }],
  }),
  component: AdminAuditoria,
});

type LogRow = {
  id: string;
  criado_em: string;
  admin_id: string;
  acao: string;
  alvo: string | null;
  admin_nome?: string;
};

const ACAO_LABEL: Record<string, string> = {
  toggle_feature_flag: "Alterou feature flag",
  criar_convite: "Liberou e-mail (convite)",
  remover_convite: "Removeu convite",
  resolver_chamado: "Resolveu chamado",
};

function AdminAuditoria() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("admin_audit_log")
        .select("*")
        .order("criado_em", { ascending: false })
        .limit(300);
      const rows = (data ?? []) as LogRow[];
      const adminIds = Array.from(new Set(rows.map((r) => r.admin_id)));
      if (adminIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,full_name")
          .in("id", adminIds);
        const nomes = new Map((profs ?? []).map((p) => [p.id, p.full_name ?? "—"]));
        rows.forEach((r) => (r.admin_nome = nomes.get(r.admin_id) ?? "—"));
      }
      setLogs(rows);
      setCarregando(false);
    })();
  }, []);

  const porAdmin = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach((l) => map.set(l.admin_nome ?? "—", (map.get(l.admin_nome ?? "—") ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Auditoria</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Trilha imutável de ações administrativas — quem fez o quê e quando. {logs.length} registros
        (últimos 300).
      </p>

      {porAdmin.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {porAdmin.map(([nome, total]) => (
            <div
              key={nome}
              className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2"
            >
              <span className="font-cabinet text-[18px] leading-none text-[var(--ink)]">
                {total}
              </span>
              <span className="font-sans text-[13px] text-[var(--ink-soft)]">{nome}</span>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-[var(--line)]">
              {["Quando", "Quem", "Ação", "Alvo"].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]">
                  Carregando…
                </td>
              </tr>
            )}
            {!carregando && logs.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]">
                  Nenhuma ação administrativa registrada ainda.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-[var(--line)] hover:bg-[var(--surface)]">
                <td className="px-5 py-3 font-sans text-[12px] text-[var(--muted)]">
                  {new Date(l.criado_em).toLocaleString("pt-BR")}
                </td>
                <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink)]">
                  {l.admin_nome ?? "—"}
                </td>
                <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink)]">
                  {ACAO_LABEL[l.acao] ?? l.acao}
                </td>
                <td className="px-5 py-3 font-mono text-[12px] text-[var(--ink-soft)]">
                  {l.alvo ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
