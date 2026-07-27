import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pesquisaPorSlug } from "@/lib/pesquisas/registro";
import type { Pergunta } from "@/lib/pesquisas/tipos";
import {
  funil,
  abandonoPorPergunta,
  distribuicao,
  respostasAbertas,
  filtrarPorSegmento,
  type RespostaRow,
} from "@/lib/pesquisa-agg";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ImportarRespostasPesquisa } from "@/components/admin/ImportarRespostasPesquisa";

export const Route = createFileRoute("/pesquisas/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} · Pesquisas · Pólia` }],
  }),
  component: AdminPesquisaDetalhe,
});

// Dimensões de recorte (perguntas de escolha única que fazem sentido segmentar).
const DIMENSOES = ["categoria", "quem_toca", "tem_marca", "inseguranca"];

// Perguntas com poucas opções ficam mais legíveis como uma única barra
// segmentada (100% empilhada) em vez de uma pilha de barras — cabe mais na
// tela sem rolar. Com mais opções, a pilha ordenada continua sendo a leitura
// melhor.
const MAX_OPCOES_SEGMENTADA = 6;
// Tokens do escopo .polia-v3 (não os --chart-1..5, que são só bridge pra
// libs de gráfico externas — ver DESIGN.md/styles.css).
const CORES_SEGMENTO = [
  "var(--secondary)",
  "var(--accent)",
  "var(--highlight)",
  "var(--secondary-light)",
  "var(--ink-soft)",
  "var(--muted)",
];

function rotuloResposta(p: Pergunta, v: unknown): string {
  if (v === undefined || v === null) return "";
  if (p.tipo === "aberta") return typeof v === "string" ? v : "";
  const mapa = new Map((p.opcoes ?? []).map((o) => [o.id, o.rotulo]));
  if (p.tipo === "multipla" && Array.isArray(v)) {
    return v.map((x) => mapa.get(String(x)) ?? String(x)).join("; ");
  }
  return mapa.get(String(v)) ?? String(v);
}

function StatTile({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
      <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
        {label}
      </p>
      <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">{valor}</p>
    </div>
  );
}

function Barra({ pct, cor = "var(--secondary)" }: { pct: number; cor?: string }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
      <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
    </div>
  );
}

// Barra única 100% empilhada: um segmento colorido por opção + legenda com
// contagem. Substitui a pilha de barras quando a pergunta tem poucas opções.
function BarraSegmentada({
  itens,
}: {
  itens: { id: string; rotulo: string; contagem: number; pct: number }[];
}) {
  const comValor = itens.filter((i) => i.contagem > 0);
  if (comValor.length === 0) {
    return <p className="font-sans text-[13px] text-[var(--muted)]">Sem respostas ainda.</p>;
  }
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {comValor.map((it, i) => (
          <div
            key={it.id}
            style={{
              width: `${it.pct}%`,
              backgroundColor: CORES_SEGMENTO[i % CORES_SEGMENTO.length],
            }}
            title={`${it.rotulo}: ${it.pct}%`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        {comValor.map((it, i) => (
          <div key={it.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 truncate font-sans text-[12px] text-[var(--ink-soft)]">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: CORES_SEGMENTO[i % CORES_SEGMENTO.length] }}
              />
              {it.rotulo}
            </span>
            <span className="shrink-0 font-sans text-[12px] text-[var(--muted)]">
              {it.contagem} · {it.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const tabTriggerClass =
  "rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none";

function AdminPesquisaDetalhe() {
  const { slug } = Route.useParams();
  const config = pesquisaPorSlug(slug);

  if (!config) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-white p-8">
        <p className="font-sans text-[15px] text-[var(--ink-soft)]">
          Não achei essa pesquisa.{" "}
          <Link to="/pesquisas" className="text-[var(--secondary-text)]">
            Voltar pra lista
          </Link>
          .
        </p>
      </div>
    );
  }

  return <AdminPesquisaDetalheConteudo slug={slug} config={config} />;
}

function AdminPesquisaDetalheConteudo({
  slug,
  config,
}: {
  slug: string;
  config: NonNullable<ReturnType<typeof pesquisaPorSlug>>;
}) {
  const [carregando, setCarregando] = useState(true);
  const [ativa, setAtiva] = useState(false);
  const [tituloPesquisa, setTituloPesquisa] = useState("");
  const [rows, setRows] = useState<RespostaRow[]>([]);
  const [viram, setViram] = useState<number | null>(null);
  const [dim, setDim] = useState("");
  const [valorDim, setValorDim] = useState("");
  const [buscaAberta, setBuscaAberta] = useState("");

  const carregar = useCallback(async () => {
    const { data: pesquisa } = await supabase
      .from("pesquisas")
      .select("id, ativa, titulo")
      .eq("slug", slug)
      .maybeSingle();
    if (pesquisa) {
      setAtiva(pesquisa.ativa);
      setTituloPesquisa(pesquisa.titulo);
      const { data: rr } = await supabase
        .from("pesquisa_respostas")
        .select("progresso, concluida, respostas, criado_em")
        .eq("pesquisa_id", pesquisa.id)
        .limit(10000);
      setRows((rr as RespostaRow[] | null) ?? []);
    }
    try {
      const { count } = await supabase
        .from("eventos_analytics")
        .select("id", { count: "exact", head: true })
        .eq("evento", "pesquisa_vista");
      setViram(count ?? null);
    } catch {
      setViram(null);
    }
    setCarregando(false);
  }, [slug]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const dimensoesDisponiveis = useMemo(
    () => DIMENSOES.filter((d) => config.perguntas.some((p) => p.id === d)),
    [config],
  );
  const perguntasPorId = useMemo(
    () => Object.fromEntries(config.perguntas.map((p) => [p.id, p])),
    [config],
  );

  const filtradas = useMemo(() => filtrarPorSegmento(rows, dim, valorDim), [rows, dim, valorDim]);
  const resumo = useMemo(() => funil(filtradas), [filtradas]);
  const abandono = useMemo(
    () => abandonoPorPergunta(filtradas, config.perguntas),
    [filtradas, config],
  );
  const semResposta = useMemo(
    () => filtradas.filter((r) => !r.concluida && r.progresso === 0).length,
    [filtradas],
  );
  const maxAband = Math.max(1, semResposta, ...abandono.map((a) => a.abandonos));
  const maxFunil = Math.max(1, viram ?? 0, resumo.comecaram);
  const perguntasFechadas = config.perguntas.filter((p) => p.tipo !== "aberta");
  const dimPergunta = dim ? perguntasPorId[dim] : undefined;

  const perguntasAbertas = config.perguntas.filter((p) => p.tipo === "aberta");
  const buscasAbertas = useMemo(
    () =>
      perguntasAbertas.map((p) => ({
        pergunta: p,
        respostas: respostasAbertas(filtradas, p.id).filter((t) =>
          t.toLowerCase().includes(buscaAberta.trim().toLowerCase()),
        ),
      })),
    [filtradas, buscaAberta, perguntasAbertas],
  );

  function exportarCsv() {
    const perguntas = config.perguntas;
    const header = ["criado_em", "concluida", ...perguntas.map((p) => p.titulo)];
    const linhas: string[][] = [header];
    filtradas.forEach((r) => {
      linhas.push([
        r.criado_em,
        r.concluida ? "sim" : "nao",
        ...perguntas.map((p) => rotuloResposta(p, r.respostas[p.id])),
      ]);
    });
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pesquisa-${slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Link
        to="/pesquisas"
        className="mb-3 inline-flex items-center gap-1.5 font-sans text-[13px] text-[var(--muted)] no-underline hover:text-[var(--ink-soft)]"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Todas as pesquisas
      </Link>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h1 className="font-cabinet text-[40px] text-[var(--ink)]">{tituloPesquisa || slug}</h1>
        <span
          className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
            ativa
              ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
              : "bg-[var(--surface)] text-[var(--muted)]"
          }`}
        >
          {ativa ? "No ar" : "Fechada"}
        </span>
      </div>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Aderência e resultados. Começaram e concluíram vêm da própria pesquisa (não dependem de
        cookie).
      </p>

      <ImportarRespostasPesquisa slug={slug} config={config} onImportado={() => void carregar()} />

      {/* Recorte + export */}
      <div className="mb-6 flex flex-wrap items-end gap-3 rounded-2xl border border-[var(--line)] bg-white p-4">
        <label className="flex flex-col gap-1">
          <span className="font-sans text-[11px] font-medium text-[var(--muted)]">
            Recortar por
          </span>
          <select
            value={dim}
            onChange={(e) => {
              setDim(e.target.value);
              setValorDim("");
            }}
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 font-sans text-[13px] text-[var(--ink)]"
          >
            <option value="">Todas as respostas</option>
            {dimensoesDisponiveis.map((d) => (
              <option key={d} value={d}>
                {perguntasPorId[d]?.titulo ?? d}
              </option>
            ))}
          </select>
        </label>
        {dimPergunta && (
          <label className="flex flex-col gap-1">
            <span className="font-sans text-[11px] font-medium text-[var(--muted)]">Valor</span>
            <select
              value={valorDim}
              onChange={(e) => setValorDim(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 font-sans text-[13px] text-[var(--ink)]"
            >
              <option value="">Todos</option>
              {(dimPergunta.opcoes ?? []).map((o) => (
                <option key={o.id} value={o.id}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex-1" />
        <button
          onClick={exportarCsv}
          disabled={filtradas.length === 0}
          className="rounded-lg border border-[var(--line)] bg-white px-4 py-1.5 font-sans text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)] disabled:opacity-40"
        >
          Exportar CSV
        </button>
        <span className="font-sans text-[12px] text-[var(--muted)]">
          {filtradas.length} resposta{filtradas.length === 1 ? "" : "s"}
        </span>
      </div>

      {carregando ? (
        <p className="font-sans text-[14px] text-[var(--muted)]">Carregando…</p>
      ) : resumo.comecaram === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-white p-8">
          <p className="font-sans text-[15px] text-[var(--ink-soft)]">
            Nenhuma resposta ainda{dim ? " nesse recorte" : ""}.{" "}
            {ativa
              ? "A pesquisa está no ar em /pesquisa."
              : "A pesquisa está fechada. Ative na lista de pesquisas pra abrir."}
          </p>
        </div>
      ) : (
        <>
          {/* KPIs — sempre visíveis, acima das abas */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatTile label="Começaram" valor={String(resumo.comecaram)} />
            <StatTile label="Concluíram" valor={String(resumo.concluiram)} />
            <StatTile label="Taxa de conclusão" valor={`${resumo.taxaConclusao}%`} />
            <StatTile label="Viram*" valor={viram == null ? "—" : String(viram)} />
          </div>

          <Tabs defaultValue="visao-geral">
            <TabsList className="mb-6 bg-[var(--surface)]">
              <TabsTrigger value="visao-geral" className={tabTriggerClass}>
                Visão geral
              </TabsTrigger>
              <TabsTrigger value="perguntas" className={tabTriggerClass}>
                Perguntas
              </TabsTrigger>
              {perguntasAbertas.length > 0 && (
                <TabsTrigger value="abertas" className={tabTriggerClass}>
                  Respostas abertas
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="visao-geral">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
                  <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
                    Aderência (funil)
                  </p>
                  <div className="space-y-3">
                    {[
                      { rot: "Viram*", n: viram ?? 0, mostrar: viram != null },
                      { rot: "Começaram", n: resumo.comecaram, mostrar: true },
                      { rot: "Concluíram", n: resumo.concluiram, mostrar: true },
                    ]
                      .filter((x) => x.mostrar)
                      .map((x) => (
                        <div key={x.rot}>
                          <div className="mb-1 flex items-center justify-between">
                            <p className="font-sans text-[13px] text-[var(--ink)]">{x.rot}</p>
                            <p className="font-sans text-[12px] text-[var(--muted)]">{x.n}</p>
                          </div>
                          <Barra pct={(x.n / maxFunil) * 100} cor="var(--secondary)" />
                        </div>
                      ))}
                  </div>
                  <p className="mt-4 font-sans text-[11px] text-[var(--muted)]">
                    *Viram é melhor esforço (só conta quem aceitou cookies de análise). Pode
                    subcontar.
                  </p>
                </div>

                <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
                  <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
                    Onde abandonam
                  </p>
                  <p className="mb-4 font-sans text-[12px] text-[var(--muted)]">
                    Entre quem não concluiu, em qual pergunta parou.
                  </p>
                  <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate font-sans text-[12px] text-[var(--ink)]">
                          Começou e não respondeu nada
                        </p>
                        <p className="shrink-0 font-sans text-[12px] text-[var(--muted)]">
                          {semResposta}
                        </p>
                      </div>
                      <Barra pct={(semResposta / maxAband) * 100} cor="var(--danger)" />
                    </div>
                    {abandono.map((a) => (
                      <div key={a.id}>
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate font-sans text-[12px] text-[var(--ink)]">
                            {a.ordem}. {a.titulo}
                          </p>
                          <p className="shrink-0 font-sans text-[12px] text-[var(--muted)]">
                            {a.abandonos}
                          </p>
                        </div>
                        <Barra pct={(a.abandonos / maxAband) * 100} cor="var(--danger)" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="perguntas">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {perguntasFechadas.map((p) => {
                  const itens = distribuicao(filtradas, p);
                  const max = Math.max(1, ...itens.map((i) => i.contagem));
                  const usaSegmentada = itens.length <= MAX_OPCOES_SEGMENTADA;
                  return (
                    <div
                      key={p.id}
                      className="rounded-2xl border border-[var(--line)] bg-white p-5"
                    >
                      <p className="mb-4 font-sans text-[13px] font-semibold text-[var(--ink)]">
                        {p.ordem}. {p.titulo}
                      </p>
                      {usaSegmentada ? (
                        <BarraSegmentada itens={itens} />
                      ) : (
                        <div className="space-y-3">
                          {itens.map((it) => (
                            <div key={it.id}>
                              <div className="mb-1 flex items-center justify-between gap-2">
                                <p className="truncate font-sans text-[12px] text-[var(--ink-soft)]">
                                  {it.rotulo}
                                </p>
                                <p className="shrink-0 font-sans text-[12px] text-[var(--muted)]">
                                  {it.contagem} · {it.pct}%
                                </p>
                              </div>
                              <Barra pct={(it.contagem / max) * 100} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {perguntasAbertas.length > 0 && (
              <TabsContent value="abertas">
                <div className="mb-4 flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="buscar palavra…"
                    value={buscaAberta}
                    onChange={(e) => setBuscaAberta(e.target.value)}
                    className="min-w-[180px] rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 font-sans text-[13px] text-[var(--ink)] placeholder:text-[var(--muted)]"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {buscasAbertas.map(({ pergunta, respostas: lista }) => (
                    <div
                      key={pergunta.id}
                      className="rounded-2xl border border-[var(--line)] bg-white p-6"
                    >
                      <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
                        {pergunta.titulo} · {lista.length}
                      </p>
                      {lista.length === 0 ? (
                        <p className="font-sans text-[13px] text-[var(--muted)]">
                          Nada por aqui ainda.
                        </p>
                      ) : (
                        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                          {lista.map((t, i) => (
                            <p
                              key={i}
                              className="rounded-lg border-l-2 border-[var(--secondary)] bg-[var(--surface)] px-3 py-2 font-sans text-[13px] leading-[1.5] text-[var(--ink-soft)]"
                            >
                              {t}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>
            )}
          </Tabs>
        </>
      )}
    </>
  );
}
