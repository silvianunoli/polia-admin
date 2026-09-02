import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/qualidade")({
  head: () => ({
    meta: [{ title: "Qualidade · Pólia" }],
  }),
  component: AdminQualidade,
});

const DIAS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function AdminQualidade() {
  const [errosApp, setErrosApp] = useState<{ origem: string; criado_em: string }[]>([]);
  const [logsFuncao, setLogsFuncao] = useState<{ status: string; created_at: string }[]>([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    (async () => {
      const dias7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const [{ data: erros }, { data: logs }] = await Promise.all([
        supabase.from("erros_app").select("origem,criado_em").gte("criado_em", dias7),
        supabase.from("edge_function_logs").select("status,created_at").gte("created_at", dias7),
      ]);
      setErrosApp(erros ?? []);
      setLogsFuncao(logs ?? []);
      setCarregando(false);
    })();
  }, []);

  const errosApp24h = useMemo(
    () => errosApp.filter((e) => e.criado_em >= new Date(Date.now() - 86400000).toISOString()),
    [errosApp],
  );
  const logs24h = useMemo(
    () => logsFuncao.filter((l) => l.created_at >= new Date(Date.now() - 86400000).toISOString()),
    [logsFuncao],
  );
  const logsComErro24h = logs24h.filter((l) => l.status !== "ok");
  const taxaSucesso24h = logs24h.length
    ? Math.round(((logs24h.length - logsComErro24h.length) / logs24h.length) * 100)
    : 100;

  const tendencia = useMemo(() => {
    const dias: { label: string; data: string; erros: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dias.push({ label: DIAS_LABEL[d.getDay()], data: d.toISOString().slice(0, 10), erros: 0 });
    }
    errosApp.forEach((e) => {
      const chave = e.criado_em.slice(0, 10);
      const dia = dias.find((d) => d.data === chave);
      if (dia) dia.erros++;
    });
    return dias;
  }, [errosApp]);
  const maxErros = Math.max(1, ...tendencia.map((d) => d.erros));

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Qualidade</h1>
      <p className="mb-6 max-w-[560px] font-sans text-[14px] text-[var(--muted)]">
        Sinal real de saúde a partir do que já rastreamos (erros de client/server e chamadas de edge
        function) — não roda suite de teste automatizada. A Pólia não tem CI hoje, e o Worker não
        consegue disparar um test runner em runtime.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Erros de app · 24h
          </p>
          <p
            className="font-cabinet text-[32px] leading-none"
            style={{ color: errosApp24h.length > 0 ? "var(--danger)" : "var(--secondary-text)" }}
          >
            {carregando ? "…" : errosApp24h.length}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Edge functions com erro · 24h
          </p>
          <p
            className="font-cabinet text-[32px] leading-none"
            style={{ color: logsComErro24h.length > 0 ? "var(--danger)" : "var(--secondary-text)" }}
          >
            {carregando ? "…" : logsComErro24h.length}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Taxa de sucesso · 24h
          </p>
          <p
            className="font-cabinet text-[32px] leading-none"
            style={{ color: taxaSucesso24h >= 95 ? "var(--secondary-text)" : "var(--danger)" }}
          >
            {carregando ? "…" : `${taxaSucesso24h}%`}
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-[var(--line)] bg-white p-6">
        <p className="mb-5 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
          Erros de app por dia · 7 dias
        </p>
        <div className="flex h-[120px] items-end gap-3">
          {tendencia.map((d) => (
            <div key={d.data} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full items-end">
                <div
                  className="w-full rounded-t-md transition-all"
                  style={{
                    height: `${(d.erros / maxErros) * 100}%`,
                    minHeight: d.erros ? 4 : 0,
                    backgroundColor: d.erros > 0 ? "var(--danger)" : "var(--line)",
                  }}
                />
              </div>
              <p className="font-sans text-[11px] text-[var(--muted)]">{d.label}</p>
              <p className="font-sans text-[11px] font-medium text-[var(--ink-soft)]">{d.erros}</p>
            </div>
          ))}
        </div>
      </div>

      <Link
        to="/logs"
        className="block rounded-2xl border border-[var(--line)] bg-white p-5 no-underline transition-colors hover:border-[var(--secondary)]"
      >
        <p className="font-sans text-[14px] font-medium text-[var(--ink)]">
          Logs do sistema e erros internos →
        </p>
        <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">
          Chamadas de edge function, e lista detalhada de erro com stack trace (client vs server).
        </p>
      </Link>
    </>
  );
}
