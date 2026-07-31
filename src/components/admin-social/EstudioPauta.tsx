import { useEffect, useState } from "react";
import { nextMonday, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { gerarLotePauta } from "@/lib/social.functions";
import { toastErro, toastSucesso } from "@/lib/toast";
import { logAcaoAdmin } from "@/lib/audit-log";

// Client sem generic <Database> neste app — tipo definido à mão em vez de
// Tables<"social_pauta">.
interface PautaItem {
  id: string;
  dia: string;
  status: string;
  gancho: string | null;
  formato: string;
  pilar: string | null;
  cta: string | null;
  post_id: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  feed: "Foto única",
  carrossel: "Carrossel",
  reel: "Reel",
  story: "Story",
};

interface EstudioPautaProps {
  onPecaProduzida: () => void;
  onAbrirPost: (postId: string) => void;
}

export function EstudioPauta({ onPecaProduzida, onAbrirPost }: EstudioPautaProps) {
  const [itens, setItens] = useState<PautaItem[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [produzindoId, setProduzindoId] = useState<string | null>(null);
  const [erroPorItem, setErroPorItem] = useState<Record<string, string>>({});
  const [mostrarFormLote, setMostrarFormLote] = useState(false);
  const [gerandoLote, setGerandoLote] = useState(false);
  const [erroLote, setErroLote] = useState("");
  const [semanaInicial, setSemanaInicial] = useState(() => format(nextMonday(new Date()), "yyyy-MM-dd"));
  const [contextoLote, setContextoLote] = useState("");

  async function carregar() {
    setCarregando(true);
    const { data } = await supabase
      .from("social_pauta")
      .select("*")
      .order("dia", { ascending: true });
    setItens(data ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function produzir(item: PautaItem) {
    setProduzindoId(item.id);
    setErroPorItem((atual) => ({ ...atual, [item.id]: "" }));
    const { data, error } = await supabase.functions.invoke("social-ia", {
      body: { acao: "produzir", pauta_id: item.id },
    });
    setProduzindoId(null);

    if (error || data?.error) {
      const mensagem = data?.error ?? "O motor não respondeu. Tenta de novo.";
      setErroPorItem((atual) => ({ ...atual, [item.id]: mensagem }));
      toastErro(mensagem);
      return;
    }

    await logAcaoAdmin("produzir_peca_social_ui", data.post_id, {
      veredito: data.veredito?.veredito,
    });
    if (data.veredito?.veredito === "REPROVADA") {
      toastErro("A revisora reprovou essa peça (motivos no rascunho). Confere na Fila.");
    } else {
      toastSucesso("Peça produzida e aprovada pela revisora. Já está na Fila como rascunho.");
    }
    carregar();
    onPecaProduzida();
  }

  async function gerarLote() {
    setGerandoLote(true);
    setErroLote("");
    const { data, error } = await gerarLotePauta({
      semana_inicial: semanaInicial,
      contexto: contextoLote.trim() || undefined,
    });
    setGerandoLote(false);

    if (error || data?.error) {
      const mensagem = data?.error ?? "O motor não respondeu. Tenta de novo.";
      setErroLote(mensagem);
      toastErro(mensagem);
      return;
    }

    const qtd = data?.itens?.length ?? 0;
    await logAcaoAdmin("gerar_lote_pauta_social", undefined, { qtd, semana_inicial: semanaInicial });
    toastSucesso(`${qtd} ${qtd === 1 ? "item gerado" : "itens gerados"} de pauta.`);
    setContextoLote("");
    setMostrarFormLote(false);
    carregar();
  }

  if (carregando) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--surface)]" />
        <div className="h-40 animate-pulse rounded-xl bg-[var(--surface)]" />
      </div>
    );
  }

  const sugeridos = (itens ?? []).filter((i) => i.status === "sugerida");
  const produzidos = (itens ?? []).filter((i) => i.status === "produzida");
  const pautaVazia = (itens ?? []).length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-sans text-[13px] font-semibold text-[var(--ink)]">Pauta</p>
          <button
            type="button"
            onClick={() => setMostrarFormLote((atual) => !atual)}
            className="flex-none rounded-lg border border-[var(--line)] px-3 py-1.5 font-sans text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface)]"
          >
            {mostrarFormLote ? "Fechar" : "Gerar lote"}
          </button>
        </div>

        {mostrarFormLote && (
          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
                Semana inicial
              </label>
              <input
                type="date"
                value={semanaInicial}
                onChange={(e) => setSemanaInicial(e.target.value)}
                className="w-fit rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
                Contexto (opcional)
              </label>
              <textarea
                value={contextoLote}
                onChange={(e) => setContextoLote(e.target.value)}
                rows={2}
                placeholder="Ex.: focar em pilar P2 essa semana"
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)]"
              />
            </div>
            {erroLote && (
              <p className="font-sans text-[12px] text-[var(--danger)]">{erroLote}</p>
            )}
            <button
              type="button"
              onClick={gerarLote}
              disabled={gerandoLote}
              className="self-start rounded-lg bg-[var(--secondary)] px-3 py-1.5 font-sans text-[12px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {gerandoLote ? "Gerando…" : "Gerar lote"}
            </button>
          </div>
        )}
      </div>

      {pautaVazia && (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-[var(--line)] bg-white p-8">
          <p className="font-sans text-[14px] text-[var(--ink-soft)]">
            Sem pauta pra este lote ainda.
          </p>
        </div>
      )}

      {!pautaVazia && (
      <>
      <div>
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
          Sugerida ({sugeridos.length})
        </p>
        <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white">
          {sugeridos.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 border-b border-[var(--line)] p-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-[13px] text-[var(--ink)]">{item.gancho}</p>
                <p className="font-sans text-[11px] text-[var(--muted)]">
                  {new Date(`${item.dia}T00:00:00`).toLocaleDateString("pt-BR", {
                    weekday: "short",
                    day: "2-digit",
                    month: "2-digit",
                  })}
                  {" · "}
                  {TIPO_LABEL[item.formato] ?? item.formato}
                  {item.pilar ? ` · ${item.pilar}` : ""}
                  {" · CTA: "}
                  {item.cta}
                </p>
                {erroPorItem[item.id] && (
                  <p className="mt-1 font-sans text-[11px] text-[var(--danger)]">
                    {erroPorItem[item.id]}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => produzir(item)}
                disabled={produzindoId === item.id}
                className="flex-none rounded-lg bg-[var(--secondary)] px-3 py-1.5 font-sans text-[12px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {produzindoId === item.id ? "Produzindo…" : "Produzir"}
              </button>
            </div>
          ))}
          {sugeridos.length === 0 && (
            <p className="p-4 font-sans text-[13px] text-[var(--muted)]">
              Tudo desta pauta já foi produzido.
            </p>
          )}
        </div>
      </div>

      {produzidos.length > 0 && (
        <div>
          <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Já produzida ({produzidos.length}) — está na Fila
          </p>
          <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white">
            {produzidos.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 border-b border-[var(--line)] p-3 last:border-b-0"
              >
                <p className="min-w-0 flex-1 truncate font-sans text-[13px] text-[var(--ink-soft)]">
                  {item.gancho}
                </p>
                {item.post_id && (
                  <button
                    type="button"
                    onClick={() => onAbrirPost(item.post_id!)}
                    className="flex-none rounded-lg border border-[var(--line)] px-3 py-1.5 font-sans text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface)]"
                  >
                    Gerar arte →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
