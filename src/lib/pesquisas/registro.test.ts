import { describe, it, expect } from "vitest";
import {
  PESQUISAS,
  pesquisaPorSlug,
  perguntasPorId,
  totalPerguntas,
  perguntaPorOrdem,
} from "./registro";
import { discoveryNegocio } from "./discovery-negocio";
import { pesquisaPrecificacao } from "./pesquisa-precificacao";

// As pesquisas são config em código. O id da pergunta é a chave em
// pesquisa_respostas.respostas e o id da opção é o valor gravado: repetir um
// deles mistura resposta de duas perguntas no mesmo campo, em silêncio.

const VOCABULARIO_MORTO =
  /\b[Ee]tapa|\b[Tt]rilha|\b[Jj]ornada|[Nn]o seu ritmo|[Nn]o seu tempo|[Dd]o seu jeito|[Ii]nfoproduto|\bDani\b|\bComeço\b|\bAlcance\b|\bVoo\b|\bConfere\b|\bControle\b|\bProjete\b|\b[Tt]urma\b|[Cc]arimbo|[Bb]ússola|[Tt]erritório|[Rr]aposa/;

describe("registro", () => {
  it("lista as duas pesquisas, com slugs únicos em kebab-case", () => {
    expect(PESQUISAS).toEqual([discoveryNegocio, pesquisaPrecificacao]);
    const slugs = PESQUISAS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("pesquisaPorSlug acha pelo slug e devolve undefined pro resto", () => {
    expect(pesquisaPorSlug("discovery-negocio")).toBe(discoveryNegocio);
    expect(pesquisaPorSlug("nao-existe")).toBeUndefined();
  });

  it("perguntasPorId indexa toda pergunta pelo id", () => {
    const mapa = perguntasPorId(discoveryNegocio);
    expect(Object.keys(mapa)).toHaveLength(totalPerguntas(discoveryNegocio));
    expect(mapa.estagio.ordem).toBe(1);
  });

  it("perguntaPorOrdem acha pela ordem e devolve undefined fora da faixa", () => {
    expect(perguntaPorOrdem(discoveryNegocio, 1)?.id).toBe("estagio");
    expect(perguntaPorOrdem(discoveryNegocio, 0)).toBeUndefined();
    expect(perguntaPorOrdem(discoveryNegocio, 999)).toBeUndefined();
  });
});

describe.each(PESQUISAS.map((p) => [p.slug, p] as const))("pesquisa %s", (_slug, config) => {
  const perguntas = config.perguntas;

  it("ids de pergunta são únicos", () => {
    const ids = perguntas.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ordem é contígua de 1 a n, sem buraco", () => {
    // progresso em pesquisa_respostas é a ordem da última respondida;
    // buraco na sequência trava a pessoa no meio.
    expect(perguntas.map((p) => p.ordem)).toEqual(perguntas.map((_, i) => i + 1));
  });

  it("parte 1 vem inteira antes da parte 2", () => {
    const partes = perguntas.map((p) => p.parte);
    const primeiraDaParte2 = partes.indexOf(2);
    if (primeiraDaParte2 >= 0) {
      expect(partes.slice(primeiraDaParte2).every((x) => x === 2)).toBe(true);
    }
  });

  it("única e múltipla têm ao menos 2 opções com ids únicos; aberta não tem opções", () => {
    for (const p of perguntas) {
      if (p.tipo === "aberta") {
        expect(p.opcoes, p.id).toBeUndefined();
        continue;
      }
      expect(p.opcoes?.length ?? 0, p.id).toBeGreaterThanOrEqual(2);
      const ids = p.opcoes!.map((o) => o.id);
      expect(new Set(ids).size, p.id).toBe(ids.length);
    }
  });

  it("maxSelecoes nunca passa do número de opções", () => {
    for (const p of perguntas) {
      if (p.tipo === "multipla" && p.maxSelecoes !== undefined) {
        expect(p.maxSelecoes, p.id).toBeLessThanOrEqual(p.opcoes!.length);
      }
    }
  });

  it("pergunta sensível (LGPD) é sempre opcional", () => {
    for (const p of perguntas) {
      if (p.sensivel) expect(p.opcional, p.id).toBe(true);
    }
  });

  it("todo texto visível está limpo: sem vocabulário morto, travessão, exclamação ou emoji", () => {
    for (const p of perguntas) {
      const textos = [
        p.titulo,
        p.ajuda ?? "",
        p.placeholder ?? "",
        ...(p.opcoes ?? []).map((o) => o.rotulo),
      ];
      for (const t of textos) {
        expect(t, p.id).not.toMatch(VOCABULARIO_MORTO);
        expect(t, p.id).not.toMatch(/—|!|\p{Extended_Pictographic}/u);
      }
    }
  });
});
