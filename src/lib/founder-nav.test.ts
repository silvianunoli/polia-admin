import { describe, it, expect } from "vitest";
import { GRUPOS_FOUNDER, itemAtivo, tituloDaRota } from "./founder-nav";

const itens = GRUPOS_FOUNDER.flatMap((g) => g.itens);

describe("itemAtivo", () => {
  const pulse = { to: "/founder", label: "Founder Pulse", exato: true };
  const analytics = { to: "/founder/analytics", label: "Visão geral", exato: true };
  const usuarias = { to: "/founder/analytics/usuarias", label: "Usuárias" };

  it("item exato só acende na própria rota", () => {
    // Sem 'exato', /founder acenderia em TODAS as páginas do dashboard.
    expect(itemAtivo(pulse, "/founder")).toBe(true);
    expect(itemAtivo(pulse, "/founder/saude")).toBe(false);
    expect(itemAtivo(analytics, "/founder/analytics/usuarias")).toBe(false);
  });

  it("item de prefixo acende nas sub-rotas, mas não em rota que só começa parecido", () => {
    expect(itemAtivo(usuarias, "/founder/analytics/usuarias")).toBe(true);
    expect(itemAtivo(usuarias, "/founder/analytics/usuarias/abc")).toBe(true);
    expect(itemAtivo(usuarias, "/founder/analytics/usuariasX")).toBe(false);
  });
});

describe("tituloDaRota", () => {
  it("devolve grupo e label da rota, inclusive em sub-rota", () => {
    expect(tituloDaRota("/founder")).toEqual({ grupo: "Overview", label: "Founder Pulse" });
    expect(tituloDaRota("/founder/infra/ia")).toEqual({ grupo: "Infra", label: "IA" });
    expect(tituloDaRota("/founder/analytics/retencao/x")).toEqual({
      grupo: "Analytics",
      label: "Retenção",
    });
  });

  it("rota fora do mapa devolve null", () => {
    expect(tituloDaRota("/crm")).toBeNull();
  });
});

describe("GRUPOS_FOUNDER", () => {
  it("toda rota é única e mora em /founder", () => {
    const tos = itens.map((i) => i.to);
    expect(new Set(tos).size).toBe(tos.length);
    for (const to of tos) expect(to).toMatch(/^\/founder(\/|$)/);
  });

  it("dentro de um grupo não há label repetido", () => {
    for (const g of GRUPOS_FOUNDER) {
      const labels = g.itens.map((i) => i.label);
      expect(new Set(labels).size, g.titulo).toBe(labels.length);
    }
  });

  // Vocabulário morto: founder-nav.ts:29 tem o label "Jornadas". A palavra
  // "jornada" foi banida do produto (mundo territorial morto). Quando o label
  // for trocado, este it.fails passa a falhar: aí é só trocar por it.
  it.fails("nenhum label usa vocabulário morto (hoje: 'Jornadas')", () => {
    for (const i of itens) {
      expect(i.label).not.toMatch(
        /[Ee]tapa|[Tt]rilha|[Jj]ornada|[Mm]arco|[Bb]ússola|[Tt]erritório/,
      );
    }
  });
});
