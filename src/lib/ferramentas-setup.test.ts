import { describe, it, expect } from "vitest";
import { FERRAMENTAS_SETUP, type Bloco } from "./ferramentas-setup";

// Runbook das ferramentas externas, injetado como JSON no board /estrategico.
// O que interessa provar: estrutura íntegra (o board renderiza por tipo de
// bloco) e nenhum segredo real dentro do repo.

const todosBlocos: Bloco[] = FERRAMENTAS_SETUP.flatMap((f) => [...f.passos, ...f.armadilhas]);

function textoDe(b: Bloco): string {
  if (b.tipo === "ol") return b.itens.map((i) => `${i.texto} ${i.code ?? ""}`).join(" ");
  if (b.tipo === "ul") return b.itens.join(" ");
  return b.html;
}

describe("FERRAMENTAS_SETUP", () => {
  it("são 14 ferramentas com id e nome únicos", () => {
    expect(FERRAMENTAS_SETUP).toHaveLength(14);
    expect(new Set(FERRAMENTAS_SETUP.map((f) => f.id)).size).toBe(14);
    expect(new Set(FERRAMENTAS_SETUP.map((f) => f.nome)).size).toBe(14);
  });

  it("toda ferramenta tem o que é, e pelo menos um passo", () => {
    for (const f of FERRAMENTAS_SETUP) {
      expect(f.oQueE.trim().length, f.nome).toBeGreaterThan(0);
      expect(f.passos.length, f.nome).toBeGreaterThan(0);
    }
  });

  it("todo bloco tem a forma do seu tipo", () => {
    for (const b of todosBlocos) {
      if (b.tipo === "ol") {
        expect(b.itens.length).toBeGreaterThan(0);
        for (const i of b.itens) {
          expect(typeof i.texto).toBe("string");
          expect(i.code === null || typeof i.code === "string").toBe(true);
        }
      } else if (b.tipo === "ul") {
        expect(b.itens.length).toBeGreaterThan(0);
        for (const i of b.itens) expect(typeof i).toBe("string");
      } else {
        expect(["p", "h4", "code"]).toContain(b.tipo);
        expect(typeof b.html).toBe("string");
      }
    }
  });

  it("nenhum segredo real: só o nome de onde cada um vive", () => {
    const tudo = [...FERRAMENTAS_SETUP.map((f) => f.oQueE), ...todosBlocos.map(textoDe)].join("\n");
    expect(tudo).not.toMatch(/sk_live_[A-Za-z0-9]{8,}/);
    expect(tudo).not.toMatch(/sk_test_[A-Za-z0-9]{8,}/);
    expect(tudo).not.toMatch(/whsec_[A-Za-z0-9]{8,}/);
    expect(tudo).not.toMatch(/\bre_[A-Za-z0-9]{16,}/);
    expect(tudo).not.toMatch(/AIza[0-9A-Za-z_-]{30,}/);
    expect(tudo).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  });

  // Vocabulário morto: ferramentas-setup.ts:237 diz "planos
  // Confere/Controle/Projete". Desde 14/09/2026 os nomes visíveis são
  // Grátis/Premium/Pro; a chave interna (confere/controle/projete) fica só em
  // minúscula, em código. Quando o texto for corrigido, este it.fails passa a
  // falhar: aí é só trocar por it.
  it.fails("nenhum texto visível usa nome morto de plano (hoje: Stripe, oQueE)", () => {
    for (const f of FERRAMENTAS_SETUP) {
      expect(f.oQueE, f.nome).not.toMatch(
        /\bComeço\b|\bAlcance\b|\bVoo\b|Confere|Controle|Projete/,
      );
    }
  });
});
