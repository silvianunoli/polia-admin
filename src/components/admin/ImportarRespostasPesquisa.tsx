import { useMemo, useRef, useState } from "react";
import { parseCsv } from "@/lib/csv";
import { importarRespostasPesquisa } from "@/lib/pesquisa.functions";
import type { PesquisaConfig, Pergunta } from "@/lib/pesquisas/tipos";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { toastErro, toastSucesso } from "@/lib/toast";

const IGNORAR = "__ignorar__";

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

// Tenta casar automaticamente uma coluna do arquivo com uma pergunta da
// pesquisa, pelo título. Admin sempre revisa e pode corrigir antes de
// confirmar — isso é só o ponto de partida.
function sugerirPergunta(config: PesquisaConfig, cabecalho: string): string {
  const alvo = normalizar(cabecalho);
  const match = config.perguntas.find(
    (p) => normalizar(p.titulo) === alvo || normalizar(p.id) === alvo,
  );
  return match?.id ?? IGNORAR;
}

// Converte o texto de uma célula pro formato que a pesquisa própria salva:
// id da opção (única), array de ids (múltipla) ou texto (aberta). Resposta
// que não bate com nenhuma opção conhecida fica de fora — melhor faltar o
// dado do que contar errado.
function converterValor(pergunta: Pergunta, celula: string): unknown {
  const texto = celula.trim();
  if (!texto) return undefined;

  if (pergunta.tipo === "aberta") return texto;

  const idsPorRotulo = new Map((pergunta.opcoes ?? []).map((o) => [normalizar(o.rotulo), o.id]));
  const idsValidos = new Set((pergunta.opcoes ?? []).map((o) => o.id));

  function paraId(parte: string): string | undefined {
    const p = normalizar(parte);
    if (idsValidos.has(parte.trim())) return parte.trim();
    return idsPorRotulo.get(p);
  }

  if (pergunta.tipo === "multipla") {
    const ids = texto
      .split(/[;|]/)
      .map((parte) => paraId(parte))
      .filter((id): id is string => Boolean(id));
    return ids.length ? ids : undefined;
  }

  return paraId(texto);
}

interface Props {
  slug: string;
  config: PesquisaConfig;
  onImportado: () => void;
}

export function ImportarRespostasPesquisa({ slug, config, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cabecalhos, setCabecalhos] = useState<string[] | null>(null);
  const [linhas, setLinhas] = useState<string[][]>([]);
  const [mapeamento, setMapeamento] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState("");

  const perguntasMapeadas = useMemo(
    () => mapeamento.filter((id) => id !== IGNORAR).length,
    [mapeamento],
  );

  async function lerArquivo(arquivo: File) {
    const texto = await arquivo.text();
    const tabela = parseCsv(texto);
    if (tabela.length < 2) {
      toastErro("Esse arquivo não tem linhas de resposta pra importar.");
      return;
    }
    const [cab, ...resto] = tabela;
    setNomeArquivo(arquivo.name);
    setCabecalhos(cab);
    setLinhas(resto);
    setMapeamento(cab.map((c) => sugerirPergunta(config, c)));
  }

  function cancelar() {
    setCabecalhos(null);
    setLinhas([]);
    setMapeamento([]);
    setNomeArquivo("");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function confirmarImportacao() {
    if (!cabecalhos) return;
    setImportando(true);
    try {
      const colunasMapeadas = mapeamento
        .map((perguntaId, i) => ({ perguntaId, i }))
        .filter((c) => c.perguntaId !== IGNORAR);

      const linhasConvertidas = linhas
        .map((linha) => {
          const respostas: Record<string, unknown> = {};
          for (const { perguntaId, i } of colunasMapeadas) {
            const pergunta = config.perguntas.find((p) => p.id === perguntaId);
            if (!pergunta) continue;
            const valor = converterValor(pergunta, linha[i] ?? "");
            if (valor !== undefined) respostas[perguntaId] = valor;
          }
          return respostas;
        })
        .filter((r) => Object.keys(r).length > 0);

      if (!linhasConvertidas.length) {
        toastErro("Nenhuma linha teve resposta reconhecida com esse mapeamento.");
        return;
      }

      const resultado = await importarRespostasPesquisa({
        data: { slug, linhas: linhasConvertidas },
      });
      if (!resultado.ok) {
        toastErro("Não consegui importar. Tenta de novo em instantes.");
        return;
      }
      toastSucesso(
        `${resultado.inseridas} resposta${resultado.inseridas === 1 ? "" : "s"} importada${resultado.inseridas === 1 ? "" : "s"}.`,
      );
      cancelar();
      onImportado();
    } catch {
      toastErro("Não consegui importar. Tenta de novo em instantes.");
    } finally {
      setImportando(false);
    }
  }

  return (
    <Accordion
      type="single"
      collapsible
      className="mb-6 rounded-2xl border border-[var(--line)] bg-white px-4"
    >
      <AccordionItem value="importar" className="border-b-0">
        <AccordionTrigger className="font-sans text-[13px] font-semibold text-[var(--ink)] no-underline hover:no-underline">
          Importar respostas de outro formulário
        </AccordionTrigger>
        <AccordionContent>
          <p className="mb-3 font-sans text-[12px] text-[var(--muted)]">
            Envie um CSV exportado do Google Forms, Typeform etc. Você mapeia cada coluna pra uma
            pergunta antes de confirmar.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) void lerArquivo(arquivo);
            }}
          />
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-[var(--line)] bg-white px-4 py-1.5 font-sans text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)]"
          >
            Escolher arquivo CSV
          </button>

          {cabecalhos && (
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <p className="mb-3 font-sans text-[12px] text-[var(--muted)]">
                <strong className="text-[var(--ink)]">{nomeArquivo}</strong> · {linhas.length} linha
                {linhas.length === 1 ? "" : "s"} · {perguntasMapeadas} coluna
                {perguntasMapeadas === 1 ? "" : "s"} mapeada{perguntasMapeadas === 1 ? "" : "s"}
              </p>
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {cabecalhos.map((cab, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <p
                      className="w-1/2 truncate font-sans text-[13px] text-[var(--ink-soft)]"
                      title={cab}
                    >
                      {cab}
                    </p>
                    <select
                      value={mapeamento[i] ?? IGNORAR}
                      onChange={(e) =>
                        setMapeamento((m) => m.map((v, idx) => (idx === i ? e.target.value : v)))
                      }
                      className="flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-1.5 font-sans text-[13px] text-[var(--ink)]"
                    >
                      <option value={IGNORAR}>Ignorar essa coluna</option>
                      {config.perguntas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.ordem}. {p.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={() => void confirmarImportacao()}
                  disabled={importando || perguntasMapeadas === 0}
                  className="rounded-lg bg-[var(--secondary)] px-4 py-1.5 font-sans text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {importando
                    ? "Importando…"
                    : `Importar ${linhas.length} resposta${linhas.length === 1 ? "" : "s"}`}
                </button>
                <button
                  onClick={cancelar}
                  disabled={importando}
                  className="rounded-lg border border-[var(--line)] bg-white px-4 py-1.5 font-sans text-[13px] text-[var(--ink-soft)] disabled:opacity-40"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
