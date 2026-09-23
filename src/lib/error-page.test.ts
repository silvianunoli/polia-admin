import { describe, it, expect } from "vitest";
import { renderErrorPage } from "./error-page";

// Página que o Worker devolve quando o SSR quebra. É a única tela que a
// pessoa vê sem nada do app carregado, então precisa se sustentar sozinha.

const PALETA = [
  "#F2F0ED",
  "#F9EFEE",
  "#F6DAD4",
  "#E6E6E6",
  "#0A0A0A",
  "#2C2C2C",
  "#6B6B6B",
  "#F3B9A9",
  "#7CCBCD",
  "#BFE9EB",
  "#24696B",
  "#FFC629",
  "#C0392B",
  "#FBEAE7",
  "#E0A8C0",
  "#B9B2A6",
  "#FFFFFF",
];

const html = renderErrorPage();
const texto = html
  .replace(/<style[\s\S]*?<\/style>/gi, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

describe("renderErrorPage", () => {
  it("é um documento pt-BR completo com título, charset e viewport", () => {
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="pt-BR">');
    expect(html).toContain('<meta charset="utf-8" />');
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });

  it("oferece recarregar e voltar pro início", () => {
    expect(html).toContain("location.reload()");
    expect(html).toMatch(/<a [^>]*href="\/"/);
  });

  it("a copy não usa travessão, exclamação nem emoji", () => {
    expect(texto).not.toMatch(/—|!|\p{Extended_Pictographic}/u);
  });

  // Regra nº 4 do CLAUDE.md da raiz: hex fora de polia-tokens.css é
  // regressão. Esta página usa #fafafa, #111, #4b5563, #fff e #d1d5db (cinzas
  // do Tailwind, paleta nenhuma da Pólia). Quando for trocada pelos tokens,
  // este it.fails passa a falhar: aí é só trocar por it.
  it.fails("só usa cor da paleta da Pólia (hoje: cinzas do Tailwind)", () => {
    const hexes = [...new Set(html.match(/#[0-9A-Fa-f]{3,6}\b/g) ?? [])].map((h) => {
      const semHash = h.slice(1);
      const cheio = semHash.length === 3 ? [...semHash].map((c) => c + c).join("") : semHash;
      return `#${cheio.toUpperCase()}`;
    });
    expect(hexes.filter((h) => !PALETA.includes(h))).toEqual([]);
  });
});
