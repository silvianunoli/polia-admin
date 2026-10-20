import { describe, expect, it } from "vitest";
import {
  diaMesBRT,
  resumirTestesPro,
  rotuloPlano,
  testeAberto,
  testesAbertosPorUsuaria,
  type TesteProLinha,
} from "./teste-pro";

// GRW-66: teste de 7 dias do Pro. Aberto = encerrado_em nulo e fim no futuro.
const AGORA = Date.parse("2026-10-20T15:00:00.000Z");

function teste(parcial: Partial<TesteProLinha> & { user_id: string }): TesteProLinha {
  return {
    inicio: "2026-10-20T12:00:00.000Z",
    fim: "2026-10-27T12:00:00.000Z",
    origem: "cadastro",
    encerrado_em: null,
    resultado: null,
    ...parcial,
  };
}

const ENCERRADO = "2026-10-20T13:00:00.000Z";

describe("testeAberto", () => {
  it("aberto quando não foi encerrado e o fim ainda não chegou", () => {
    expect(testeAberto(teste({ user_id: "a" }), AGORA)).toBe(true);
  });

  it("fechado quando já tem encerrado_em, mesmo com o fim no futuro", () => {
    expect(
      testeAberto(teste({ user_id: "a", encerrado_em: ENCERRADO, resultado: "assinou" }), AGORA),
    ).toBe(false);
  });

  it("fechado quando o fim passou, mesmo sem o cron ter rodado", () => {
    expect(testeAberto(teste({ user_id: "a", fim: "2026-10-20T14:59:59.000Z" }), AGORA)).toBe(
      false,
    );
  });

  it("fim exatamente agora já não é aberto (fim > now)", () => {
    expect(testeAberto(teste({ user_id: "a", fim: "2026-10-20T15:00:00.000Z" }), AGORA)).toBe(
      false,
    );
  });

  it("fim ilegível não é aberto", () => {
    expect(testeAberto(teste({ user_id: "a", fim: "lixo" }), AGORA)).toBe(false);
  });
});

describe("testesAbertosPorUsuaria", () => {
  it("mapeia só os abertos, com a data de fim", () => {
    const m = testesAbertosPorUsuaria(
      [
        teste({ user_id: "aberta" }),
        teste({ user_id: "assinou", encerrado_em: ENCERRADO, resultado: "assinou" }),
        teste({ user_id: "vencida", fim: "2026-10-19T12:00:00.000Z" }),
      ],
      AGORA,
    );
    expect([...m.entries()]).toEqual([["aberta", "2026-10-27T12:00:00.000Z"]]);
  });
});

describe("rotuloPlano", () => {
  it("Pro em teste aberto mostra a data de fim em Brasília", () => {
    // 27/10 02:00 UTC ainda é 26/10 em Brasília
    expect(rotuloPlano("projete", "2026-10-27T02:00:00.000Z")).toBe("Pro (teste até 26/10)");
    expect(diaMesBRT("2026-10-27T12:00:00.000Z")).toBe("27/10");
  });

  it("sem teste, nome normal do plano", () => {
    expect(rotuloPlano("projete", null)).toBe("Pro");
    expect(rotuloPlano("confere")).toBe("Grátis");
  });

  it("plano mudado à mão no meio do teste mostra o plano real", () => {
    expect(rotuloPlano("controle", "2026-10-27T12:00:00.000Z")).toBe("Premium");
  });
});

describe("resumirTestesPro", () => {
  it("separa em teste, encerrados, assinaram e calcula a conversão sobre os encerrados", () => {
    const r = resumirTestesPro(
      [
        teste({ user_id: "a" }),
        teste({ user_id: "b" }),
        teste({ user_id: "c", encerrado_em: ENCERRADO, resultado: "assinou" }),
        teste({ user_id: "d", encerrado_em: ENCERRADO, resultado: "voltou_gratis" }),
        teste({ user_id: "e", encerrado_em: ENCERRADO, resultado: "voltou_gratis" }),
        teste({ user_id: "f", fim: "2026-10-20T14:00:00.000Z" }),
      ],
      AGORA,
    );
    expect(r).toEqual({
      emTeste: 2,
      encerrados: 3,
      assinaram: 1,
      voltaramGratis: 2,
      aguardandoFechamento: 1,
      taxaConversao: (1 / 3) * 100,
    });
  });

  it("sem nenhum encerrado a conversão é null, não zero", () => {
    expect(resumirTestesPro([teste({ user_id: "a" })], AGORA).taxaConversao).toBeNull();
    expect(resumirTestesPro([], AGORA)).toEqual({
      emTeste: 0,
      encerrados: 0,
      assinaram: 0,
      voltaramGratis: 0,
      aguardandoFechamento: 0,
      taxaConversao: null,
    });
  });
});
