// Node customizado do Tiptap para embed de vídeo (YouTube/Vimeo).
// Ponte com o Markdown do blog: o JSON produzido aqui (`{ type: "videoEmbed",
// attrs: { url } }`) precisa bater exatamente com o `case "videoEmbed"` de
// serializeDocToMarkdown em src/lib/blogMarkdown.ts, que gera `::video[url]`.
import { createElement } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer, type ReactNodeViewProps } from "@tiptap/react";
import { parseYoutubeOrVimeoEmbedUrl } from "@/lib/blogMarkdown";

export type VideoEmbedOptions = Record<string, never>;

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoEmbed: {
      /** Insere um node de embed de vídeo (YouTube/Vimeo) na posição atual. */
      setVideoEmbed: (attrs: { url: string }) => ReturnType;
    };
  }
}

function VideoEmbedView({ node }: ReactNodeViewProps) {
  const url = typeof node.attrs.url === "string" ? node.attrs.url : "";
  const embedSrc = parseYoutubeOrVimeoEmbedUrl(url);

  const content = embedSrc
    ? createElement(
        "div",
        {
          className:
            "relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--ink)]",
        },
        createElement("iframe", {
          src: embedSrc,
          loading: "lazy",
          allowFullScreen: true,
          className: "absolute inset-0 h-full w-full",
          title: "Vídeo incorporado",
        }),
      )
    : createElement(
        "div",
        {
          className:
            "rounded-lg border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-3 text-[13px] text-[var(--muted)]",
        },
        "Link de vídeo inválido",
      );

  return createElement(
    NodeViewWrapper,
    { className: "polia-video-embed-node", "data-drag-handle": true },
    content,
  );
}

export const VideoEmbedExtension = Node.create<VideoEmbedOptions>({
  name: "videoEmbed",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      url: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-url") ?? "",
        renderHTML: (attrs) => ({ "data-url": attrs.url }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-video-embed]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-video-embed": "" })];
  },

  addCommands() {
    return {
      setVideoEmbed:
        (attrs: { url: string }) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedView);
  },
});

export default VideoEmbedExtension;
