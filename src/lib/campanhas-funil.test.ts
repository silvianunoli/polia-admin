import { describe, expect, it } from "vitest";
import {
  campanhaPadrao,
  ehAssinante,
  extrairOrigem,
  filtrarCadastros,
  gastoDaCampanha,
  janelaDoPeriodo,
  listarCampanhas,
  montarLinhas,
  SEM_ANUNCIO,
  SEM_CAMPANHA,
  somarTotais,
  taxa,
  TODAS,
  type CadastroCampanha,
  type GastoMeta,
} from "./campanhas-funil";

function cad(p: Partial<CadastroCampanha>): CadastroCampanha {
  return {
    campanha: "nichos-out26",
    anuncio: "N01-nail",
    criadoEm: "2026-10-08T12:00:00.000Z",
    fezOnboarding: false,
    calculouPreco: false,
    assinante: false,
    ...p,
  };
}

function gasto(p: Partial<GastoMeta>): GastoMeta {
  return {
    anuncio: "N01-nail",
    campanhaMeta: "nichos-out26",
    gasto: 0,
    impressoes: 0,
    cliques: 0,
    ...p,
  };
}

describe("extrairOrigem", () => {
  it("conta sem origem_campanha não entra", () => {
    expect(extrairOrigem({})).toBeNull();
    expect(extrairOrigem(null)).toBeNull();
    expect(extrairOrigem({ origem_campanha: "landing-a" })).toBeNull();
  });

  it("lê utm_campaign e utm_content, com rótulo próprio pra ausente", () => {
    expect(
      extrairOrigem({
        origem_campanha: { utm_campaign: "nichos-out26", utm_content: " N07-confeiteira " },
      }),
    ).toEqual({ campanha: "nichos-out26", anuncio: "N07-confeiteira" });
    expect(extrairOrigem({ origem_campanha: { origem: "landing-b" } })).toEqual({
      campanha: SEM_CAMPANHA,
      anuncio: SEM_ANUNCIO,
    });
  });
});

describe("ehAssinante", () => {
  it("só Premium (controle) e Pro (projete)", () => {
    expect(ehAssinante("controle")).toBe(true);
    expect(ehAssinante("projete")).toBe(true);
    expect(ehAssinante("confere")).toBe(false);
    expect(ehAssinante("beta")).toBe(false);
    expect(ehAssinante("cancelada")).toBe(false);
    expect(ehAssinante(null)).toBe(false);
  });
});

describe("janelaDoPeriodo", () => {
  // 09/10/2026 22:00 em Brasília = 10/10/2026 01:00 UTC
  const agora = Date.parse("2026-10-10T01:00:00.000Z");

  it("7 dias começa à meia-noite de Brasília de 6 dias atrás, com o dia BRT certo", () => {
    const j = janelaDoPeriodo("7", agora);
    expect(j.until).toBe("2026-10-09");
    expect(j.since).toBe("2026-10-03");
    expect(new Date(j.iniMs!).toISOString()).toBe("2026-10-03T03:00:00.000Z");
  });

  it("tudo não tem início e vai pro Meta como maximum", () => {
    const j = janelaDoPeriodo("tudo", agora);
    expect(j.iniMs).toBeNull();
    expect(j.since).toBeNull();
  });
});

describe("listarCampanhas e campanhaPadrao", () => {
  it("ordena pela mais recente e abre nela; sem utm_campaign fica por último", () => {
    const lista = listarCampanhas([
      cad({ campanha: "abertura", criadoEm: "2026-10-01T10:00:00Z" }),
      cad({ campanha: SEM_CAMPANHA, criadoEm: "2026-10-09T10:00:00Z" }),
      cad({ campanha: "nichos-out26", criadoEm: "2026-10-08T10:00:00Z" }),
      cad({ campanha: "nichos-out26", criadoEm: "2026-10-05T10:00:00Z" }),
    ]);
    expect(lista.map((c) => c.campanha)).toEqual(["nichos-out26", "abertura", SEM_CAMPANHA]);
    expect(lista[0].cadastros).toBe(2);
    expect(campanhaPadrao(lista)).toBe("nichos-out26");
    expect(campanhaPadrao([])).toBe(TODAS);
  });
});

describe("filtrarCadastros", () => {
  it("filtra por campanha e período", () => {
    const todos = [
      cad({ campanha: "a", criadoEm: "2026-10-08T00:00:00Z" }),
      cad({ campanha: "b", criadoEm: "2026-10-08T00:00:00Z" }),
      cad({ campanha: "a", criadoEm: "2026-09-01T00:00:00Z" }),
    ];
    const ini = Date.parse("2026-10-01T03:00:00Z");
    expect(filtrarCadastros(todos, "a", ini)).toHaveLength(1);
    expect(filtrarCadastros(todos, TODAS, ini)).toHaveLength(2);
    expect(filtrarCadastros(todos, "a", null)).toHaveLength(2);
  });
});

describe("taxa", () => {
  it("base zero não tem taxa", () => {
    expect(taxa(3, 0)).toBeNull();
    expect(taxa(1, 4)).toBe(25);
  });
});

describe("montarLinhas", () => {
  const cadastros = [
    cad({ anuncio: "N01-nail", fezOnboarding: true, calculouPreco: true, assinante: true }),
    cad({ anuncio: "N01-nail", fezOnboarding: true, calculouPreco: true }),
    cad({ anuncio: "N01-nail" }),
    cad({ anuncio: "N07-confeiteira", fezOnboarding: true }),
  ];

  it("sem Meta conectado conta o funil e deixa o dinheiro em null", () => {
    const linhas = montarLinhas(cadastros, null);
    expect(linhas[0]).toMatchObject({
      anuncio: "N01-nail",
      cadastros: 3,
      fezOnboarding: 2,
      calculouPreco: 2,
      assinantes: 1,
      gasto: null,
      custoPorCadastro: null,
    });
    expect(linhas[1].anuncio).toBe("N07-confeiteira");
  });

  it("cruza ad_name com utm_content sem ligar pra caixa e soma anúncios duplicados", () => {
    const linhas = montarLinhas(cadastros, [
      gasto({ anuncio: "n01-NAIL", gasto: 30, cliques: 40, impressoes: 1000 }),
      gasto({ anuncio: "N01-nail", gasto: 15, cliques: 10, impressoes: 500 }),
      gasto({ anuncio: "N09-doceira", gasto: 20, cliques: 5 }),
    ]);
    const nail = linhas.find((l) => l.anuncio === "N01-nail")!;
    expect(nail.gasto).toBe(45);
    expect(nail.cliques).toBe(50);
    expect(nail.custoPorCadastro).toBe(15);
    expect(nail.custoPorAtivada).toBe(22.5);
    expect(nail.custoPorAssinante).toBe(45);

    // Gastou e não trouxe ninguém: aparece com zero, não some.
    const doceira = linhas.find((l) => l.anuncio === "N09-doceira")!;
    expect(doceira).toMatchObject({ cadastros: 0, gasto: 20, custoPorCadastro: null });

    // Conectado, mas sem gasto no período: zero, não "sem dado".
    const confeiteira = linhas.find((l) => l.anuncio === "N07-confeiteira")!;
    expect(confeiteira.gasto).toBe(0);
    expect(confeiteira.custoPorCadastro).toBe(0);

    // Ordem por cadastros.
    expect(linhas.map((l) => l.anuncio)).toEqual(["N01-nail", "N07-confeiteira", "N09-doceira"]);
  });

  it("totais somam o funil e recalculam o custo sobre o total", () => {
    const linhas = montarLinhas(cadastros, [
      gasto({ anuncio: "N01-nail", gasto: 40, cliques: 80 }),
    ]);
    const t = somarTotais(linhas, true);
    expect(t).toMatchObject({
      cadastros: 4,
      fezOnboarding: 3,
      calculouPreco: 2,
      assinantes: 1,
      gasto: 40,
      cliques: 80,
      custoPorCadastro: 10,
      custoPorAtivada: 20,
      custoPorAssinante: 40,
    });
    expect(somarTotais(montarLinhas(cadastros, null), false).gasto).toBeNull();
  });
});

describe("gastoDaCampanha", () => {
  const gastos = [
    gasto({ anuncio: "N01-nail", campanhaMeta: "Campanha com outro nome" }),
    gasto({ anuncio: "X-outro", campanhaMeta: "Nichos | Out26" }),
    gasto({ anuncio: "Abertura-1", campanhaMeta: "Abertura" }),
  ];

  it("todas devolve tudo", () => {
    expect(gastoDaCampanha(gastos, TODAS, new Set())).toHaveLength(3);
  });

  it("pega pelo nome da campanha no Meta ou por anúncio já visto na campanha", () => {
    const r = gastoDaCampanha(gastos, "nichos-out26", new Set(["n01-nail"]));
    expect(r.map((g) => g.anuncio)).toEqual(["N01-nail", "X-outro"]);
  });
});
