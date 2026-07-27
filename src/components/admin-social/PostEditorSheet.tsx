import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TOKEN_BRIDGE_V3 } from "@/lib/uiTokenBridge";
import type { SocialPost } from "@/lib/social.functions";
import {
  editarCaptionEAlt,
  marcarRevisado,
  devolverParaRascunho,
  aprovarPost,
  agendarPost,
  reagendarPost,
  cancelarAgendamento,
  tentarDeNovo,
  excluirPost,
} from "@/lib/social.functions";
import { toastErro, toastSucesso } from "@/lib/toast";
import { logAcaoAdmin } from "@/lib/audit-log";

interface PostEditorSheetProps {
  post: SocialPost | null;
  onClose: () => void;
  onChanged: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  revisado: "Revisado",
  aprovado: "Aprovado",
  agendado: "Agendado",
  publicando: "Publicando",
  publicado: "Publicado",
  falhou: "Falhou",
  cancelado: "Cancelado",
};

const DOIS_MINUTOS_MS = 2 * 60 * 1000;

function paraInputData(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}
function paraInputHora(iso: string | null): string {
  if (!iso) return "12:00";
  return new Date(iso).toTimeString().slice(0, 5);
}
function combinarDataHora(data: string, hora: string): string {
  return new Date(`${data}T${hora}:00`).toISOString();
}

export function PostEditorSheet({ post, onClose, onChanged }: PostEditorSheetProps) {
  const [caption, setCaption] = useState("");
  const [altText, setAltText] = useState<string[]>([]);
  const [data, setData] = useState("");
  const [hora, setHora] = useState("12:00");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!post) return;
    setCaption(post.caption);
    setAltText(post.alt_text ?? []);
    setData(paraInputData(post.scheduled_at));
    setHora(paraInputHora(post.scheduled_at));
    setErro(null);
  }, [post]);

  if (!post) {
    return <Sheet open={false} onOpenChange={() => {}} />;
  }

  const imutavel = post.status === "publicado" || post.status === "publicando";
  const podeCancelar =
    post.status === "agendado" &&
    post.scheduled_at !== null &&
    new Date(post.scheduled_at).getTime() - Date.now() > DOIS_MINUTOS_MS;

  async function comLoading(
    fn: () => Promise<{ error: unknown } | void>,
    sucesso: string,
    acao: string,
  ) {
    setOcupado(true);
    setErro(null);
    const resultado = await fn();
    setOcupado(false);
    if (resultado && "error" in resultado && resultado.error) {
      toastErro("Não deu pra salvar. Tenta de novo.");
      return;
    }
    await logAcaoAdmin(acao, post!.id);
    toastSucesso(sucesso);
    onChanged();
  }

  async function handleSalvarTexto() {
    setOcupado(true);
    const resultado = await editarCaptionEAlt(post!, caption, altText);
    setOcupado(false);
    if (!resultado.ok) {
      if (typeof resultado.erro === "string") {
        setErro(resultado.erro);
      } else if (resultado.erro) {
        setErro(
          `Reprovado no lint: contém ${resultado.erro.termo}. Trecho: "${resultado.erro.trecho}"`,
        );
      }
      return;
    }
    toastSucesso("Legenda salva.");
    onChanged();
  }

  async function handleAgendar() {
    if (altText.some((a) => a.trim().length === 0)) {
      setErro("Falta o texto alternativo de alguma mídia antes de agendar.");
      return;
    }
    await comLoading(
      () => agendarPost(post!.id, combinarDataHora(data, hora)),
      "Post agendado.",
      "agendar_post_social",
    );
  }

  return (
    <Sheet open={!!post} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        className="polia-v3 flex w-full flex-col gap-5 overflow-y-auto border-l border-[var(--line)] bg-white p-6 sm:max-w-lg"
        style={TOKEN_BRIDGE_V3}
      >
        <SheetHeader>
          <div className="flex items-center gap-2">
            <SheetTitle className="font-cabinet text-[22px] text-[var(--ink)]">
              Editar post
            </SheetTitle>
            <span className="rounded-full border border-[var(--line-strong,var(--line))] bg-[var(--surface)] px-2.5 py-0.5 font-sans text-[11px] font-semibold uppercase tracking-[1px] text-[var(--ink-soft)]">
              {STATUS_LABEL[post.status] ?? post.status}
            </span>
          </div>
        </SheetHeader>

        <div className="flex gap-2 overflow-x-auto">
          {post.midias.map((url, i) => (
            <div
              key={url}
              className="aspect-[4/5] w-24 flex-none overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]"
            >
              {post.tipo === "story" && url.endsWith(".mp4") ? (
                <video src={url} className="h-full w-full object-cover" muted />
              ) : (
                <img
                  src={url}
                  alt={post.alt_text?.[i] ?? ""}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Legenda
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={imutavel}
            rows={5}
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--secondary)] disabled:bg-[var(--surface)] disabled:text-[var(--ink-soft)]"
          />
          <p className="text-right font-sans text-[11px] text-[var(--muted)]">
            {caption.length} / 2200
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
            Texto alternativo
          </label>
          {(post.midias ?? []).map((_, i) => (
            <input
              key={i}
              type="text"
              value={altText[i] ?? ""}
              disabled={imutavel}
              onChange={(e) =>
                setAltText((atual) => atual.map((v, idx) => (idx === i ? e.target.value : v)))
              }
              placeholder={`Descrição da mídia ${i + 1}`}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--secondary)] disabled:bg-[var(--surface)]"
            />
          ))}
        </div>

        {!imutavel && (
          <button
            type="button"
            onClick={handleSalvarTexto}
            disabled={ocupado}
            className="self-start rounded-lg border border-[var(--line)] px-3 py-1.5 font-sans text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            Salvar texto
          </button>
        )}

        {(post.status === "aprovado" || post.status === "agendado") && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
                Data
              </label>
              <input
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)]"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
                Horário (Brasília)
              </label>
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)]"
              />
            </div>
          </div>
        )}

        {post.status === "falhou" && post.erro && (
          <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 font-sans text-[12px] text-[var(--danger)]">
            {post.erro}
          </p>
        )}

        {post.status === "publicado" && post.permalink && (
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="font-sans text-[13px] text-[var(--secondary-text)] hover:underline"
          >
            Ver no Instagram →
          </a>
        )}

        {erro && (
          <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-3 font-sans text-[12px] text-[var(--danger)]">
            {erro}
          </p>
        )}

        <div className="mt-auto flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4">
          {post.status === "rascunho" && (
            <>
              <button
                type="button"
                onClick={() =>
                  comLoading(
                    () => excluirPost(post.id).then(() => onClose()),
                    "Post excluído.",
                    "excluir_post_social",
                  )
                }
                disabled={ocupado}
                className="rounded-xl border border-[var(--line)] px-4 py-2 font-sans text-[13px] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
              >
                Excluir
              </button>
              <button
                type="button"
                onClick={() =>
                  comLoading(
                    () => marcarRevisado(post.id),
                    "Marcado como revisado.",
                    "marcar_revisado_social",
                  )
                }
                disabled={ocupado}
                className="rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] hover:opacity-90 disabled:opacity-50"
              >
                Marcar revisado
              </button>
            </>
          )}

          {post.status === "revisado" && (
            <>
              <button
                type="button"
                onClick={() =>
                  comLoading(
                    () => devolverParaRascunho(post.id),
                    "Devolvido pra rascunho.",
                    "devolver_rascunho_social",
                  )
                }
                disabled={ocupado}
                className="rounded-xl border border-[var(--line)] px-4 py-2 font-sans text-[13px] text-[var(--ink-soft)] hover:bg-[var(--surface)]"
              >
                Devolver
              </button>
              <button
                type="button"
                onClick={() =>
                  comLoading(() => aprovarPost(post.id), "Post aprovado.", "aprovar_post_social")
                }
                disabled={ocupado}
                className="rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] hover:opacity-90 disabled:opacity-50"
              >
                Aprovar
              </button>
            </>
          )}

          {post.status === "aprovado" && (
            <button
              type="button"
              onClick={handleAgendar}
              disabled={ocupado}
              className="rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] hover:opacity-90 disabled:opacity-50"
            >
              Agendar
            </button>
          )}

          {post.status === "agendado" && (
            <>
              {podeCancelar && (
                <button
                  type="button"
                  onClick={() =>
                    comLoading(
                      () => cancelarAgendamento(post.id),
                      "Agendamento cancelado.",
                      "cancelar_agendamento_social",
                    )
                  }
                  disabled={ocupado}
                  className="rounded-xl border border-[var(--line)] px-4 py-2 font-sans text-[13px] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  Cancelar
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  comLoading(
                    () => reagendarPost(post.id, combinarDataHora(data, hora)),
                    "Reagendado.",
                    "reagendar_post_social",
                  )
                }
                disabled={ocupado}
                className="rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] hover:opacity-90 disabled:opacity-50"
              >
                Reagendar
              </button>
            </>
          )}

          {post.status === "falhou" && (
            <button
              type="button"
              onClick={() =>
                comLoading(() => tentarDeNovo(post.id), "Reenviado pra fila.", "retry_post_social")
              }
              disabled={ocupado}
              className="rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] hover:opacity-90 disabled:opacity-50"
            >
              Tentar de novo
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
