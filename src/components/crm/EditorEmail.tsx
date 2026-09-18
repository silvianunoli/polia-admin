import { useEffect } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Bold, Italic, Heading2, List, ListOrdered, Quote, Link as LinkIcon } from "lucide-react";

// Editor do corpo da campanha. Diferente do TiptapEditor do blog: aqui a saída
// é HTML direto (getHTML), porque é isso que o Resend manda. Sem imagem e sem
// vídeo de propósito — imagem hospedada quebra em cliente de e-mail que
// bloqueia externo, e vídeo não roda em e-mail nenhum.

function Botao(props: {
  label: string;
  ativo?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.ativo}
      onClick={props.onClick}
      className={`rounded-lg px-2.5 py-1.5 transition-colors ${
        props.ativo
          ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
          : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
      }`}
    >
      {props.children}
    </button>
  );
}

export function EditorEmail({
  html,
  onChange,
}: {
  html: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: "Escreva o e-mail aqui." }),
    ],
    content: html || "",
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    editorProps: {
      attributes: {
        class:
          "prose-none min-h-[280px] px-5 py-4 font-sans text-[15px] leading-relaxed text-[var(--ink)] focus:outline-none",
      },
    },
  });

  // Troca de campanha sem desmontar o componente: sincroniza o conteúdo sem
  // roubar o cursor de quem está digitando.
  useEffect(() => {
    if (!editor) return;
    if (html !== editor.getHTML()) editor.commands.setContent(html || "", { emitUpdate: false });
  }, [html, editor]);

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-[var(--line)] px-2 py-1.5">
        <Botao
          label="Negrito"
          ativo={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={15} />
        </Botao>
        <Botao
          label="Itálico"
          ativo={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={15} />
        </Botao>
        <Botao
          label="Subtítulo"
          ativo={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={15} />
        </Botao>
        <Botao
          label="Lista"
          ativo={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={15} />
        </Botao>
        <Botao
          label="Lista numerada"
          ativo={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={15} />
        </Botao>
        <Botao
          label="Citação"
          ativo={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={15} />
        </Botao>
        <Botao
          label="Link"
          ativo={editor.isActive("link")}
          onClick={() => {
            if (editor.isActive("link")) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            const url = window.prompt("Endereço do link");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          <LinkIcon size={15} />
        </Botao>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
