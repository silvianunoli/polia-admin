import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toastErro, toastSucesso } from "@/lib/toast";
import { logAcaoAdmin } from "@/lib/audit-log";

export const Route = createFileRoute("/alertas")({
  head: () => ({
    meta: [{ title: "Alertas · Pólia" }],
  }),
  component: AdminAlertas,
});

const TIPO_LABEL: Record<string, string> = {
  erros_24h_acima_de: "Erros de app nas últimas 24h acima de",
  eventos_parados_por_horas: "Sem nenhum evento registrado há mais de (horas)",
};

function AdminAlertas() {
  const [regras, setRegras] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [verificando, setVerificando] = useState(false);

  const carregar = async () => {
    const [{ data: r }, { data: a }] = await Promise.all([
      supabase.from("alerta_regras").select("*").order("tipo"),
      supabase
        .from("alertas_abertos")
        .select("*")
        .eq("status", "aberto")
        .order("criado_em", { ascending: false }),
    ]);
    setRegras(r ?? []);
    setAlertas(a ?? []);
  };

  useEffect(() => {
    carregar();
  }, []);

  const toggleRegra = async (id: string, ativo: boolean) => {
    await supabase.from("alerta_regras").update({ ativo }).eq("id", id);
    carregar();
  };

  const verificarAgora = async () => {
    setVerificando(true);
    try {
      const ativas = regras.filter((r) => r.ativo);
      let novos = 0;
      for (const regra of ativas) {
        const jaAberto = alertas.some((a) => a.regra_id === regra.id);
        if (jaAberto) continue;

        let disparou = false;
        let detalhes: Record<string, unknown> = {};

        if (regra.tipo === "erros_24h_acima_de") {
          const dia1 = new Date(Date.now() - 86400000).toISOString();
          const { count } = await supabase
            .from("erros_app")
            .select("*", { count: "exact", head: true })
            .gte("criado_em", dia1);
          disparou = (count ?? 0) > regra.limite;
          detalhes = { erros_24h: count ?? 0, limite: regra.limite };
        } else if (regra.tipo === "eventos_parados_por_horas") {
          const { data: ultimo } = await supabase
            .from("eventos_analytics")
            .select("criado_em")
            .order("criado_em", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (ultimo) {
            const horasParado = (Date.now() - new Date(ultimo.criado_em).getTime()) / 3_600_000;
            disparou = horasParado > regra.limite;
            detalhes = { horas_parado: Math.round(horasParado), limite: regra.limite };
          }
        }

        if (disparou) {
          await supabase.from("alertas_abertos").insert({
            regra_id: regra.id,
            titulo: regra.nome,
            detalhes,
          });
          novos++;
        }
      }
      await logAcaoAdmin("verificar_alertas", undefined, { novos_alertas: novos });
      toastSucesso(novos > 0 ? `${novos} novo(s) alerta(s) disparado(s).` : "Nenhum alerta novo.");
      carregar();
    } catch {
      toastErro("Não consegui verificar os alertas.");
    } finally {
      setVerificando(false);
    }
  };

  const resolverAlerta = async (id: string) => {
    await supabase
      .from("alertas_abertos")
      .update({ status: "resolvido", resolvido_em: new Date().toISOString() })
      .eq("id", id);
    await logAcaoAdmin("resolver_alerta", id);
    carregar();
  };

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Motor de Alertas</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Regras avaliadas sob demanda — ainda sem verificação automática em background.
      </p>

      <div className="mb-6 flex items-center justify-between">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
          {alertas.length} alerta(s) aberto(s)
        </p>
        <button
          onClick={verificarAgora}
          disabled={verificando}
          className="rounded-xl bg-[var(--secondary)] px-5 py-2 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {verificando ? "Verificando…" : "Verificar Alertas Agora"}
        </button>
      </div>

      <div className="mb-6 space-y-3">
        {alertas.length === 0 && (
          <div className="rounded-xl border border-[var(--secondary)]/30 bg-[var(--secondary-light)]/30 p-4">
            <p className="font-sans text-[13px] text-[var(--secondary-text)]">
              Nenhum alerta aberto no momento.
            </p>
          </div>
        )}
        {alertas.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-4"
          >
            <div>
              <p className="font-sans text-[13px] font-medium text-[var(--danger)]">{a.titulo}</p>
              <p className="font-sans text-[12px] text-[var(--ink-soft)]">
                {JSON.stringify(a.detalhes)} · {new Date(a.criado_em).toLocaleString("pt-BR")}
              </p>
            </div>
            <button
              onClick={() => resolverAlerta(a.id)}
              className="shrink-0 font-sans text-[12px] text-[var(--danger)] hover:underline"
            >
              Marcar como resolvido
            </button>
          </div>
        ))}
      </div>

      <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
        Regras
      </p>
      <div className="space-y-3">
        {regras.map((r) => (
          <div
            key={r.id}
            className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white p-5"
          >
            <div>
              <p className="font-sans text-[14px] text-[var(--ink)]">
                {TIPO_LABEL[r.tipo] ?? r.tipo}
              </p>
              <p className="font-mono text-[13px] text-[var(--ink-soft)]">{r.limite}</p>
            </div>
            <button
              onClick={() => toggleRegra(r.id, !r.ativo)}
              className="relative h-6 w-12 rounded-full transition-colors"
              style={{ backgroundColor: r.ativo ? "var(--secondary)" : "var(--line)" }}
              aria-label={`Toggle ${r.nome}`}
            >
              <span
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${r.ativo ? "translate-x-7" : "translate-x-1"}`}
              />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
