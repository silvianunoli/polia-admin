import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAcaoAdmin } from "@/lib/audit-log";

interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
}

export const Route = createFileRoute("/flags")({
  head: () => ({
    meta: [{ title: "Feature Flags · Pólia" }],
  }),
  component: AdminFlags,
});

// Flags que nenhum trecho do app lê hoje — o toggle liga/desliga no banco,
// mas não muda comportamento nenhum. Mantido explícito aqui pra não fingir
// que existe uma feature por trás até alguém conectar de verdade.
// csat_modal_ativo agora é lida de verdade (src/lib/csat.ts) — desligada por
// padrão até decidir ativar a captura em produção. broadcast_ativo foi
// removida do seed (faxina 2026-07-25): sem leitor, sem uso planejado.
const FLAGS_SEM_CODIGO_CONECTADO = new Set<string>([]);

function AdminFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);

  const carregar = async () => {
    const { data } = await supabase.from("feature_flags").select("*").order("key");
    setFlags(data ?? []);
  };

  useEffect(() => {
    carregar();
  }, []);

  const toggle = async (key: string, enabled: boolean) => {
    await supabase
      .from("feature_flags")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("key", key);
    await logAcaoAdmin("toggle_feature_flag", key, { enabled });
    carregar();
  };

  return (
    <>
      <h2 className="font-cabinet mb-2 text-[40px] text-[var(--ink)]">Feature Flags</h2>
      <p className="mb-6 max-w-[560px] font-sans text-[13px] text-[var(--muted)]">
        Ligar/desligar aqui só muda o valor no banco. Só vale pra flags que o código efetivamente lê
        — as marcadas abaixo ainda não estão conectadas a nada.
      </p>
      <div className="space-y-3">
        {flags.map((flag) => {
          const inerte = FLAGS_SEM_CODIGO_CONECTADO.has(flag.key);
          return (
            <div
              key={flag.key}
              className="flex items-center justify-between rounded-2xl border border-[var(--line)] bg-white p-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[14px] font-medium text-[var(--ink)]">{flag.key}</p>
                  {inerte && (
                    <span className="rounded-full bg-[var(--highlight)] px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--highlight-ink)]">
                      sem efeito ainda
                    </span>
                  )}
                </div>
                <p className="font-sans text-[13px] text-[var(--muted)]">{flag.description}</p>
              </div>
              <button
                onClick={() => toggle(flag.key, !flag.enabled)}
                className="relative h-6 w-12 rounded-full transition-colors"
                style={{ backgroundColor: flag.enabled ? "var(--secondary)" : "var(--line)" }}
                aria-label={`Toggle ${flag.key}`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${flag.enabled ? "translate-x-7" : "translate-x-1"}`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
