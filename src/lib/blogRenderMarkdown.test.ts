import { describe, it, expect } from "vitest";
import { renderBlogMarkdown } from "./blogRenderMarkdown";

describe("renderBlogMarkdown", () => {
  it("retorna string vazia pra null", () => {
    expect(renderBlogMarkdown(null)).toBe("");
  });

  it("retorna string vazia pra undefined", () => {
    expect(renderBlogMarkdown(undefined)).toBe("");
  });

  it("retorna string vazia pra string vazia", () => {
    expect(renderBlogMarkdown("")).toBe("");
  });

  it("renderiza parágrafo simples em <p>", () => {
    expect(renderBlogMarkdown("Olá mundo")).toBe("<p>Olá mundo</p>\n");
  });

  it("renderiza heading H2", () => {
    expect(renderBlogMarkdown("## Título")).toContain("<h2");
    expect(renderBlogMarkdown("## Título")).toContain("Título</h2>");
  });

  it("renderiza link seguro como <a href>", () => {
    expect(renderBlogMarkdown("[clique](https://exemplo.com)")).toContain(
      '<a href="https://exemplo.com">clique</a>',
    );
  });

  it("bloqueia protocolo javascript: no link — mantém só o texto, sem <a>", () => {
    const html = renderBlogMarkdown("[clique](javascript:alert(1))");
    expect(html).not.toContain("<a ");
    expect(html).toContain("clique");
  });

  it("nunca deixa HTML cru passar (tag <script> embutida é descartada)", () => {
    const html = renderBlogMarkdown('texto normal <script>alert("xss")</script> depois');
    expect(html).not.toContain("<script>");
  });

  it("converte shortcode ::video[] do YouTube em iframe lazy", () => {
    const html = renderBlogMarkdown("::video[https://youtu.be/dQw4w9WgXcQ]");
    expect(html).toContain('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('loading="lazy"');
  });

  it("shortcode de provedor fora do allowlist some silenciosamente (sem iframe, sem erro)", () => {
    const html = renderBlogMarkdown("::video[https://vimeo-fake.exemplo.com/1]");
    expect(html).not.toContain("<iframe");
    expect(() => renderBlogMarkdown("::video[https://vimeo-fake.exemplo.com/1]")).not.toThrow();
  });

  it("renderiza vídeo cercado de texto sem perder o texto ao redor", () => {
    const html = renderBlogMarkdown("antes\n\n::video[https://youtu.be/dQw4w9WgXcQ]\n\ndepois");
    expect(html).toContain("antes");
    expect(html).toContain("<iframe");
    expect(html).toContain("depois");
  });
});
