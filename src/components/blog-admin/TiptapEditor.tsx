import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Heading2,
  List,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Video,
} from "lucide-react";
import { VideoEmbedExtension } from "./VideoEmbedExtension";
import { parseYoutubeOrVimeoEmbedUrl, type DocNode } from "@/lib/blogMarkdown";

export type TiptapEditorProps = {
  /** Doc inicial, no formato produzido por parseMarkdownToDoc. */
  content: DocNode;
  /** Chamado a cada mudança do conteúdo, com editor.getJSON() já tipado como DocNode. */
  onChange: (doc: DocNode) => void;
  /** Avisa que o botão de imagem da toolbar foi clicado. Quem decide como fazer upload é o pai. */
  onRequestImageUpload: () => void;
};

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg border text-[var(--ink-soft)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--secondary)] disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-[var(--secondary)] bg-[var(--secondary-light)] text-[var(--secondary-ink)]"
          : "border-[var(--line)] bg-white hover:border-[var(--secondary)] hover:text-[var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div aria-hidden="true" className="mx-1 h-6 w-px bg-[var(--line)]" />;
}

export function TiptapEditor({ content, onChange, onRequestImageUpload }: TiptapEditorProps) {
  const [videoFieldOpen, setVideoFieldOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoErro, setVideoErro] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        codeBlock: false,
        horizontalRule: false,
        orderedList: false,
        link: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: { rel: "noopener noreferrer nofollow" },
      }),
      Image,
      Placeholder.configure({ placeholder: "Escreva o post aqui..." }),
      VideoEmbedExtension,
    ],
    content: content as never,
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getJSON() as DocNode);
    },
  });

  // Recarrega o conteúdo quando o post inicial muda (ex.: chegou da rede após o primeiro render).
  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) {
      editor.commands.setContent(content as never, { emitUpdate: false });
    }
  }, [editor, content]);

  if (!editor) {
    return (
      <div className="rounded-xl border border-[var(--line)] bg-white p-6">
        <div className="h-40 animate-pulse rounded-lg bg-[var(--bg)]" />
      </div>
    );
  }

  // Referência local não-nula (o guard acima já garante que o editor existe).
  // TS não faz narrowing de `editor` dentro de funções aninhadas por closure,
  // então as funções abaixo usam esta constante já estreitada para o tipo Editor.
  const activeEditor = editor;

  function toggleVideoField() {
    setVideoFieldOpen((open) => !open);
    setVideoErro(null);
    setVideoUrl("");
  }

  /**
   * Valida a URL contra o allowlist de YouTube/Vimeo e insere o node
   * videoEmbed no editor. Não insere nada se a URL não bater no allowlist.
   */
  function onInsertVideo(url: string): { ok: boolean; erro?: string } {
    const embedSrc = parseYoutubeOrVimeoEmbedUrl(url);
    if (!embedSrc) {
      return { ok: false, erro: "Cola um link do YouTube ou do Vimeo." };
    }
    activeEditor.chain().focus().setVideoEmbed({ url }).run();
    return { ok: true };
  }

  function confirmarVideo() {
    const resultado = onInsertVideo(videoUrl.trim());
    if (!resultado.ok) {
      setVideoErro(resultado.erro ?? "Cola um link do YouTube ou do Vimeo.");
      return;
    }
    setVideoFieldOpen(false);
    setVideoUrl("");
    setVideoErro(null);
  }

  function handleSetLink() {
    const hrefAtual = activeEditor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link", hrefAtual ?? "https://");
    if (url === null) return;
    if (url === "") {
      activeEditor.chain().focus().unsetLink().run();
      return;
    }
    activeEditor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="polia-v3 rounded-xl border border-[var(--line)] bg-white">
      <div
        role="toolbar"
        aria-label="Formatação do texto"
        className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-3 py-2"
      >
        <ToolbarButton
          label="Negrito"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Itálico"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton
          label="Título"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Lista"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton
          label="Citação"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Link" active={editor.isActive("link")} onClick={handleSetLink}>
          <LinkIcon size={16} aria-hidden="true" />
        </ToolbarButton>

        <ToolbarSeparator />

        <ToolbarButton label="Inserir imagem" onClick={onRequestImageUpload}>
          <ImageIcon size={16} aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton label="Inserir vídeo" active={videoFieldOpen} onClick={toggleVideoField}>
          <Video size={16} aria-hidden="true" />
        </ToolbarButton>
      </div>

      {videoFieldOpen && (
        <div className="flex flex-wrap items-start gap-2 border-b border-[var(--line)] bg-[var(--bg)] px-3 py-3">
          <div className="flex min-w-[240px] flex-1 flex-col gap-1">
            <input
              type="url"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value);
                if (videoErro) setVideoErro(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  confirmarVideo();
                }
              }}
              placeholder="Cola o link do YouTube ou do Vimeo"
              aria-label="Link do vídeo"
              aria-invalid={videoErro ? true : undefined}
              className={`w-full rounded-lg border bg-white px-3 py-2 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)] ${
                videoErro ? "border-[var(--danger)]" : "border-[var(--line)]"
              }`}
            />
            {videoErro && <p className="text-[13px] text-[var(--danger)]">{videoErro}</p>}
          </div>
          <button
            type="button"
            onClick={confirmarVideo}
            className="rounded-lg bg-[var(--secondary)] px-4 py-2 text-[14px] font-semibold text-[var(--secondary-ink)] transition-[filter] hover:brightness-95"
          >
            Inserir
          </button>
        </div>
      )}

      <EditorContent
        editor={editor}
        className="prose prose-lg max-w-none px-5 py-4 text-[var(--ink)] focus:outline-none [&_.ProseMirror]:min-h-[280px] [&_.ProseMirror]:outline-none [&_.ProseMirror_h2]:font-fraunces [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-[var(--muted)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
      />
    </div>
  );
}

export default TiptapEditor;
