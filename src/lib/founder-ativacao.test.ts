import { describe, expect, it } from "vitest";
import { calcularAtivacaoReal, voltouDepoisDe48h, voltouEmOutroDia } from "./founder-ativacao";

// GRW-66. Datas em UTC; Brasília = UTC-3.
// Conta criada 10/10 às 22:00 em Brasília = 2026-10-11T01:00Z.
const CRIADA = "2026-10-11T01:00:00.000Z";

describe("voltouEmOutroDia", () => {
  it("evento no mesmo dia de Brasília não conta, mesmo já sendo outro dia em UTC", () => {
    // 10/10 23:30 em Brasília
    expect(voltouEmOutroDia(CRIADA, ["2026-10-11T02:30:00.000Z"])).toBe(false);
  });

  it("evento no dia seguinte de Brasília conta, mesmo poucas horas depois", () => {
    // 11/10 00:10 em Brasília
    expect(voltouEmOutroDia(CRIADA, ["2026-10-11T03:10:00.000Z"])).toBe(true);
  });

  it("evento depois dos 7 primeiros dias não conta", () => {
    expect(voltouEmOutroDia(CRIADA, ["2026-10-18T01:00:00.000Z"])).toBe(false);
    expect(voltouEmOutroDia(CRIADA, ["2026-10-18T00:59:59.000Z"])).toBe(true);
  });

  it("evento anterior à conta não conta", () => {
    expect(voltouEmOutroDia(CRIADA, ["2026-10-09T12:00:00.000Z"])).toBe(false);
  });
});

describe("voltouDepoisDe48h", () => {
  it("só evento depois de created_at + 48h", () => {
    expect(voltouDepoisDe48h(CRIADA, ["2026-10-13T01:00:00.000Z"])).toBe(false);
    expect(voltouDepoisDe48h(CRIADA, ["2026-10-13T01:00:01.000Z"])).toBe(true);
    expect(voltouDepoisDe48h(CRIADA, [])).toBe(false);
  });
});

describe("calcularAtivacaoReal", () => {
  const AGORA = Date.parse("2026-10-20T15:00:00.000Z");

  it("ativada precisa das duas coisas: preço calculado e volta em outro dia", () => {
    const contas = [
      { id: "as-duas", criadaEm: CRIADA },
      { id: "so-preco", criadaEm: CRIADA },
      { id: "so-voltou", criadaEm: CRIADA },
      { id: "nada", criadaEm: CRIADA },
    ];
    const precos = new Set(["as-duas", "so-preco"]);
    const eventos = new Map([
      ["as-duas", ["2026-10-12T15:00:00.000Z"]],
      ["so-preco", ["2026-10-11T01:30:00.000Z"]],
      ["so-voltou", ["2026-10-12T15:00:00.000Z"]],
    ]);
    const r = calcularAtivacaoReal(contas, precos, eventos, AGORA);
    expect(r.contas).toBe(4);
    expect(r.ativadas).toBe(1);
    expect(r.taxa).toBe(25);
  });

  it("voltaram depois de 48h usa só contas com 3 dias ou mais de vida", () => {
    const contas = [
      { id: "velha-voltou", criadaEm: "2026-10-01T12:00:00.000Z" },
      { id: "velha-sumiu", criadaEm: "2026-10-01T12:00:00.000Z" },
      // 2 dias e 23h de vida: fora da base
      { id: "nova", criadaEm: "2026-10-17T16:00:00.000Z" },
    ];
    const eventos = new Map([
      ["velha-voltou", ["2026-10-05T12:00:00.000Z"]],
      ["velha-sumiu", ["2026-10-02T12:00:00.000Z"]],
      ["nova", ["2026-10-20T14:00:00.000Z"]],
    ]);
    const r = calcularAtivacaoReal(contas, new Set(), eventos, AGORA);
    expect(r.base48h).toBe(2);
    expect(r.voltaram48h).toBe(1);
    expect(r.taxa48h).toBe(50);
  });

  it("sem conta, as taxas são null, não zero", () => {
    expect(calcularAtivacaoReal([], new Set(), new Map(), AGORA)).toEqual({
      contas: 0,
      ativadas: 0,
      taxa: null,
      base48h: 0,
      voltaram48h: 0,
      taxa48h: null,
    });
  });
});
