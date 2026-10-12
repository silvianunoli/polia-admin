import { describe, expect, it } from "vitest";
import { calcularChurn } from "./founder-churn";

describe("calcularChurn", () => {
  it("divide pelas assinantes do snapshot do início do período", () => {
    expect(calcularChurn(1, 4, 3)).toEqual({ pct: 25, base: 4, origem: "snapshot" });
  });

  it("sem snapshot, a base é ativas agora + canceladas", () => {
    expect(calcularChurn(1, null, 3)).toEqual({ pct: 25, base: 4, origem: "estimada" });
  });

  it("snapshot zerado não vira estimativa (é dado real)", () => {
    expect(calcularChurn(0, 0, 3)).toEqual({ pct: null, base: 0, origem: "snapshot" });
  });

  it("sem base nenhuma fica sem dados", () => {
    expect(calcularChurn(0, undefined, 0).pct).toBeNull();
  });
});
