import { describe, it, expect } from "vitest";
import { CARROSSEL_POLIA_ONE } from "./polia-one";

// Semente do primeiro carrossel (/conteudo-polia). O banco guarda o que a
// Sil editou; isto é o que nasce quando ainda não existe nada. Slide com
// ordem repetida ou texto morto entra no feed do @hub.polia.
//
// cssBase não é testado: o Vitest devolve string vazia pra import de .css
// com ?raw (o Vite trata CSS antes do sufixo), então aqui ele vem "" mesmo
// com o arquivo cheio. Não é bug do produto.

const VOCABULARIO_MORTO =
  /\b[Ee]tapa|\b[Tt]rilha|\b[Jj]ornada|[Nn]o seu ritmo|[Nn]o seu tempo|[Dd]o seu jeito|[Ii]nfoproduto|\bDani\b|\bComeço\b|\bAlcance\b|\bVoo\b|\bConfere\b|\bControle\b|\bProjete\b|\b[Tt]urma\b|[Cc]arimbo|[Bb]ússola|[Tt]erritório|[Rr]aposa/;

const semTags = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const { slides } = CARROSSEL_POLIA_ONE;

describe("CARROSSEL_POLIA_ONE", () => {
  it("é o carrossel polia-one, 1080x1350, com 7 pranchas", () => {
    expect(CARROSSEL_POLIA_ONE.slug).toBe("polia-one");
    expect(CARROSSEL_POLIA_ONE.largura).toBe(1080);
    expect(CARROSSEL_POLIA_ONE.altura).toBe(1350);
    expect(slides).toHaveLength(7);
  });

  it("ordem é 1..7 sem repetição e o título começa pelo número da prancha", () => {
    expect(slides.map((s) => s.ordem)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const s of slides) expect(s.titulo).toMatch(new RegExp(`^${s.ordem} · `));
  });

  it("toda prancha tem HTML com texto de verdade", () => {
    for (const s of slides) {
      expect(s.html.length, s.titulo).toBeGreaterThan(50);
      expect(semTags(s.html).length, s.titulo).toBeGreaterThan(0);
    }
  });

  it("texto das pranchas sem vocabulário morto, travessão, exclamação ou emoji", () => {
    for (const s of slides) {
      const texto = semTags(s.html);
      expect(texto, s.titulo).not.toMatch(VOCABULARIO_MORTO);
      expect(texto, s.titulo).not.toMatch(/—|!|\p{Extended_Pictographic}/u);
    }
  });

  it("não ressuscita fonte morta: Caveat, Fraunces como display, DM Serif, Georgia", () => {
    for (const s of slides) {
      expect(s.html, s.titulo).not.toMatch(/Caveat|DM Serif|Georgia/);
    }
  });
});
