import { describe, it, expect } from "vitest";
import { PLANOS_CONVITE } from "./planos-convite";
import { NOME_PLANO } from "./founder-formato";

// Esta lista alimenta o select de /crm/convites, o enum do zod no servidor e
// o nome do plano que vai no e-mail de convite. Nome morto aqui vira nome
// morto na caixa de entrada de quem ainda nem conhece a Pólia.
const NOMES_MORTOS = /Começo|Alcance|Voo|Confere|Controle|Projete/;

describe("PLANOS_CONVITE", () => {
  it("são exatamente as 4 chaves internas, na ordem do produto", () => {
    expect(PLANOS_CONVITE.map((p) => p.valor)).toEqual(["confere", "controle", "projete", "beta"]);
  });

  it("não inclui 'cancelada': é estado do webhook, não plano que se libera", () => {
    expect(PLANOS_CONVITE.some((p) => (p.valor as string) === "cancelada")).toBe(false);
  });

  it.each([
    ["confere", "plano Grátis"],
    ["controle", "plano Premium"],
    ["projete", "plano Pro"],
    ["beta", "acesso completo"],
  ])("no e-mail, %s é chamado de '%s'", (valor, nomeNoEmail) => {
    expect(PLANOS_CONVITE.find((p) => p.valor === valor)?.nomeNoEmail).toBe(nomeNoEmail);
  });

  it("o nome no e-mail bate com o rótulo visível do Founder (NOME_PLANO)", () => {
    // Duas fontes pro mesmo nome é convite pra divergir. Aqui a gente prende
    // uma na outra.
    for (const valor of ["confere", "controle", "projete"] as const) {
      const plano = PLANOS_CONVITE.find((p) => p.valor === valor)!;
      expect(plano.nomeNoEmail).toBe(`plano ${NOME_PLANO[valor]}`);
    }
  });

  it("nenhum texto visível usa nome morto de plano", () => {
    for (const p of PLANOS_CONVITE) {
      expect(p.explicacao, p.valor).not.toMatch(NOMES_MORTOS);
      expect(p.nomeNoEmail, p.valor).not.toMatch(NOMES_MORTOS);
    }
  });

  it("explicação sem travessão, exclamação ou emoji", () => {
    for (const p of PLANOS_CONVITE) {
      expect(p.explicacao).not.toMatch(/—|!|\p{Extended_Pictographic}/u);
    }
  });
});
