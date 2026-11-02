import { describe, it, expect } from "vitest";
import { pesquisaGestao } from "./pesquisa-gestao";
import { discoveryNegocio } from "./discovery-negocio";

// Os invariantes genéricos rodam em registro.test.ts. Aqui: o que é regra
// específica da pesquisa de gestão (novembro/2026).
describe("pesquisaGestao", () => {
  const porId = Object.fromEntries(pesquisaGestao.perguntas.map((p) => [p.id, p]));

  it("tem 14 perguntas e slug próprio", () => {
    expect(pesquisaGestao.slug).toBe("pesquisa-gestao");
    expect(pesquisaGestao.perguntas).toHaveLength(14);
  });

  // Um link só pra dois públicos: a primeira pergunta é o que separa quem já
  // criou conta de quem chegou pelos grupos.
  it("abre perguntando se a pessoa já criou conta, e é obrigatória", () => {
    expect(pesquisaGestao.perguntas[0].id).toBe("conta_polia");
    expect(porId.conta_polia.opcional).toBeFalsy();
  });

  it("o bloco de quem criou conta é opcional, pra quem não criou pular", () => {
    for (const id of ["polia_procurava", "polia_voltou", "polia_faltou"]) {
      expect(porId[id].opcional, id).toBe(true);
    }
  });

  it("o número de WhatsApp é dado sensível e fica na parte 2", () => {
    expect(porId.conversa_whatsapp.sensivel).toBe(true);
    expect(porId.conversa_whatsapp.parte).toBe(2);
  });

  it("perguntas em comum com a discovery mantêm os mesmos ids de opção", () => {
    const discoveryPorId = Object.fromEntries(discoveryNegocio.perguntas.map((p) => [p.id, p]));
    for (const id of ["categoria", "quem_toca"]) {
      expect(
        porId[id].opcoes!.map((o) => o.id),
        id,
      ).toEqual(discoveryPorId[id].opcoes!.map((o) => o.id));
    }
  });
});

// O brinde vira link /planos?codigo=: o formato tem que passar no schema do
// /planos (A-Z, 0-9, _ e -, até 40), senão o código cai e a pessoa vê preço cheio.
describe("brinde da pesquisa de gestão", () => {
  it("é Premium com código no formato aceito pelo /planos", () => {
    expect(pesquisaGestao.brinde?.plano).toBe("premium");
    expect(pesquisaGestao.brinde?.codigo).toMatch(/^[A-Za-z0-9_-]{1,40}$/);
  });

  it("copy do brinde sem exclamação, travessão ou emoji", () => {
    const b = pesquisaGestao.brinde!;
    for (const t of [b.titulo, b.texto, b.rotulo]) {
      expect(t).not.toMatch(/[—!]/);
      expect(t).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});
