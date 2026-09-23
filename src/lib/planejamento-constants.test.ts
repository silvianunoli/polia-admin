import { describe, it, expect } from "vitest";
import { MODULOS, TOTAL_MODULOS, moduloInfo } from "./planejamento-constants";

// Recorte do Planejamento do polia-app. A fonte da verdade mora lá; aqui só
// se garante que o recorte não perdeu a forma.

describe("MODULOS", () => {
  it("são 6, numerados de 1 a 6 em ordem", () => {
    expect(TOTAL_MODULOS).toBe(6);
    expect(MODULOS.map((m) => m.n)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("nome e subtítulo sem vocabulário morto, travessão, exclamação ou emoji", () => {
    for (const m of MODULOS) {
      const texto = `${m.nome} ${m.subtitulo}`;
      expect(texto).not.toMatch(
        /[Ee]tapa|[Tt]rilha|[Jj]ornada|[Mm]arco\b|[Bb]ússola|[Tt]erritório/,
      );
      expect(texto).not.toMatch(/—|!|\p{Extended_Pictographic}/u);
    }
  });
});

describe("moduloInfo", () => {
  it("devolve o módulo pelo número", () => {
    expect(moduloInfo(3).n).toBe(3);
  });

  it("número fora da faixa prende no primeiro ou no último, nunca undefined", () => {
    // profiles.modulo_atual pode vir 0 ou lixo de migração antiga.
    expect(moduloInfo(0).n).toBe(1);
    expect(moduloInfo(-4).n).toBe(1);
    expect(moduloInfo(99).n).toBe(6);
  });
});
