import { describe, it, expect } from "vitest";
import {
  formatarDuracao,
  formatarDataHoraBRT,
  formatarDataBRT,
  formatarPct,
  formatarNumero,
  NOME_PLANO,
  nomePlano,
  formatarBytes,
  formatarReais,
  formatarUsd,
  formatarMs,
} from "./founder-formato";

// O Intl do Node separa "R$" do número com espaço duro (U+00A0). Pra
// comparar sem depender disso, o teste normaliza pra espaço comum.
const semNbsp = (s: string) => s.split(String.fromCharCode(160)).join(" ");

describe("formatarDuracao", () => {
  it("nulo ou indefinido vira travessão de vazio", () => {
    expect(formatarDuracao(null)).toBe("—");
    expect(formatarDuracao(undefined)).toBe("—");
  });

  it.each([
    [0, "0s"],
    [59, "59s"],
    [60, "1m"],
    [61, "1m 1s"],
    [3600, "1h"],
    [3660, "1h 1m"],
  ])("%s segundos -> %s", (segundos, esperado) => {
    expect(formatarDuracao(segundos)).toBe(esperado);
  });

  it("acima de uma hora os segundos somem", () => {
    expect(formatarDuracao(3601)).toBe("1h");
  });

  it("negativo vira 0s e fração arredonda", () => {
    expect(formatarDuracao(-5)).toBe("0s");
    expect(formatarDuracao(59.6)).toBe("1m");
  });
});

describe("datas em Brasília", () => {
  // 01/03 01:00 UTC ainda é 28/02 no Brasil: a tela tem que mostrar 28/02.
  it("formatarDataHoraBRT usa dia/mês e hora de Brasília", () => {
    expect(formatarDataHoraBRT("2026-03-01T01:00:00Z")).toBe("28/02, 22:00");
  });

  it("formatarDataBRT usa dia/mês/ano curto", () => {
    expect(formatarDataBRT("2026-03-01T01:00:00Z")).toBe("28/02/26");
  });

  it("vazio, nulo e indefinido viram travessão de vazio", () => {
    expect(formatarDataHoraBRT(null)).toBe("—");
    expect(formatarDataBRT("")).toBe("—");
    expect(formatarDataBRT(undefined)).toBe("—");
  });
});

describe("formatarPct", () => {
  it("nulo e NaN viram travessão de vazio", () => {
    expect(formatarPct(null)).toBe("—");
    expect(formatarPct(Number.NaN)).toBe("—");
  });

  it("arredonda pelas casas pedidas", () => {
    expect(formatarPct(12.345)).toBe("12%");
    expect(formatarPct(12.345, 1)).toBe("12.3%");
    expect(formatarPct(0)).toBe("0%");
    expect(formatarPct(-5)).toBe("-5%");
  });
});

describe("formatarNumero", () => {
  it("usa ponto de milhar e vírgula decimal", () => {
    expect(formatarNumero(1234567.5)).toBe("1.234.567,5");
    expect(formatarNumero(0)).toBe("0");
    expect(formatarNumero(null)).toBe("—");
  });
});

describe("nomePlano", () => {
  // Os nomes visíveis mudaram em 14/09/2026 e a chave interna ficou. Se
  // alguém "corrigir" o mapa de volta, o office mostra plano que não existe.
  it.each([
    ["confere", "Grátis"],
    ["controle", "Premium"],
    ["projete", "Pro"],
    ["beta", "Lançamento"],
    ["cancelada", "Cancelada"],
  ])("chave interna %s aparece como %s", (chave, nome) => {
    expect(nomePlano(chave)).toBe(nome);
  });

  it("chave desconhecida volta como está, nulo vira travessão de vazio", () => {
    expect(nomePlano("xyz")).toBe("xyz");
    expect(nomePlano(null)).toBe("—");
    expect(nomePlano("")).toBe("—");
  });

  it("nenhum nome morto de plano sobrevive no mapa", () => {
    for (const nome of Object.values(NOME_PLANO)) {
      expect(nome).not.toMatch(/Começo|Alcance|Voo|Confere|Controle|Projete/);
    }
  });
});

describe("formatarBytes", () => {
  it.each([
    [0, "0 B"],
    [1023, "1023 B"],
    [1024, "1 KB"],
    [1536, "2 KB"],
    [1_048_576, "1.0 MB"],
    [1_073_741_824, "1.00 GB"],
  ])("%s bytes -> %s", (bytes, esperado) => {
    expect(formatarBytes(bytes)).toBe(esperado);
  });

  it("nulo vira travessão de vazio", () => {
    expect(formatarBytes(null)).toBe("—");
  });
});

describe("formatarReais", () => {
  it("recebe centavos, não reais", () => {
    expect(semNbsp(formatarReais(100))).toBe("R$ 1,00");
    expect(semNbsp(formatarReais(123456))).toBe("R$ 1.234,56");
  });

  it("zero e negativo", () => {
    expect(semNbsp(formatarReais(0))).toBe("R$ 0,00");
    expect(semNbsp(formatarReais(-100))).toBe("-R$ 1,00");
  });

  it("nulo vira travessão de vazio", () => {
    expect(formatarReais(null)).toBe("—");
  });
});

describe("formatarUsd", () => {
  it("formata em dólar americano com duas casas", () => {
    expect(formatarUsd(1234.5)).toBe("$1,234.50");
    expect(formatarUsd(0)).toBe("$0.00");
    expect(formatarUsd(undefined)).toBe("—");
  });
});

describe("formatarMs", () => {
  it("abaixo de um segundo fica em ms inteiro", () => {
    expect(formatarMs(999)).toBe("999 ms");
    expect(formatarMs(999.4)).toBe("999 ms");
    expect(formatarMs(0)).toBe("0 ms");
  });

  it("a partir de um segundo vira s com duas casas", () => {
    expect(formatarMs(1500)).toBe("1.50 s");
    expect(formatarMs(1000)).toBe("1.00 s");
  });
});
