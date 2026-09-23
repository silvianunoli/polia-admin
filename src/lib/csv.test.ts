import { describe, it, expect } from "vitest";
import { parseCsv, gerarCsv } from "./csv";

// O parser importa respostas de pesquisa (Van Westendorp) exportadas de
// formulário externo. Aspas e vírgula dentro de campo são o caso normal, não
// a exceção: resposta aberta tem vírgula. baixarCsv() mexe em DOM/Blob e não
// entra aqui (ambiente node, sem jsdom).

describe("parseCsv", () => {
  it("separa campos por vírgula e linhas por quebra", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("campo entre aspas pode ter vírgula e quebra de linha", () => {
    expect(parseCsv('nome,resposta\nAna,"vendo bolo, doce\ne salgado"')).toEqual([
      ["nome", "resposta"],
      ["Ana", "vendo bolo, doce\ne salgado"],
    ]);
  });

  it('aspas escapadas ("") viram uma aspa', () => {
    expect(parseCsv('"ela disse ""oi"""')).toEqual([['ela disse "oi"']]);
  });

  it("aceita CRLF do Excel", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("preserva campo vazio no meio, mas descarta linha toda vazia", () => {
    expect(parseCsv("a,,c\n\n   \n1,2,3\n")).toEqual([
      ["a", "", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("string vazia vira lista vazia", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("gerarCsv", () => {
  it("põe o cabeçalho na frente e usa CRLF entre linhas", () => {
    expect(gerarCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2");
  });

  it("escapa vírgula, aspas e quebra de linha com aspas duplas", () => {
    expect(gerarCsv(["x"], [["um, dois"], ['ela disse "oi"'], ["linha\nnova"]])).toBe(
      'x\r\n"um, dois"\r\n"ela disse ""oi"""\r\n"linha\nnova"',
    );
  });

  it("ida e volta com parseCsv preserva os dados", () => {
    const cabecalho = ["nome", "resposta"];
    const linhas = [
      ["Ana", 'vende "bolo, doce"\ne salgado'],
      ["Bia", ""],
      ["", "só resposta"],
    ];
    expect(parseCsv(gerarCsv(cabecalho, linhas))).toEqual([cabecalho, ...linhas]);
  });
});
