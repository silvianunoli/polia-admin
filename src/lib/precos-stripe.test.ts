import { describe, expect, it } from "vitest";
import { precoConhecido } from "./precos-stripe";

describe("precoConhecido", () => {
  it("dá nome e valor mensal dos planos mensais", () => {
    expect(precoConhecido("price_1UMSv1DVrcnQlhIrFxvDWW2V")).toEqual({
      nome: "Premium",
      intervalo: "month",
      mensal: 2990,
    });
    expect(precoConhecido("price_1UMT0MDVrcnQlhIr8GipurBV")?.mensal).toBe(4790);
  });

  it("divide o anual por 12", () => {
    expect(precoConhecido("price_1UMSv1DVrcnQlhIrAyQMWx3w")?.mensal).toBe(2492);
    expect(precoConhecido("price_1UMT0MDVrcnQlhIr8DLe4Thk")?.mensal).toBe(3992);
  });

  it("devolve null pra preço fora do catálogo", () => {
    expect(precoConhecido("price_desconhecido")).toBeNull();
  });
});
