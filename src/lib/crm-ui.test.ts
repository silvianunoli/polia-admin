import { describe, it, expect, vi, afterEach } from "vitest";
import {
  STATUS_META,
  FASE_META,
  ORIGEM_LABEL,
  CANAL_LABEL,
  TIPO_TAREFA_LABEL,
  rotulo,
  primeiroNome,
  aplicarVariaveis,
  linkWhatsApp,
  formatarTelefone,
  formatarData,
  formatarDataHora,
  formatarReais,
  diasDesde,
  hojeISO,
} from "./crm-ui";

const semNbsp = (s: string) => s.split(String.fromCharCode(160)).join(" ");

afterEach(() => {
  vi.useRealTimers();
});

describe("rótulos do CRM", () => {
  const VOCABULARIO_MORTO =
    /\b[Ee]tapa|\b[Tt]rilha|\b[Jj]ornada|[Nn]o seu ritmo|[Ii]nfoproduto|\bDani\b|\bComeço\b|\bAlcance\b|\bVoo\b|\bConfere\b|\bControle\b|\bProjete\b/;

  it("nenhum rótulo visível usa vocabulário morto, travessão, exclamação ou emoji", () => {
    const labels = [
      ...Object.values(STATUS_META).map((m) => m.label),
      ...Object.values(FASE_META).map((m) => m.label),
      ...Object.values(ORIGEM_LABEL),
      ...Object.values(CANAL_LABEL),
      ...Object.values(TIPO_TAREFA_LABEL),
    ];
    for (const label of labels) {
      expect(label).not.toMatch(VOCABULARIO_MORTO);
      expect(label).not.toMatch(/—|!|\p{Extended_Pictographic}/u);
    }
  });

  it("badges só usam token de cor, nunca hex ou cor nomeada", () => {
    for (const m of [...Object.values(STATUS_META), ...Object.values(FASE_META)]) {
      expect(m.className).not.toMatch(/#[0-9a-f]{3,6}|bg-(red|green|yellow|blue|gray)-/i);
    }
  });

  it("rotulo: nulo vira travessão de vazio, chave desconhecida volta crua", () => {
    expect(rotulo(ORIGEM_LABEL, null)).toBe("—");
    expect(rotulo(ORIGEM_LABEL, "quiz")).toBe("Quiz");
    expect(rotulo(ORIGEM_LABEL, "tiktok")).toBe("tiktok");
  });
});

describe("primeiroNome", () => {
  it("pega a primeira palavra, ignorando espaços extras", () => {
    expect(primeiroNome("Ana Paula Souza")).toBe("Ana");
    expect(primeiroNome("   Ana   ")).toBe("Ana");
  });
});

describe("aplicarVariaveis", () => {
  it("troca {nome}, {primeiro_nome} e {negocio}", () => {
    const r = aplicarVariaveis("Oi {primeiro_nome}, {nome} da {negocio}", {
      nome: "Ana Paula",
      negocio: "Doces da Ana",
    });
    expect(r).toBe("Oi Ana, Ana Paula da Doces da Ana");
  });

  it("variável sem valor some, nunca vira 'undefined' ou 'null' no WhatsApp", () => {
    const r = aplicarVariaveis("Oi {nome}, {negocio} tá bem?", { nome: "Ana", negocio: null });
    expect(r).not.toMatch(/undefined|null/);
    expect(r).toBe("Oi Ana, tá bem?");
  });
});

describe("linkWhatsApp", () => {
  it("sem telefone ou com número curto demais não gera link", () => {
    // wa.me com número errado abre conversa com um estranho.
    expect(linkWhatsApp(null)).toBeNull();
    expect(linkWhatsApp("11999998888")).toBeNull();
  });

  it("monta wa.me só com dígitos", () => {
    expect(linkWhatsApp("+55 (11) 99999-8888")).toBe("https://wa.me/5511999998888");
  });

  it("mensagem vai codificada na query; vazia não entra", () => {
    expect(linkWhatsApp("5511999998888", "Oi, tudo bem?")).toBe(
      "https://wa.me/5511999998888?text=Oi%2C%20tudo%20bem%3F",
    );
    expect(linkWhatsApp("5511999998888", "   ")).toBe("https://wa.me/5511999998888");
  });
});

describe("formatarTelefone", () => {
  it.each([
    ["5511999998888", "(11) 99999-8888"],
    ["+55 (11) 3333-4444", "(11) 3333-4444"],
    ["11999998888", "(11) 99999-8888"],
  ])("%s -> %s", (entrada, saida) => {
    expect(formatarTelefone(entrada)).toBe(saida);
  });

  it("nulo vira travessão de vazio; tamanho estranho volta como veio", () => {
    expect(formatarTelefone(null)).toBe("—");
    expect(formatarTelefone("123")).toBe("123");
  });
});

describe("datas", () => {
  it("formatarData: data sem hora não muda de dia por causa do fuso", () => {
    // "2026-03-01" parseado como UTC vira 28/02 à noite em Brasília. A
    // função ancora ao meio-dia justamente pra isso não acontecer.
    expect(formatarData("2026-03-01")).toBe("01/03/2026");
  });

  it("formatarData e formatarDataHora: nulo ou inválido viram travessão de vazio", () => {
    expect(formatarData(null)).toBe("—");
    expect(formatarData("abc")).toBe("—");
    expect(formatarDataHora(null)).toBe("—");
    expect(formatarDataHora("abc")).toBe("—");
  });

  it("diasDesde conta dias inteiros a partir de agora", () => {
    vi.useFakeTimers({ now: Date.parse("2026-03-01T12:00:00Z") });
    expect(diasDesde("2026-02-22T12:00:00Z")).toBe(7);
    expect(diasDesde("2026-03-01T06:00:00Z")).toBe(0);
    expect(diasDesde(null)).toBeNull();
    expect(diasDesde("abc")).toBeNull();
  });

  it("hojeISO devolve YYYY-MM-DD", () => {
    // Meio-dia UTC: qualquer fuso da máquina ainda está no mesmo dia.
    vi.useFakeTimers({ now: Date.parse("2026-03-01T12:00:00Z") });
    expect(hojeISO()).toBe("2026-03-01");
  });
});

describe("formatarReais", () => {
  it("valor redondo sai sem centavos", () => {
    expect(semNbsp(formatarReais(1500))).toBe("R$ 1.500");
    expect(semNbsp(formatarReais(0))).toBe("R$ 0");
  });

  it("com centavos exatos mostra duas casas", () => {
    expect(semNbsp(formatarReais(19.99))).toBe("R$ 19,99");
  });

  // Bug documentado: minimumFractionDigits 0 + maximumFractionDigits 2 deixa
  // 19.9 virar "R$ 19,9". Em dinheiro, no Brasil, ou não tem centavo ou tem
  // dois dígitos. Quando o produto for corrigido, este it.fails passa a
  // falhar: aí é só trocar por it.
  it.fails("dez centavos redondos deveriam sair como R$ 19,90 (hoje sai R$ 19,9)", () => {
    expect(semNbsp(formatarReais(19.9))).toBe("R$ 19,90");
  });
});
