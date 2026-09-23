import { describe, it, expect } from "vitest";
import { periodoSearchSchema, resolverPeriodo, dataBRT, variacaoPct } from "./founder-periodo";

// Todo número do Founder Dashboard compara "período atual" contra "período
// anterior da mesma duração". Se o recorte errar por um dia (ou por três
// horas de fuso), a variação percentual mente pra fundadora.
//
// Instante fixo: 01/03/2026 01:00 UTC = 28/02/2026 22:00 em Brasília. Serve
// pra provar a virada de dia E de mês no fuso certo ao mesmo tempo.
const AGORA = Date.parse("2026-03-01T01:00:00.000Z");
const DIA = 86_400_000;
const ms = (iso: string) => Date.parse(iso);

describe("periodoSearchSchema", () => {
  it("cai em 7 dias quando a URL não diz nada", () => {
    expect(periodoSearchSchema.parse({})).toEqual({ periodo: "7" });
  });

  it.each(["hoje", "7", "30", "90", "custom"])("aceita periodo=%s", (periodo) => {
    expect(periodoSearchSchema.parse({ periodo }).periodo).toBe(periodo);
  });

  it("recusa período que não está na lista", () => {
    expect(() => periodoSearchSchema.parse({ periodo: "15" })).toThrow();
  });

  it("só aceita de/ate em YYYY-MM-DD", () => {
    expect(periodoSearchSchema.parse({ de: "2026-01-01", ate: "2026-01-31" })).toMatchObject({
      de: "2026-01-01",
      ate: "2026-01-31",
    });
    expect(() => periodoSearchSchema.parse({ de: "01/01/2026" })).toThrow();
  });
});

describe("resolverPeriodo: hoje", () => {
  it("começa à meia-noite de Brasília, não à meia-noite UTC", () => {
    // Às 01:00 UTC de 1º/03 ainda é 28/02 no Brasil. "Hoje" tem que ser 28/02.
    const r = resolverPeriodo({ periodo: "hoje" }, AGORA);
    expect(r.ini).toBe("2026-02-28T03:00:00.000Z");
    expect(r.fim).toBe("2026-03-01T01:00:00.000Z");
    expect(r.rotulo).toBe("hoje");
  });

  it("conta como 1 dia mesmo com poucas horas passadas", () => {
    // 00:30 BRT = 03:30 UTC: 30 minutos de duração não podem virar 0 dias.
    const r = resolverPeriodo({ periodo: "hoje" }, ms("2026-03-01T03:30:00.000Z"));
    expect(r.ini).toBe("2026-03-01T03:00:00.000Z");
    expect(r.dias).toBe(1);
  });

  it("o período anterior tem a mesma duração e termina onde o atual começa", () => {
    const r = resolverPeriodo({ periodo: "hoje" }, AGORA);
    const duracao = ms(r.fim) - ms(r.ini);
    expect(ms(r.fimAnterior)).toBe(ms(r.ini));
    expect(ms(r.fimAnterior) - ms(r.iniAnterior)).toBe(duracao);
  });
});

describe("resolverPeriodo: janelas fixas", () => {
  it.each([
    ["7", 7],
    ["30", 30],
    ["90", 90],
  ] as const)("periodo=%s volta %s dias a partir de agora", (periodo, dias) => {
    const r = resolverPeriodo({ periodo }, AGORA);
    expect(ms(r.ini)).toBe(AGORA - dias * DIA);
    expect(ms(r.fim)).toBe(AGORA);
    expect(r.dias).toBe(dias);
    expect(r.rotulo).toBe(`últimos ${dias} dias`);
    expect(ms(r.iniAnterior)).toBe(AGORA - 2 * dias * DIA);
    expect(r.fimAnterior).toBe(r.ini);
  });
});

describe("resolverPeriodo: custom", () => {
  it("cobre do início do primeiro dia ao fim do último, em horário de Brasília", () => {
    const r = resolverPeriodo({ periodo: "custom", de: "2026-01-01", ate: "2026-01-31" }, AGORA);
    expect(r.ini).toBe("2026-01-01T03:00:00.000Z");
    expect(r.fim).toBe("2026-02-01T02:59:59.999Z");
    expect(r.dias).toBe(31);
    expect(r.rotulo).toBe("2026-01-01 a 2026-01-31");
  });

  it("não deixa o fim passar de agora quando 'ate' está no futuro", () => {
    const r = resolverPeriodo({ periodo: "custom", de: "2026-02-20", ate: "2026-12-31" }, AGORA);
    expect(ms(r.fim)).toBe(AGORA);
  });

  it("intervalo invertido (de > ate) não vira duração negativa", () => {
    const r = resolverPeriodo({ periodo: "custom", de: "2026-02-10", ate: "2026-02-01" }, AGORA);
    expect(ms(r.fim)).toBe(ms(r.ini));
    expect(r.dias).toBe(1);
    expect(ms(r.fimAnterior) - ms(r.iniAnterior)).toBeGreaterThan(0);
  });

  it("período anterior espelha a duração exata do custom", () => {
    const r = resolverPeriodo({ periodo: "custom", de: "2026-01-01", ate: "2026-01-31" }, AGORA);
    expect(ms(r.fim) - ms(r.ini)).toBe(ms(r.fimAnterior) - ms(r.iniAnterior));
    expect(r.fimAnterior).toBe(r.ini);
  });

  it("custom sem as duas datas cai em 7 dias em vez de quebrar", () => {
    expect(resolverPeriodo({ periodo: "custom" }, AGORA).rotulo).toBe("últimos 7 dias");
    expect(resolverPeriodo({ periodo: "custom", de: "2026-01-01" }, AGORA).rotulo).toBe(
      "últimos 7 dias",
    );
  });
});

describe("dataBRT", () => {
  it("devolve a data civil de Brasília, não a UTC", () => {
    expect(dataBRT("2026-03-01T01:00:00.000Z")).toBe("2026-02-28");
    expect(dataBRT(AGORA)).toBe("2026-02-28");
  });

  it("vira o dia exatamente às 03:00 UTC", () => {
    expect(dataBRT("2026-03-01T02:59:59.999Z")).toBe("2026-02-28");
    expect(dataBRT("2026-03-01T03:00:00.000Z")).toBe("2026-03-01");
  });
});

describe("variacaoPct", () => {
  it("de zero pra zero é 0%, não NaN", () => {
    expect(variacaoPct(0, 0)).toBe(0);
  });

  it("crescer a partir de zero não tem percentual (null), pra tela mostrar 'novo'", () => {
    expect(variacaoPct(5, 0)).toBeNull();
  });

  it("calcula subida, queda e queda total", () => {
    expect(variacaoPct(150, 100)).toBe(50);
    expect(variacaoPct(50, 100)).toBe(-50);
    expect(variacaoPct(0, 100)).toBe(-100);
  });
});
