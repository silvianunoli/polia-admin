import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAcaoAdmin } from "@/lib/audit-log";
import { toastErro } from "@/lib/toast";
import { CARD_CLASS } from "@/lib/botoes";
import { Toggle } from "@/components/Toggle";

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
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);

  const carregar = async () => {
    const { data, error } = await supabase.from("feature_flags").select("*").order("key");
    setErroCarga(Boolean(error));
    setFlags(data ?? []);
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
  }, []);

  const toggle = async (key: string, enabled: boolean) => {
    const { error } = await supabase
      .from("feature_flags")
      .update({ enabled, updated_at: new Date().toISOString() })
      .eq("key", key);
    if (error) {
      toastErro("Não consegui mudar essa flag. Tenta de novo.");
      return;
    }
    await logAcaoAdmin("toggle_feature_flag", key, { enabled });
    carregar();
  };

  return (
    <>
      <h1 className="font-cabinet mb-2 text-[40px] text-[var(--ink)]">Feature Flags</h1>
      <p className="mb-6 max-w-[560px] font-sans text-[13px] text-[var(--muted)]">
        Ligar/desligar aqui só muda o valor no banco. Só vale pra flags que o código efetivamente
        lê: as marcadas abaixo ainda não estão conectadas a nada.
      </p>

      {erroCarga && (
        <div className="mb-6 rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-4">
          <p className="font-sans text-[13px] text-[var(--danger)]">
            Não consegui carregar as flags. Tenta recarregar a página.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {carregando && <p className="font-sans text-[13px] text-[var(--muted)]">Carregando…</p>}
        {!carregando && !erroCarga && flags.length === 0 && (
          <div className={`${CARD_CLASS} p-5`}>
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Nenhuma flag cadastrada no banco ainda.
            </p>
          </div>
        )}
        {flags.map((flag) => {
          const inerte = FLAGS_SEM_CODIGO_CONECTADO.has(flag.key);
          return (
            <div key={flag.key} className={`${CARD_CLASS} flex items-center justify-between p-5`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[14px] font-medium text-[var(--ink)]">{flag.key}</p>
                  {inerte && (
                    <span className="rounded-full bg-[var(--highlight)] px-2.5 py-1 font-accent text-[10px] font-bold uppercase tracking-[0.5px] text-[var(--highlight-ink)]">
                      sem efeito ainda
                    </span>
                  )}
                </div>
                {flag.description && (
                  <p className="font-sans text-[13px] text-[var(--muted)]">{flag.description}</p>
                )}
              </div>
              <Toggle
                ligado={flag.enabled}
                onChange={() => toggle(flag.key, !flag.enabled)}
                label={`a flag ${flag.key}`}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
