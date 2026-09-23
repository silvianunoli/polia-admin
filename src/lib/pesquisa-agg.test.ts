import { describe, it, expect } from "vitest";
import type { Pergunta } from "@/lib/pesquisas/tipos";
import {
  funil,
  abandonoPorPergunta,
  distribuicao,
  respostasAbertas,
  filtrarPorSegmento,
  type RespostaRow,
} from "./pesquisa-agg";

function row(
  respostas: Record<string, unknown>,
  { progresso = 0, concluida = false } = {},
): RespostaRow {
  return { progresso, concluida, respostas, criado_em: "2026-01-01T00:00:00Z" };
}

const unica: Pergunta = {
  id: "estagio",
  ordem: 1,
  parte: 1,
  tipo: "unica",
  titulo: "Onde você está?",
  opcoes: [
    { id: "a", rotulo: "A" },
    { id: "b", rotulo: "B" },
    { id: "c", rotulo: "C" },
  ],
};

const multipla: Pergunta = { ...unica, id: "dores", ordem: 2, tipo: "multipla", maxSelecoes: 3 };
const aberta: Pergunta = { id: "livre", ordem: 3, parte: 1, tipo: "aberta", titulo: "Conta" };

describe("funil", () => {
  it("vazio devolve zeros, sem dividir por zero", () => {
    expect(funil([])).toEqual({ comecaram: 0, concluiram: 0, taxaConclusao: 0 });
  });

  it("taxa é inteiro arredondado sobre quem começou", () => {
    const rows = [row({}, { concluida: true }), row({}, { concluida: true }), row({})];
    expect(funil(rows)).toEqual({ comecaram: 3, concluiram: 2, taxaConclusao: 67 });
  });

  it("todo mundo concluindo dá 100", () => {
    expect(funil([row({}, { concluida: true })]).taxaConclusao).toBe(100);
  });
});

describe("abandonoPorPergunta", () => {
  const perguntas = [
    { id: "p1", ordem: 1, titulo: "Um" },
    { id: "p2", ordem: 2, titulo: "Dois" },
    { id: "p3", ordem: 3, titulo: "Três" },
  ];

  it("conta só quem NÃO concluiu, pela última pergunta respondida", () => {
    const rows = [
      row({}, { progresso: 3, concluida: true }),
      row({}, { progresso: 1 }),
      row({}, { progresso: 1 }),
      row({}, { progresso: 2 }),
    ];
    expect(abandonoPorPergunta(rows, perguntas).map((a) => a.abandonos)).toEqual([2, 1, 0]);
  });

  it("mantém a ordem e os rótulos das perguntas, mesmo sem abandono", () => {
    expect(abandonoPorPergunta([], perguntas)).toEqual([
      { id: "p1", ordem: 1, titulo: "Um", abandonos: 0 },
      { id: "p2", ordem: 2, titulo: "Dois", abandonos: 0 },
      { id: "p3", ordem: 3, titulo: "Três", abandonos: 0 },
    ]);
  });

  it("quem abriu e não respondeu nada (progresso 0) não cai em pergunta nenhuma", () => {
    // Não há pergunta de ordem 0. Esse grupo aparece no funil, não aqui.
    const rows = [row({}, { progresso: 0 })];
    expect(abandonoPorPergunta(rows, perguntas).every((a) => a.abandonos === 0)).toBe(true);
  });
});

describe("distribuicao", () => {
  it("pergunta aberta ou sem opções não tem distribuição", () => {
    expect(distribuicao([row({ livre: "x" })], aberta)).toEqual([]);
    expect(distribuicao([row({ estagio: "a" })], { ...unica, opcoes: undefined })).toEqual([]);
  });

  it("única: percentual é sobre quem respondeu ESTA pergunta, não sobre todas as linhas", () => {
    const rows = [
      row({ estagio: "a" }),
      row({ estagio: "a" }),
      row({ estagio: "b" }),
      row({}), // pulou
      row({ estagio: ["a"] }), // formato errado pra única: ignorada
    ];
    expect(distribuicao(rows, unica)).toEqual([
      { id: "a", rotulo: "A", contagem: 2, pct: 67 },
      { id: "b", rotulo: "B", contagem: 1, pct: 33 },
      { id: "c", rotulo: "C", contagem: 0, pct: 0 },
    ]);
  });

  it("múltipla: cada marcação conta, então os percentuais podem passar de 100 somados", () => {
    const rows = [
      row({ dores: ["a", "b"] }),
      row({ dores: ["a"] }),
      row({ dores: [] }), // marcou nada: não é respondente
      row({ dores: "a" }), // string em múltipla: ignorada
    ];
    expect(distribuicao(rows, multipla)).toEqual([
      { id: "a", rotulo: "A", contagem: 2, pct: 100 },
      { id: "b", rotulo: "B", contagem: 1, pct: 50 },
      { id: "c", rotulo: "C", contagem: 0, pct: 0 },
    ]);
  });

  it("ordena da opção mais marcada pra menos marcada", () => {
    const rows = [row({ estagio: "c" }), row({ estagio: "c" }), row({ estagio: "a" })];
    expect(distribuicao(rows, unica).map((d) => d.id)).toEqual(["c", "a", "b"]);
  });

  it("sem respondentes todas as opções ficam em zero", () => {
    expect(distribuicao([], unica).every((d) => d.contagem === 0 && d.pct === 0)).toBe(true);
  });
});

describe("respostasAbertas", () => {
  it("devolve só texto com conteúdo, sem espaços nas pontas", () => {
    const rows = [
      row({ livre: "  primeira  " }),
      row({ livre: "   " }),
      row({ livre: 42 }),
      row({}),
      row({ livre: "segunda" }),
    ];
    expect(respostasAbertas(rows, "livre")).toEqual(["primeira", "segunda"]);
  });
});

describe("filtrarPorSegmento", () => {
  const rows = [row({ estagio: "a" }), row({ estagio: "b" }), row({ estagio: ["a"] })];

  it("sem dimensão ou sem valor devolve tudo", () => {
    expect(filtrarPorSegmento(rows, "", "a")).toBe(rows);
    expect(filtrarPorSegmento(rows, "estagio", "")).toBe(rows);
  });

  it("filtra por igualdade estrita (array não bate com string)", () => {
    expect(filtrarPorSegmento(rows, "estagio", "a")).toEqual([rows[0]]);
  });
});
