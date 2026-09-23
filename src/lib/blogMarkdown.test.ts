import { describe, it, expect } from "vitest";
import {
  isSafeHref,
  parseYoutubeOrVimeoEmbedUrl,
  serializeDocToMarkdown,
  parseMarkdownToDoc,
  type DocNode,
} from "./blogMarkdown";

describe("isSafeHref", () => {
  it("aceita link relativo (começa com /)", () => {
    expect(isSafeHref("/sobre")).toBe(true);
  });

  it("aceita âncora interna (começa com #)", () => {
    expect(isSafeHref("#secao-2")).toBe(true);
  });

  it("aceita http, https e mailto", () => {
    expect(isSafeHref("http://exemplo.com")).toBe(true);
    expect(isSafeHref("https://exemplo.com")).toBe(true);
    expect(isSafeHref("mailto:oi@exemplo.com")).toBe(true);
  });

  it("rejeita protocolo javascript: (vetor clássico de XSS)", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
  });

  it("rejeita protocolo data: (pode embutir HTML/script)", () => {
    expect(isSafeHref("data:text/html,<script>alert(1)</script>")).toBe(false);
  });

  it("rejeita protocolo vbscript:", () => {
    expect(isSafeHref("vbscript:msgbox(1)")).toBe(false);
  });

  it("rejeita string vazia", () => {
    expect(isSafeHref("")).toBe(false);
  });

  it("rejeita URL malformada", () => {
    expect(isSafeHref("http://[::1")).toBe(false);
  });
});

describe("parseYoutubeOrVimeoEmbedUrl", () => {
  it("converte URL padrão do YouTube (?v=) pro formato embed", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converte link curto youtu.be pro formato embed", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converte URL /shorts/ pro formato embed", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("aceita URL do YouTube já no formato /embed/", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("aceita host m.youtube.com", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    );
  });

  it("converte URL padrão do Vimeo pro formato player", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://vimeo.com/76979871")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });

  it("aceita URL do Vimeo já no formato player.vimeo.com", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://player.vimeo.com/video/76979871")).toBe(
      "https://player.vimeo.com/video/76979871",
    );
  });

  it("retorna null pra provedor fora do allowlist (ex.: Dailymotion)", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://www.dailymotion.com/video/x7u5s0k")).toBeNull();
  });

  it("retorna null pra ID do YouTube inválido (curto demais)", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://youtu.be/abc")).toBeNull();
  });

  it("retorna null pra URL malformada", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("não é uma url")).toBeNull();
  });

  it("retorna null pra vídeo do YouTube sem parâmetro v e sem path especial", () => {
    expect(parseYoutubeOrVimeoEmbedUrl("https://www.youtube.com/watch")).toBeNull();
  });
});

describe("serializeDocToMarkdown", () => {
  it("serializa parágrafo simples", () => {
    const doc: DocNode = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Olá mundo" }] }],
    };
    expect(serializeDocToMarkdown(doc)).toBe("Olá mundo");
  });

  it("serializa heading como H2", () => {
    const doc: DocNode = {
      type: "doc",
      content: [{ type: "heading", content: [{ type: "text", text: "Título" }] }],
    };
    expect(serializeDocToMarkdown(doc)).toBe("## Título");
  });

  it("serializa negrito, itálico e negrito+itálico combinados", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "negrito", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
            { type: "text", text: "itálico", marks: [{ type: "italic" }] },
            { type: "text", text: " " },
            { type: "text", text: "ambos", marks: [{ type: "bold" }, { type: "italic" }] },
          ],
        },
      ],
    };
    expect(serializeDocToMarkdown(doc)).toBe("**negrito** *itálico* ***ambos***");
  });

  it("serializa link seguro com colchetes/parênteses", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "clique aqui",
              marks: [{ type: "link", attrs: { href: "https://exemplo.com" } }],
            },
          ],
        },
      ],
    };
    expect(serializeDocToMarkdown(doc)).toBe("[clique aqui](https://exemplo.com)");
  });

  it("NÃO serializa link com href perigoso (javascript:) — texto sai puro, sem link", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "clique aqui",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    expect(serializeDocToMarkdown(doc)).toBe("clique aqui");
  });

  it("serializa lista com marcador -", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "item 1" }] }],
            },
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "item 2" }] }],
            },
          ],
        },
      ],
    };
    expect(serializeDocToMarkdown(doc)).toBe("- item 1\n- item 2");
  });

  it("serializa citação com >", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: "text", text: "sabedoria" }] }],
        },
      ],
    };
    expect(serializeDocToMarkdown(doc)).toBe("> sabedoria");
  });

  it("serializa imagem com alt e src", () => {
    const doc: DocNode = {
      type: "doc",
      content: [{ type: "image", attrs: { alt: "capa", src: "https://exemplo.com/capa.jpg" } }],
    };
    expect(serializeDocToMarkdown(doc)).toBe("![capa](https://exemplo.com/capa.jpg)");
  });

  it("serializa embed de vídeo com o shortcode ::video[]", () => {
    const doc: DocNode = {
      type: "doc",
      content: [{ type: "videoEmbed", attrs: { url: "https://youtu.be/abc123xyz" } }],
    };
    expect(serializeDocToMarkdown(doc)).toBe("::video[https://youtu.be/abc123xyz]");
  });

  it("junta múltiplos blocos com linha em branco entre eles", () => {
    const doc: DocNode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "primeiro" }] },
        { type: "paragraph", content: [{ type: "text", text: "segundo" }] },
      ],
    };
    expect(serializeDocToMarkdown(doc)).toBe("primeiro\n\nsegundo");
  });

  it("ignora tipo de nó desconhecido (não quebra, produz string vazia pro bloco)", () => {
    const doc: DocNode = { type: "doc", content: [{ type: "tipoInventado" }] };
    expect(serializeDocToMarkdown(doc)).toBe("");
  });

  it("retorna string vazia pra doc sem content", () => {
    expect(serializeDocToMarkdown({ type: "doc" })).toBe("");
  });
});

describe("parseMarkdownToDoc", () => {
  it("parseia parágrafo simples", () => {
    const doc = parseMarkdownToDoc("Olá mundo");
    expect(doc.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Olá mundo" }] },
    ]);
  });

  it("parseia heading H2", () => {
    const doc = parseMarkdownToDoc("## Título");
    expect(doc.content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });
  });

  it("parseia negrito, itálico e link de volta pra marks", () => {
    const doc = parseMarkdownToDoc("**forte** e [link](https://exemplo.com)");
    const texto = doc.content?.[0];
    expect(texto?.type).toBe("paragraph");
    const marksDoTrecho = texto?.content?.flatMap((n) => n.marks ?? []);
    expect(marksDoTrecho).toContainEqual({ type: "bold" });
    expect(marksDoTrecho).toContainEqual({ type: "link", attrs: { href: "https://exemplo.com" } });
  });

  it("NÃO cria mark de link para href perigoso — vira texto puro", () => {
    const doc = parseMarkdownToDoc("[clique](javascript:alert(1))");
    const marks = doc.content?.[0].content?.flatMap((n) => n.marks ?? []);
    expect(marks?.some((m) => m.type === "link")).toBe(false);
  });

  it("parseia lista de itens (linhas consecutivas com '- ')", () => {
    const doc = parseMarkdownToDoc("- item 1\n- item 2");
    expect(doc.content?.[0].type).toBe("bulletList");
    expect(doc.content?.[0].content).toHaveLength(2);
  });

  it("parseia citação (linhas consecutivas com '> ')", () => {
    const doc = parseMarkdownToDoc("> linha 1\n> linha 2");
    expect(doc.content?.[0].type).toBe("blockquote");
  });

  it("parseia imagem standalone", () => {
    const doc = parseMarkdownToDoc("![capa](https://exemplo.com/capa.jpg)");
    expect(doc.content?.[0]).toEqual({
      type: "image",
      attrs: { alt: "capa", src: "https://exemplo.com/capa.jpg" },
    });
  });

  it("parseia embed de vídeo standalone", () => {
    const doc = parseMarkdownToDoc("::video[https://youtu.be/abc123xyz]");
    expect(doc.content?.[0]).toEqual({
      type: "videoEmbed",
      attrs: { url: "https://youtu.be/abc123xyz" },
    });
  });

  it("ignora linhas em branco entre blocos", () => {
    const doc = parseMarkdownToDoc("primeiro\n\nsegundo");
    expect(doc.content).toHaveLength(2);
  });

  it("normaliza quebra de linha CRLF antes de parsear", () => {
    const doc = parseMarkdownToDoc("primeiro\r\n\r\nsegundo");
    expect(doc.content).toHaveLength(2);
  });

  it("markdown vazio produz um parágrafo vazio (nunca content: [])", () => {
    const doc = parseMarkdownToDoc("");
    expect(doc).toEqual({ type: "doc", content: [{ type: "paragraph", content: [] }] });
  });

  it("não trava (teto de profundidade) com marcação desbalanceada e repetitiva", () => {
    const patologico = "*a".repeat(500);
    expect(() => parseMarkdownToDoc(patologico)).not.toThrow();
  });

  it("round-trip: serializar e reparsear um doc simples preserva a estrutura", () => {
    const original: DocNode = {
      type: "doc",
      content: [
        { type: "heading", content: [{ type: "text", text: "Título" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "normal " },
            { type: "text", text: "negrito", marks: [{ type: "bold" }] },
          ],
        },
      ],
    };
    const md = serializeDocToMarkdown(original);
    const reparsed = parseMarkdownToDoc(md);
    expect(reparsed.content?.[0].type).toBe("heading");
    expect(reparsed.content?.[1].type).toBe("paragraph");
  });
});
