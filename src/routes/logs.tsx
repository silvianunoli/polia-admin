import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/logs")({
  head: () => ({
    meta: [{ title: "Logs do sistema · Pólia" }],
  }),
  component: AdminLogs,
});

const tabTriggerClass =
  "rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none";

function AdminLogs() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const dia = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data } = await supabase
        .from("edge_function_logs")
        .select("*")
        .gte("created_at", dia)
        .order("created_at", { ascending: false });
      setLogs(data ?? []);
    })();
  }, []);

  const stats = useMemo(() => {
    const map = new Map<
      string,
      { chamadas: number; erros: number; soma_lat: number; com_lat: number }
    >();
    logs.forEach((l) => {
      const cur = map.get(l.function_name) ?? { chamadas: 0, erros: 0, soma_lat: 0, com_lat: 0 };
      cur.chamadas++;
      if (l.status !== "ok") cur.erros++;
      if (l.latency_ms != null) {
        cur.soma_lat += l.latency_ms;
        cur.com_lat++;
      }
      map.set(l.function_name, cur);
    });
    return Array.from(map.entries()).map(([nome, v]) => ({
      nome,
      chamadas: v.chamadas,
      erros: v.erros,
      latencia_ms: v.com_lat ? Math.round(v.soma_lat / v.com_lat) : 0,
    }));
  }, [logs]);

  const [erros, setErros] = useState<any[]>([]);
  const [carregandoErros, setCarregandoErros] = useState(true);
  const [filtroOrigem, setFiltroOrigem] = useState<"" | "client" | "server">("");

  useEffect(() => {
    (async () => {
      const dias7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data } = await supabase
        .from("erros_app")
        .select("*")
        .gte("criado_em", dias7)
        .order("criado_em", { ascending: false })
        .limit(300);
      setErros(data ?? []);
      setCarregandoErros(false);
    })();
  }, []);

  const errosFiltrados = useMemo(
    () => erros.filter((e) => !filtroOrigem || e.origem === filtroOrigem),
    [erros, filtroOrigem],
  );
  const contagemErros = useMemo(
    () => ({
      total: erros.length,
      client: erros.filter((e) => e.origem === "client").length,
      server: erros.filter((e) => e.origem === "server").length,
    }),
    [erros],
  );

  return (
    <>
      <h1 className="font-cabinet mb-6 text-[40px] text-[var(--ink)]">Logs do sistema</h1>

      <Tabs defaultValue="logs">
        <TabsList className="mb-6 h-auto gap-1 rounded-xl border border-[var(--line)] bg-white p-1">
          <TabsTrigger value="logs" className={tabTriggerClass}>
            Edge functions
          </TabsTrigger>
          <TabsTrigger value="erros" className={tabTriggerClass}>
            Erros internos · {contagemErros.total}
          </TabsTrigger>
        </TabsList>

        {/* LOGS DE EDGE FUNCTION */}
        <TabsContent value="logs">
          <h2 className="mb-4 text-[20px] text-[var(--ink)]">
            Edge Functions · últimas 24h
          </h2>
          <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-white">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {["Função", "Chamadas", "Erros", "Latência média", "Status"].map((h) => (
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
                {stats.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]"
                    >
                      Nenhum log registrado nas últimas 24h.
                    </td>
                  </tr>
                )}
                {stats.map((fn) => (
                  <tr key={fn.nome} className="border-b border-[var(--line)]">
                    <td className="px-5 py-3 font-mono text-[13px] text-[var(--ink)]">
                      {fn.nome}
                    </td>
                    <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink)]">
                      {fn.chamadas}
                    </td>
                    <td
                      className="px-5 py-3 font-sans text-[13px]"
                      style={{ color: fn.erros > 0 ? "var(--danger)" : "var(--secondary-text)" }}
                    >
                      {fn.erros}
                    </td>
                    <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                      {fn.latencia_ms}ms
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[1px] ${
                          fn.erros === 0
                            ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
                            : "bg-[var(--danger-soft)] text-[var(--danger)]"
                        }`}
                      >
                        {fn.erros === 0 ? "ok" : "com erros"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ERROS INTERNOS */}
        <TabsContent value="erros">
          <p className="mb-4 font-sans text-[14px] text-[var(--muted)]">
            Erros de JS não tratados no client e falhas de SSR/Worker no server · últimos 7 dias.
          </p>

          <div className="mb-6 flex flex-wrap gap-2">
            <FiltroPill
              label="Todos"
              valor={contagemErros.total}
              ativo={filtroOrigem === ""}
              onClick={() => setFiltroOrigem("")}
            />
            <FiltroPill
              label="Client"
              valor={contagemErros.client}
              ativo={filtroOrigem === "client"}
              onClick={() => setFiltroOrigem(filtroOrigem === "client" ? "" : "client")}
            />
            <FiltroPill
              label="Server"
              valor={contagemErros.server}
              ativo={filtroOrigem === "server"}
              onClick={() => setFiltroOrigem(filtroOrigem === "server" ? "" : "server")}
            />
          </div>

          <div className="space-y-3">
            {carregandoErros && (
              <p className="font-sans text-[13px] text-[var(--muted)]">Carregando…</p>
            )}
            {!carregandoErros && errosFiltrados.length === 0 && (
              <div className="rounded-xl border border-[var(--secondary)]/30 bg-[var(--secondary-light)]/30 p-4">
                <p className="font-sans text-[13px] text-[var(--secondary-text)]">
                  Nenhum erro registrado nos últimos 7 dias.
                </p>
              </div>
            )}
            {errosFiltrados.map((e) => (
              <details
                key={e.id}
                className="rounded-2xl border border-[var(--line)] bg-white p-5 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[1px] ${
                          e.origem === "server"
                            ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                            : "bg-[var(--highlight)] text-[var(--highlight-ink)]"
                        }`}
                      >
                        {e.origem}
                      </span>
                      {e.pagina && (
                        <span className="truncate font-mono text-[11px] text-[var(--muted)]">
                          {e.pagina}
                        </span>
                      )}
                    </div>
                    <p className="truncate font-sans text-[14px] text-[var(--ink)]">
                      {e.mensagem}
                    </p>
                  </div>
                  <p className="shrink-0 font-sans text-[11px] text-[var(--muted)]">
                    {new Date(e.criado_em).toLocaleString("pt-BR")}
                  </p>
                </summary>
                {e.stack && (
                  <pre className="mt-4 max-h-[240px] overflow-auto rounded-xl bg-[var(--bg)] p-4 font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">
                    {e.stack}
                  </pre>
                )}
              </details>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

function FiltroPill({
  label,
  valor,
  ativo,
  onClick,
}: {
  label: string;
  valor: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 transition-colors ${
        ativo
          ? "border-[var(--secondary)] bg-[var(--secondary-light)]"
          : "border-[var(--line)] bg-white hover:border-[var(--secondary)]"
      }`}
    >
      <span
        className={`font-cabinet text-[18px] leading-none ${ativo ? "text-[var(--secondary-text)]" : "text-[var(--ink)]"}`}
      >
        {valor}
      </span>
      <span className="font-sans text-[13px] text-[var(--ink-soft)]">{label}</span>
    </button>
  );
}
