import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TOKEN_BRIDGE_V3 } from "@/lib/uiTokenBridge";
import {
  criarPostManual,
  validarQuantidadeETipo,
  validarProporcao,
  type SocialTipoManual,
} from "@/lib/social.functions";
import { toastSucesso } from "@/lib/toast";
import { logAcaoAdmin } from "@/lib/audit-log";

interface CriarPostManualSheetProps {
  aberto: boolean;
  onClose: () => void;
  onCriado: () => void;
}

const TIPOS: Array<{ valor: SocialTipoManual; label: string; hint: string }> = [
  { valor: "carrossel", label: "Carrossel", hint: "4:5, 2 a 10 imagens" },
  { valor: "story", label: "Story", hint: "9:16, imagem ou vídeo" },
  { valor: "feed", label: "Foto única", hint: "4:5, legenda longa" },
];

const PILARES = ["P1", "P2", "P3", "P4", "P5"] as const;

export function CriarPostManualSheet({ aberto, onClose, onCriado }: CriarPostManualSheetProps) {
  const [tipo, setTipo] = useState<SocialTipoManual>("carrossel");
  const [pilar, setPilar] = useState<string | null>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [caption, setCaption] = useState("");
  const [altText, setAltText] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function limparEFechar() {
    setTipo("carrossel");
    setPilar(null);
    setArquivos([]);
    setCaption("");
    setAltText([]);
    setErro(null);
    onClose();
  }

  function handleArquivos(lista: FileList | null) {
    if (!lista) return;
    const novos = Array.from(lista);
    setArquivos(novos);
    setAltText((atual) => novos.map((_, i) => atual[i] ?? ""));
    setErro(null);
  }

  async function handleSalvar() {
    const erroSincrono = validarQuantidadeETipo(tipo, arquivos);
    if (erroSincrono) {
      setErro(erroSincrono);
      return;
    }
    setSalvando(true);
    const erroProporcao = await validarProporcao(tipo, arquivos);
    if (erroProporcao) {
      setErro(erroProporcao);
      setSalvando(false);
      return;
    }

    const resultado = await criarPostManual({ tipo, pilar, caption, altText, arquivos });
    setSalvando(false);

    if (!resultado.ok) {
      if (typeof resultado.erro === "string") {
        setErro(resultado.erro);
      } else {
        setErro(
          `Reprovado no lint: contém ${resultado.erro.termo}. Trecho: "${resultado.erro.trecho}"`,
        );
      }
      return;
    }

    await logAcaoAdmin("criar_post_social_manual", resultado.id, { tipo });
    toastSucesso("Post criado como rascunho.");
    onCriado();
    limparEFechar();
  }

  return (
    <Sheet open={aberto} onOpenChange={(o) => !o && limparEFechar()}>
      <SheetContent
        className="polia-v3 flex w-full flex-col gap-5 overflow-y-auto border-l border-[var(--line)] bg-white p-6 sm:max-w-lg"
        style={TOKEN_BRIDGE_V3}
      >
        <SheetHeader>
          <SheetTitle className="font-cabinet text-[22px] text-[var(--ink)]">
            Criar manualmente
          </SheetTitle>
        </SheetHeader>

        <div className="flex gap-2">
          {TIPOS.map((t) => (
            <button
              key={t.valor}
              type="button"
              onClick={() => setTipo(t.valor)}
              className={`flex flex-1 flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-left font-sans text-[13px] font-semibold transition-colors ${
                tipo === t.valor
                  ? "border-[var(--secondary-text)] bg-[var(--secondary-light)]/40 text-[var(--ink)]"
                  : "border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--surface)]"
              }`}
            >
              {t.label}
              <span className="font-normal text-[11px] text-[var(--muted)]">{t.hint}</span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Mídia (
            {tipo === "feed"
              ? "1 imagem"
              : tipo === "carrossel"
                ? "2 a 10 imagens"
                : "imagem ou vídeo"}
            )
          </label>
          <input
            type="file"
            multiple={tipo !== "feed"}
            accept={
              tipo === "story"
                ? "image/jpeg,image/png,image/webp,video/mp4"
                : "image/jpeg,image/png,image/webp"
            }
            onChange={(e) => handleArquivos(e.target.files)}
            className="font-sans text-[13px] text-[var(--ink-soft)] file:mr-3 file:rounded-lg file:border file:border-[var(--line)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:font-sans file:text-[12px] file:text-[var(--ink)]"
          />
          {arquivos.length > 0 && (
            <p className="font-sans text-[12px] text-[var(--muted)]">
              {arquivos.length} arquivo(s) selecionado(s)
            </p>
          )}
        </div>

        {arquivos.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              Texto alternativo (1 por mídia)
            </label>
            {arquivos.map((arquivo, i) => (
              <input
                key={`${arquivo.name}-${i}`}
                type="text"
                value={altText[i] ?? ""}
                onChange={(e) =>
                  setAltText((atual) => atual.map((v, idx) => (idx === i ? e.target.value : v)))
                }
                placeholder={`Descrição da mídia ${i + 1}`}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--secondary)]"
              />
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Legenda
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={5}
            placeholder="Escreve aqui. Não gera sozinha."
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--secondary)]"
          />
          <p className="text-right font-sans text-[11px] text-[var(--muted)]">
            {caption.length} / 2200
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Pilar (opcional)
          </label>
          <div className="flex gap-2">
            {PILARES.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPilar(pilar === p ? null : p)}
                className={`rounded-full border px-3 py-1 font-sans text-[12px] ${
                  pilar === p
                    ? "border-[var(--ink)] bg-[var(--accent)]/30 font-semibold text-[var(--ink)]"
                    : "border-[var(--line)] text-[var(--ink-soft)]"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {erro && (
          <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 font-sans text-[12px] text-[var(--danger)]">
            {erro}
          </p>
        )}

        <div className="mt-2 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
          <button
            type="button"
            onClick={limparEFechar}
            className="rounded-xl border border-[var(--line)] px-4 py-2 font-sans text-[13px] text-[var(--ink-soft)] hover:bg-[var(--surface)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando || arquivos.length === 0}
            className="rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar como rascunho"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
