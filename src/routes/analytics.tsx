import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { BTN_PRIMARIO, BTN_SECUNDARIO, CARD_CLASS, INPUT_CLASS } from "@/lib/botoes";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [{ title: "Analytics · Pólia" }],
  }),
  component: AdminAnalytics,
});

interface Evento {
  evento: string;
  pagina: string;
  sessao_id: string;
  propriedades: Json;
  criado_em: string;
}

// Eventos automáticos não contam como "uso de feature" nem como "erro de
// negócio" — são ruído de fundo (pageview) ou já cobertos pelo próprio nome
// do clique (click), que aparece como elemento em propriedades, não evento.
const EVENTOS_AUTOMATICOS = new Set(["pageview", "click"]);

const DIAS_LABEL = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function dataParaInputISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AdminAnalytics() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [de, setDe] = useState(() => dataParaInputISO(new Date(Date.now() - 7 * 86400000)));
  const [ate, setAte] = useState(() => dataParaInputISO(new Date()));
  const [buscaEvento, setBuscaEvento] = useState("");

  const buscar = async () => {
    setCarregando(true);
    setErro(false);
    const fimDia = new Date(`${ate}T23:59:59.999`).toISOString();
    let query = supabase
      .from("eventos_analytics")
      .select("evento,pagina,sessao_id,propriedades,criado_em")
      .gte("criado_em", new Date(`${de}T00:00:00`).toISOString())
      .lte("criado_em", fimDia)
      .order("criado_em", { ascending: false })
      .limit(5000);
    if (buscaEvento.trim()) query = query.ilike("evento", `%${buscaEvento.trim()}%`);
    try {
      // O supabase-js devolve o erro no objeto, não lança: sem esta checagem a
      // falha vira "nenhum evento" na tela, que é mentira diferente.
      const { data, error } = await query;
      if (error) setErro(true);
      setEventos(data ?? []);
    } catch {
      setErro(true);
      setEventos([]);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportarCsv = () => {
    const linhas = [["evento", "pagina", "sessao_id", "criado_em"]];
    eventos.forEach((e) => linhas.push([e.evento, e.pagina, e.sessao_id, e.criado_em]));
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `eventos-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const pageviews = useMemo(() => eventos.filter((e) => e.evento === "pageview"), [eventos]);

  const sessoesUnicas = useMemo(() => new Set(eventos.map((e) => e.sessao_id)).size, [eventos]);

  const porDia = useMemo(() => {
    const dias: { label: string; data: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const chave = d.toISOString().slice(0, 10);
      dias.push({ label: DIAS_LABEL[d.getDay()], data: chave, total: 0 });
    }
    pageviews.forEach((e) => {
      const chave = e.criado_em.slice(0, 10);
      const dia = dias.find((d) => d.data === chave);
      if (dia) dia.total++;
    });
    return dias;
  }, [pageviews]);

  const topPaginas = useMemo(() => {
    const map = new Map<string, number>();
    pageviews.forEach((e) => map.set(e.pagina, (map.get(e.pagina) ?? 0) + 1));
    return Array.from(map.entries())
      .map(([pagina, total]) => ({ pagina, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [pageviews]);

  const usoPorFeature = useMemo(() => {
    const map = new Map<string, { total: number; sessoes: Set<string> }>();
    eventos.forEach((e) => {
      if (EVENTOS_AUTOMATICOS.has(e.evento) || e.evento.endsWith("_falhou")) return;
      const atual = map.get(e.evento) ?? { total: 0, sessoes: new Set<string>() };
      atual.total++;
      atual.sessoes.add(e.sessao_id);
      map.set(e.evento, atual);
    });
    return Array.from(map.entries())
      .map(([evento, v]) => ({ evento, total: v.total, sessoesUnicas: v.sessoes.size }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [eventos]);

  const errosNegocio = useMemo(() => {
    const map = new Map<string, number>();
    eventos.forEach((e) => {
      if (!e.evento.endsWith("_falhou")) return;
      const motivo = (e.propriedades as { motivo?: string } | null)?.motivo ?? "sem_motivo";
      const chave = `${e.evento} · ${motivo}`;
      map.set(chave, (map.get(chave) ?? 0) + 1);
    });
    return Array.from(map.entries())
      .map(([chave, total]) => ({ chave, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [eventos]);

  const maxDia = Math.max(1, ...porDia.map((d) => d.total));
  const maxPagina = Math.max(1, ...topPaginas.map((p) => p.total));
  const maxFeature = Math.max(1, ...usoPorFeature.map((f) => f.total));
  const maxErro = Math.max(1, ...errosNegocio.map((e) => e.total));

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Analytics</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Comportamento nas páginas públicas e logadas · só quem aceitou cookies de análise entra na
        conta.
      </p>

      <div className={`mb-6 flex flex-wrap items-end gap-3 ${CARD_CLASS} p-4`}>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[11px] font-medium text-[var(--muted)]">De</span>
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[11px] font-medium text-[var(--muted)]">Até</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="font-sans text-[11px] font-medium text-[var(--muted)]">Evento</span>
          <input
            type="text"
            placeholder="ex: pageview"
            value={buscaEvento}
            onChange={(e) => setBuscaEvento(e.target.value)}
            className={`${INPUT_CLASS} min-w-[160px]`}
          />
        </label>
        <button onClick={buscar} disabled={carregando} className={BTN_PRIMARIO}>
          {carregando ? "Buscando…" : "Aplicar"}
        </button>
        <button onClick={exportarCsv} disabled={eventos.length === 0} className={BTN_SECUNDARIO}>
          Exportar CSV
        </button>
        <span className="font-sans text-[12px] text-[var(--muted)]">{eventos.length} eventos</span>
      </div>

      {erro && (
        <div className="mb-6 rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-5">
          <p className="font-sans text-[13px] text-[var(--danger)]">
            Não conseguimos carregar os eventos agora. Tenta aplicar o filtro de novo.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className={`${CARD_CLASS} p-5`}>
          <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Pageviews
          </p>
          <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
            {carregando ? "…" : pageviews.length}
          </p>
        </div>
        <div className={`${CARD_CLASS} p-5`}>
          <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Sessões
          </p>
          <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
            {carregando ? "…" : sessoesUnicas}
          </p>
        </div>
        <div className={`${CARD_CLASS} p-5`}>
          <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Páginas/sessão
          </p>
          <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
            {carregando ? "…" : sessoesUnicas ? (pageviews.length / sessoesUnicas).toFixed(1) : "0"}
          </p>
        </div>
      </div>

      <div className={`mb-6 ${CARD_CLASS} p-6`}>
        <h2 className="mb-5 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Pageviews por dia
        </h2>
        {carregando && (
          <p className="mb-3 font-sans text-[13px] text-[var(--muted)]">Carregando…</p>
        )}
        <div className="flex h-32 items-end gap-3">
          {porDia.map((d) => (
            <div key={d.data} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex h-full w-full items-end">
                <div
                  className="w-full rounded-t-md bg-[var(--secondary)] transition-all"
                  style={{ height: `${(d.total / maxDia) * 100}%`, minHeight: d.total ? 4 : 0 }}
                />
              </div>
              <p className="font-sans text-[11px] text-[var(--muted)]">{d.label}</p>
              <p className="font-sans text-[11px] font-medium text-[var(--ink-soft)]">{d.total}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-6`}>
          <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Top páginas
          </h2>
          {carregando ? (
            <p className="font-sans text-[13px] text-[var(--muted)]">Carregando…</p>
          ) : topPaginas.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--muted)]">Sem dados no período.</p>
          ) : (
            <div className="space-y-3">
              {topPaginas.map((p) => (
                <div key={p.pagina}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="truncate font-mono text-[12px] text-[var(--ink)]">{p.pagina}</p>
                    <p className="shrink-0 pl-2 font-sans text-[12px] text-[var(--muted)]">
                      {p.total}
                    </p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--secondary)]"
                      style={{ width: `${(p.total / maxPagina) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${CARD_CLASS} p-6`}>
          <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Eventos recentes
          </h2>
          <div className="max-h-[320px] space-y-2 overflow-y-auto">
            {carregando && <p className="font-sans text-[13px] text-[var(--muted)]">Carregando…</p>}
            {!carregando && eventos.length === 0 && (
              <p className="font-sans text-[13px] text-[var(--muted)]">Nenhum evento ainda.</p>
            )}
            {eventos.slice(0, 50).map((e, i) => (
              <div
                key={i}
                className="flex items-center justify-between border-b border-[var(--line)] pb-2 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-sans text-[13px] text-[var(--ink)]">{e.evento}</p>
                  <p className="truncate font-mono text-[11px] text-[var(--muted)]">{e.pagina}</p>
                </div>
                <p className="shrink-0 pl-2 font-sans text-[11px] text-[var(--muted)]">
                  {new Date(e.criado_em).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-6`}>
          <h2 className="mb-1 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Uso por feature
          </h2>
          <p className="mb-4 font-sans text-[12px] text-[var(--muted)]">
            Quais ações ela mais faz no período, e em quantas sessões diferentes.
          </p>
          {carregando ? (
            <p className="font-sans text-[13px] text-[var(--muted)]">Carregando…</p>
          ) : usoPorFeature.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--muted)]">Sem dados no período.</p>
          ) : (
            <div className="space-y-3">
              {usoPorFeature.map((f) => (
                <div key={f.evento}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="truncate font-mono text-[12px] text-[var(--ink)]">{f.evento}</p>
                    <p className="shrink-0 pl-2 font-sans text-[12px] text-[var(--muted)]">
                      {f.total} · {f.sessoesUnicas} sessões
                    </p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--secondary)]"
                      style={{ width: `${(f.total / maxFeature) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={`${CARD_CLASS} p-6`}>
          <h2 className="mb-1 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Erros de negócio
          </h2>
          <p className="mb-4 font-sans text-[12px] text-[var(--muted)]">
            Fricção esperada (checkout recusado, formulário inválido), não é crash. Crash fica em{" "}
            <span className="font-mono">/logs</span>.
          </p>
          {carregando ? (
            <p className="font-sans text-[13px] text-[var(--muted)]">Carregando…</p>
          ) : errosNegocio.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Nenhum erro de negócio no período.
            </p>
          ) : (
            <div className="space-y-3">
              {errosNegocio.map((e) => (
                <div key={e.chave}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="truncate font-mono text-[12px] text-[var(--ink)]">{e.chave}</p>
                    <p className="shrink-0 pl-2 font-sans text-[12px] text-[var(--muted)]">
                      {e.total}
                    </p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--danger)]"
                      style={{ width: `${(e.total / maxErro) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
