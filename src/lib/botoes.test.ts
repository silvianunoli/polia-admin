import { describe, it, expect } from "vitest";
import * as botoes from "./botoes";

// Módulo de constantes: só duas regras valem teste, as duas vindas da
// auditoria de design system de 03/09.

describe("botoes", () => {
  it("todo botão tem cursor-pointer explícito (o preflight do Tailwind v4 põe cursor:default)", () => {
    for (const cls of [botoes.BTN_PRIMARIO, botoes.BTN_SECUNDARIO, botoes.BTN_LINK]) {
      expect(cls.split(" ")).toContain("cursor-pointer");
    }
  });

  it("header de tabela é DM Sans (font-accent), como todo label em caixa alta", () => {
    expect(botoes.TH_CLASS).toContain("font-accent");
    expect(botoes.TH_CLASS).toContain("uppercase");
    expect(botoes.TH_CLASS).not.toContain("font-sans");
  });

  it("nenhuma classe carrega hex ou cor nomeada do Tailwind: só token", () => {
    for (const [nome, cls] of Object.entries(botoes)) {
      expect(cls, nome).not.toMatch(
        /#[0-9a-f]{3,6}|(bg|text|border)-(red|green|yellow|blue|gray|slate)-/i,
      );
    }
  });
});
