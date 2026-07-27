import { marked, Renderer } from "marked";
import { parseYoutubeOrVimeoEmbedUrl, isSafeHref, escapeHtmlAttr } from "./blogMarkdown";

const VIDEO_SHORTCODE = /::video\[([^\]]+)\]/g;

function buildSafeRenderer(): Renderer {
  const renderer = new Renderer();
  // Nunca deixa HTML cru embutido passar (marked v18 não tem mais opção
  // `sanitize` — bloquear no renderer é o jeito certo de fazer isso hoje).
  renderer.html = () => "";
  // Bloqueia protocolo perigoso em link (javascript:/data:/vbscript:) — sem
  // isso, marked gera <a href="javascript:..."> direto da sintaxe [texto](url).
  renderer.link = ({ href, tokens }) => {
    const label = renderer.parser.parseInline(tokens);
    if (!isSafeHref(href)) return label;
    return `<a href="${escapeHtmlAttr(href)}">${label}</a>`;
  };
  return renderer;
}

/**
 * Markdown -> HTML seguro. Usado tanto no preview do editor quanto no blog
 * público — um pipeline só, pra preview e produção nunca divergirem.
 *
 * Ordem importa: o shortcode ::video[url] vira um placeholder textual ANTES
 * do marked.parse (senão o renderer sem HTML engoliria o iframe que a gente
 * injetasse depois), e só vira <iframe> DEPOIS do parse, trocando o
 * placeholder no HTML já pronto.
 */
export function renderBlogMarkdown(markdown: string | null | undefined): string {
  if (!markdown) return "";

  const embeds: string[] = [];
  const withPlaceholders = markdown.replace(VIDEO_SHORTCODE, (_match, rawUrl: string) => {
    const embedSrc = parseYoutubeOrVimeoEmbedUrl(rawUrl.trim());
    const html = embedSrc
      ? `<div class="blog-embed"><iframe src="${embedSrc}" loading="lazy" allowfullscreen></iframe></div>`
      : ""; // provedor fora do allowlist: nunca renderiza, some silenciosamente
    embeds.push(html);
    return `%%POLIA_VIDEO_${embeds.length - 1}%%`;
  });

  let html = marked.parse(withPlaceholders, {
    async: false,
    renderer: buildSafeRenderer(),
  }) as string;

  html = html.replace(/<p>%%POLIA_VIDEO_(\d+)%%<\/p>/g, (_m, idx: string) => embeds[Number(idx)] ?? "");
  html = html.replace(/%%POLIA_VIDEO_(\d+)%%/g, (_m, idx: string) => embeds[Number(idx)] ?? "");

  return html;
}
