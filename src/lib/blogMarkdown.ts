// Subconjunto pequeno de Markdown usado pelo editor do blog (Tiptap): parágrafo,
// negrito, itálico, H2, lista, citação, link, imagem e embed de vídeo (::video[url]).
// O parser inverso (Markdown -> doc) só precisa entender o que o serializer produz —
// esse Markdown nunca vem de fora, então não precisa cobrir CommonMark inteiro.

export type DocMark = { type: string; attrs?: Record<string, unknown> };

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
  marks?: DocMark[];
};

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com"]);

// Allowlist de protocolo pra link de texto — bloqueia javascript:/data:/vbscript:
// e qualquer outro protocolo que rode código ao clicar.
export function isSafeHref(href: string): boolean {
  if (!href) return false;
  if (href.startsWith("/") || href.startsWith("#")) return true;
  try {
    const url = new URL(href, "https://placeholder.invalid");
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}

// Escapa um valor pra uso seguro como VALOR DE ATRIBUTO HTML entre aspas duplas.
// isSafeHref valida só o protocolo do link; um href https válido ainda pode ter
// aspas/< no path e fechar o atributo, injetando markup (XSS). Escapar fecha isso.
export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function parseYoutubeOrVimeoEmbedUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  if (YOUTUBE_HOSTS.has(host)) {
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{6,}$/.test(v)) return `https://www.youtube.com/embed/${v}`;
    const pathMatch = url.pathname.match(/^\/(embed|shorts)\/([\w-]{6,})/);
    if (pathMatch) return `https://www.youtube.com/embed/${pathMatch[2]}`;
    return null;
  }
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "");
    return /^[\w-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") {
    const match = url.pathname.match(/^\/(?:video\/)?(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  }
  if (host === "player.vimeo.com") {
    const match = url.pathname.match(/^\/video\/(\d+)/);
    return match ? `https://player.vimeo.com/video/${match[1]}` : null;
  }
  return null;
}

// ───────── doc (Tiptap JSON) -> Markdown ─────────

function serializeInline(nodes: DocNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type !== "text") return "";
      let text = n.text ?? "";
      const marks = n.marks ?? [];
      const hasBold = marks.some((m) => m.type === "bold");
      const hasItalic = marks.some((m) => m.type === "italic");
      const link = marks.find((m) => m.type === "link");

      if (hasBold && hasItalic) text = `***${text}***`;
      else if (hasBold) text = `**${text}**`;
      else if (hasItalic) text = `*${text}*`;

      const href = link?.attrs?.href;
      if (typeof href === "string" && href && isSafeHref(href)) text = `[${text}](${href})`;
      return text;
    })
    .join("");
}

export function serializeDocToMarkdown(doc: DocNode): string {
  const blocks = (doc.content ?? []).map((node) => {
    switch (node.type) {
      case "heading":
        return `## ${serializeInline(node.content)}`;
      case "paragraph":
        return serializeInline(node.content);
      case "bulletList":
        return (node.content ?? [])
          .map((li) =>
            `- ${(li.content ?? []).map((p) => serializeInline(p.content)).join(" ")}`,
          )
          .join("\n");
      case "blockquote":
        return (node.content ?? []).map((p) => `> ${serializeInline(p.content)}`).join("\n");
      case "image":
        return `![${node.attrs?.alt ?? ""}](${node.attrs?.src ?? ""})`;
      case "videoEmbed":
        return `::video[${node.attrs?.url ?? ""}]`;
      default:
        return "";
    }
  });
  return blocks.filter((b) => b !== "").join("\n\n");
}

// ───────── Markdown -> doc (Tiptap JSON) ─────────

const INLINE_PATTERN = /\[([^\]]+)\]\(([^)]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*/;

function parseInline(text: string, marks: DocMark[] = [], depth = 0): DocNode[] {
  if (!text) return [];
  // Teto de profundidade: o parser é recursivo e reprocessa before/after a cada match.
  // Um parágrafo patológico (muita marcação desbalanceada) explodiria em tempo/stack e
  // travaria a aba. Acima do teto, devolve o resto como texto puro — sem quebrar.
  if (depth > 200) {
    return [{ type: "text", text, ...(marks.length ? { marks } : {}) }];
  }
  const match = text.match(INLINE_PATTERN);
  if (!match || match.index === undefined) {
    return [{ type: "text", text, ...(marks.length ? { marks } : {}) }];
  }

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);

  let inner: string;
  let extraMarks: DocMark[];
  if (match[1] !== undefined) {
    inner = match[1];
    extraMarks = isSafeHref(match[2]) ? [{ type: "link", attrs: { href: match[2] } }] : [];
  } else if (match[3] !== undefined) {
    inner = match[3];
    extraMarks = [{ type: "bold" }, { type: "italic" }];
  } else if (match[4] !== undefined) {
    inner = match[4];
    extraMarks = [{ type: "bold" }];
  } else {
    inner = match[5] ?? "";
    extraMarks = [{ type: "italic" }];
  }

  return [
    ...parseInline(before, marks, depth + 1),
    ...parseInline(inner, [...marks, ...extraMarks], depth + 1),
    ...parseInline(after, marks, depth + 1),
  ];
}

function isSpecialLine(line: string): boolean {
  return (
    line.startsWith("## ") ||
    line.startsWith("- ") ||
    line.startsWith("> ") ||
    /^!\[[^\]]*\]\([^)]+\)$/.test(line) ||
    /^::video\[[^\]]+\]$/.test(line)
  );
}

export function parseMarkdownToDoc(markdown: string): DocNode {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const content: DocNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      content.push({ type: "heading", attrs: { level: 2 }, content: parseInline(line.slice(3)) });
      i++;
      continue;
    }

    const imgMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      content.push({ type: "image", attrs: { alt: imgMatch[1] || null, src: imgMatch[2] } });
      i++;
      continue;
    }

    const videoMatch = line.match(/^::video\[([^\]]+)\]$/);
    if (videoMatch) {
      content.push({ type: "videoEmbed", attrs: { url: videoMatch[1] } });
      i++;
      continue;
    }

    if (line.startsWith("- ")) {
      const items: DocNode[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(lines[i].slice(2)) }],
        });
        i++;
      }
      content.push({ type: "bulletList", content: items });
      continue;
    }

    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      content.push({
        type: "blockquote",
        content: [{ type: "paragraph", content: parseInline(quoteLines.join(" ")) }],
      });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !isSpecialLine(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    content.push({ type: "paragraph", content: parseInline(paraLines.join(" ")) });
  }

  return { type: "doc", content: content.length ? content : [{ type: "paragraph", content: [] }] };
}
