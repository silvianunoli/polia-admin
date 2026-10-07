import { describe, it, expect } from "vitest";
import { porLanding, SEM_ORIGEM } from "./founder-landing";

describe("porLanding", () => {
  it("junta cadastros e compras da mesma origem e soma a receita pelo plano", () => {
    const linhas = porLanding(
      [{ origem: "landing-a" }, { origem: "landing-b" }, { origem: "landing-b" }],
      [
        { origem: "landing-b", plano: "controle_mensal" },
        { origem: "landing-b", plano: "projete_anual" },
      ],
    );
    expect(linhas[0]).toEqual({
      origem: "landing-b",
      cadastros: 2,
      compras: 2,
      receitaCentavos: 2990 + 47900,
    });
    expect(linhas[1]).toEqual({
      origem: "landing-a",
      cadastros: 1,
      compras: 0,
      receitaCentavos: 0,
    });
  });

  it("sem origem (ou origem vazia) cai numa linha própria, sempre por último", () => {
    const linhas = porLanding(
      [{}, null, { origem: "  " }, { origem: "home" }],
      [{ plano: "projete_mensal" }],
    );
    expect(linhas.map((l) => l.origem)).toEqual(["home", SEM_ORIGEM]);
    expect(linhas[1]).toMatchObject({ cadastros: 3, compras: 1, receitaCentavos: 4790 });
  });

  it("plano desconhecido conta a compra mas não inventa receita", () => {
    const [l] = porLanding([], [{ origem: "blog", plano: "confere" }]);
    expect(l).toMatchObject({ compras: 1, receitaCentavos: 0 });
  });

  it("sem dado nenhum devolve lista vazia", () => {
    expect(porLanding([], [])).toEqual([]);
  });
});
