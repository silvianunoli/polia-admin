import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronDown, Search } from "lucide-react";
import type { Bloco, FerramentaSetup } from "@/lib/ferramentas-setup";
import { buscarFerramentasSetup } from "@/lib/ferramentas.functions";
import { ALERTA_ERRO_CLASS, CARD_CLASS, INPUT_CLASS } from "@/lib/botoes";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/ferramentas")({
  head: () => ({ meta: [{ title: "Setup de ferramentas · Pólia" }] }),
  component: SetupFerramentas,
});

// O texto de cada passo vem com marcação inline do markdown original
// (<code>, <b>). É conteúdo versionado no repo, não entrada de usuária, então
// entra por innerHTML mesmo; estas classes cuidam de como ele aparece.
const PROSA =
  "[&_code]:rounded-[4px] [&_code]:border [&_code]:border-[var(--line)] [&_code]:bg-[var(--bg)] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-[var(--ink)] [&_b]:font-medium [&_b]:text-[var(--ink)]";

function Blocos({ blocos }: { blocos: Bloco[] }) {
  return (
    <>
      {blocos.map((bloco, i) => {
        if (bloco.tipo === "ol") {
          return (
            <ol key={i} className="space-y-1">
              {bloco.itens.map((passo, j) => (
                <li key={j} className="grid grid-cols-[22px_1fr] gap-2 py-1">
                  <span className="pt-0.5 font-accent text-[11px] font-bold text-[var(--secondary-text)]">
                    {j + 1}
                  </span>
                  <div>
                    <span
                      className={`font-sans text-[13px] leading-relaxed text-[var(--ink-soft)] ${PROSA}`}
                      dangerouslySetInnerHTML={{ __html: passo.texto }}
                    />
                    {passo.code ? (
                      <pre className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 py-2 font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">
                        {passo.code}
                      </pre>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          );
        }
        if (bloco.tipo === "ul") {
          return (
            <ul key={i} className="space-y-2">
              {bloco.itens.map((item, j) => (
                <li
                  key={j}
                  className={`flex gap-2 font-sans text-[13px] leading-relaxed text-[var(--ink-soft)] ${PROSA}`}
                >
                  <span aria-hidden="true" className="text-[var(--danger)]">
                    ·
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: item }} />
                </li>
              ))}
            </ul>
          );
        }
        if (bloco.tipo === "h4") {
          return (
            <p
              key={i}
              className="mt-4 mb-2 font-accent text-[11px] font-bold uppercase tracking-[1.5px] text-[var(--secondary-text)] first:mt-0"
            >
              <span dangerouslySetInnerHTML={{ __html: bloco.html }} />
            </p>
          );
        }
        return (
          <p
            key={i}
            className={`my-2 font-sans text-[13px] leading-relaxed text-[var(--ink-soft)] ${PROSA}`}
            dangerouslySetInnerHTML={{ __html: bloco.html }}
          />
        );
      })}
    </>
  );
}

// Texto puro de uma ferramenta, só pra busca casar com o que está escondido
// dentro do passo a passo (não só com o nome do card).
function textoDaFerramenta(f: FerramentaSetup): string {
  const deBloco = (b: Bloco): string => {
    if (b.tipo === "ol") return b.itens.map((i) => `${i.texto} ${i.code ?? ""}`).join(" ");
    if (b.tipo === "ul") return b.itens.join(" ");
    return b.html;
  };
  return [f.nome, f.oQueE, ...f.passos.map(deBloco), ...f.armadilhas.map(deBloco)]
    .join(" ")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase();
}

function SetupFerramentas() {
  const [ferramentas, setFerramentas] = useState<FerramentaSetup[] | null>(null);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivo = true;
    buscarFerramentasSetup()
      .then((lista) => {
        if (vivo) setFerramentas(lista);
      })
      .catch(() => {
        if (vivo) setErro(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const indice = useMemo(
    () => (ferramentas ?? []).map((f) => ({ id: f.id, texto: textoDaFerramenta(f) })),
    [ferramentas],
  );
  const termo = busca.trim().toLowerCase();
  const lista = ferramentas ?? [];
  const visiveis = termo
    ? lista.filter((f) => indice.find((i) => i.id === f.id)?.texto.includes(termo))
    : lista;

  const alternar = (id: string) =>
    setAbertas((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });

  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4 md:px-10">
        <Link
          to="/central"
          className="flex items-center gap-2 font-sans text-[14px] text-[var(--ink-soft)] no-underline hover:text-[var(--ink)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Central
        </Link>
        <span className="font-sans text-[14px] text-[var(--muted)]">
          {ferramentas ? `${ferramentas.length} ferramentas externas` : "carregando…"}
        </span>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 md:px-10">
        <h1 className="font-cabinet text-[28px] leading-tight text-[var(--ink)]">
          Setup de ferramentas
        </h1>
        <p className="mt-2 font-sans text-[15px] text-[var(--ink-soft)]">
          Runbook das ferramentas externas do projeto, extraído de{" "}
          <code className="rounded-[4px] border border-[var(--line)] bg-white px-1 py-0.5 font-mono text-[12px]">
            SETUP-FERRAMENTAS-EXTERNAS.md
          </code>
          . Abre o nome pra ver o passo a passo e as armadilhas reais já encontradas. Nenhum segredo
          aparece aqui, só onde cada um vive.
        </p>

        <div className="relative mt-6 mb-6">
          <Search
            size={16}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por ferramenta, chave ou comando"
            aria-label="Buscar nas ferramentas"
            className={`${INPUT_CLASS} pl-9`}
          />
        </div>

        {erro ? (
          <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o runbook das ferramentas.</div>
        ) : ferramentas === null ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <SkeletonBloco key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : visiveis.length === 0 ? (
          <p className="font-sans text-[13px] text-[var(--muted)]">
            Nenhuma ferramenta com esse termo.
          </p>
        ) : (
          <div className="space-y-3">
            {visiveis.map((f) => {
              const aberta = abertas.has(f.id);
              return (
                <div key={f.id} className={CARD_CLASS}>
                  <button
                    type="button"
                    onClick={() => alternar(f.id)}
                    aria-expanded={aberta}
                    aria-controls={`ferramenta-${f.id}`}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--surface)]"
                  >
                    <span className="min-w-0">
                      <span className="block font-sans text-[15px] font-medium text-[var(--ink)]">
                        {f.id}. {f.nome}
                      </span>
                      <span
                        className={`mt-1 block font-sans text-[13px] leading-relaxed text-[var(--muted)] ${PROSA}`}
                        dangerouslySetInnerHTML={{ __html: f.oQueE }}
                      />
                    </span>
                    <span className="flex shrink-0 items-center gap-2 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
                      {aberta ? "fechar" : "ver passo a passo"}
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={`transition-transform ${aberta ? "rotate-180" : ""}`}
                      />
                    </span>
                  </button>

                  {aberta ? (
                    <div
                      id={`ferramenta-${f.id}`}
                      className="border-t border-[var(--line)] px-5 py-4"
                    >
                      <Blocos blocos={f.passos} />
                      {f.armadilhas.length > 0 ? (
                        <div className="mt-4 rounded-xl bg-[var(--danger-soft)] px-4 py-3">
                          <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--danger)]">
                            Armadilhas reais encontradas neste projeto
                          </p>
                          <Blocos blocos={f.armadilhas} />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
