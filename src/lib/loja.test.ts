import { describe, expect, it } from "vitest";
import {
  briefingEmLinhas,
  centavosParaCampo,
  cupomSchema,
  ehUrlDaLoja,
  formatarCentavos,
  linkWhatsAppPedido,
  nomeArquivoSeguro,
  podeMudarStatus,
  produtoSchema,
  reaisParaCentavos,
  situacaoCupom,
  slugify,
  slugLivre,
  STATUS_PEDIDO,
  TRANSICOES_STATUS,
  validarArquivoImagem,
  validarCupom,
  type CupomRegra,
  type ProdutoInput,
} from "./loja";

function centavos(texto: string): number | null {
  const r = reaisParaCentavos(texto);
  if (!r.ok) throw new Error(`esperava ok para "${texto}", veio: ${r.erro}`);
  return r.centavos;
}

describe("reaisParaCentavos", () => {
  it("vírgula decimal, do jeito brasileiro", () => {
    expect(centavos("29,90")).toBe(2990);
    expect(centavos("29,9")).toBe(2990);
    expect(centavos("0,01")).toBe(1);
    expect(centavos(",50")).toBe(50);
  });

  it("milhar com ponto e centavos com vírgula", () => {
    expect(centavos("1.234,56")).toBe(123456);
    expect(centavos("R$ 1.290,00")).toBe(129000);
    expect(centavos("12.345")).toBe(1234500);
  });

  it("só ponto: grupos de 3 são milhar, senão é decimal", () => {
    expect(centavos("1.500")).toBe(150000);
    expect(centavos("29.90")).toBe(2990);
    expect(centavos("29.9")).toBe(2990);
  });

  it("número inteiro e vazio", () => {
    expect(centavos("290")).toBe(29000);
    expect(centavos("0")).toBe(0);
    expect(centavos("")).toBeNull();
    expect(centavos("   ")).toBeNull();
    expect(centavos("R$")).toBeNull();
  });

  it("não usa float: 0,29 e 1,15 não perdem centavo", () => {
    expect(centavos("0,29")).toBe(29);
    expect(centavos("1,15")).toBe(115);
    expect(centavos("4,35")).toBe(435);
  });

  it("recusa lixo, três casas decimais, negativo e valor acima do teto", () => {
    expect(reaisParaCentavos("abc").ok).toBe(false);
    expect(reaisParaCentavos("29,999").ok).toBe(false);
    expect(reaisParaCentavos("-10").ok).toBe(false);
    expect(reaisParaCentavos("1,2,3").ok).toBe(false);
    expect(reaisParaCentavos("100.000,01").ok).toBe(false);
    expect(reaisParaCentavos("100.000,00").ok).toBe(true);
  });
});

describe("formatarCentavos / centavosParaCampo", () => {
  it("formata com milhar e duas casas", () => {
    expect(formatarCentavos(2990)).toBe("R$ 29,90");
    expect(formatarCentavos(123456)).toBe("R$ 1.234,56");
    expect(formatarCentavos(0)).toBe("R$ 0,00");
    expect(formatarCentavos(100000000)).toBe("R$ 1.000.000,00");
  });

  it("null é sob orçamento", () => {
    expect(formatarCentavos(null)).toBe("Sob orçamento");
  });

  it("campo de edição faz ida e volta sem perder centavo", () => {
    for (const v of [0, 1, 29, 2990, 123456, 10_000_000]) {
      expect(centavos(centavosParaCampo(v))).toBe(v);
    }
    expect(centavosParaCampo(null)).toBe("");
  });
});

describe("slugify", () => {
  it("tira acento, pontuação e espaço", () => {
    expect(slugify("Identidade Visual: Pacote Básico")).toBe("identidade-visual-pacote-basico");
    expect(slugify("  Fotos  & Vídeo  ")).toBe("fotos-video");
    expect(slugify("Ação já!!!")).toBe("acao-ja");
  });

  it("não deixa hífen nas pontas nem repetido", () => {
    expect(slugify("--a---b--")).toBe("a-b");
    expect(slugify("...")).toBe("");
  });

  it("corta em 80 caracteres sem terminar em hífen", () => {
    const s = slugify("palavra ".repeat(30));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });

  it("slugLivre acha o próximo sufixo livre", () => {
    expect(slugLivre("Logo", [])).toBe("logo");
    expect(slugLivre("Logo", ["logo"])).toBe("logo-2");
    expect(slugLivre("Logo", ["logo", "logo-2", "logo-3"])).toBe("logo-4");
    expect(slugLivre("", [])).toBe("produto");
  });
});

describe("imagens", () => {
  it("aceita só jpeg/png/webp/avif até 5 MB", () => {
    expect(validarArquivoImagem({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(validarArquivoImagem({ type: "image/avif", size: 5 * 1024 * 1024 })).toBeNull();
    expect(validarArquivoImagem({ type: "image/gif", size: 1000 })).not.toBeNull();
    expect(validarArquivoImagem({ type: "image/svg+xml", size: 1000 })).not.toBeNull();
    expect(validarArquivoImagem({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).not.toBeNull();
    expect(validarArquivoImagem({ type: "image/png", size: 0 })).not.toBeNull();
  });

  it("nome seguro: prefixo uuid, sem caminho, extensão pelo tipo", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(nomeArquivoSeguro("Foto Capa Ótima.PNG", "image/png", uuid)).toBe(
      `${uuid}-foto-capa-otima.png`,
    );
    expect(nomeArquivoSeguro("../../etc/passwd.jpg", "image/webp", uuid)).toBe(
      `${uuid}-passwd.webp`,
    );
    expect(nomeArquivoSeguro("C:\\fotos\\x.jpeg", "image/jpeg", uuid)).toBe(`${uuid}-x.jpg`);
    expect(nomeArquivoSeguro("....", "image/avif", uuid)).toBe(`${uuid}-imagem.avif`);
    expect(nomeArquivoSeguro("a.svg", "image/svg+xml", uuid)).toMatch(/\.jpg$/);
  });

  it("URL só do bucket da loja", () => {
    expect(
      ehUrlDaLoja(
        "https://egzwkyqpkexgrhbxwcvb.supabase.co/storage/v1/object/public/loja-imagens/p/a.jpg",
      ),
    ).toBe(true);
    expect(
      ehUrlDaLoja(
        "https://egzwkyqpkexgrhbxwcvb.supabase.co/storage/v1/object/public/blog-media/a.jpg",
      ),
    ).toBe(false);
    expect(ehUrlDaLoja("javascript:alert(1)")).toBe(false);
    expect(ehUrlDaLoja("http://x.com/storage/v1/object/public/loja-imagens/a.jpg")).toBe(false);
  });
});

describe("validarCupom", () => {
  const base: CupomRegra = {
    codigo: "BEMVINDA",
    tipo: "percentual",
    valor: 10,
    ativo: true,
    valido_ate: null,
    usos_maximos: null,
    usos: 0,
  };
  const agora = new Date("2026-10-01T12:00:00Z");

  it("percentual arredonda pra baixo", () => {
    expect(validarCupom(base, 2990, agora)).toEqual({ valido: true, descontoCentavos: 299 });
    expect(validarCupom({ ...base, valor: 15 }, 999, agora)).toEqual({
      valido: true,
      descontoCentavos: 149,
    });
  });

  it("valor fixo nunca passa do subtotal", () => {
    const fixo = { ...base, tipo: "valor_fixo" as const, valor: 5000 };
    expect(validarCupom(fixo, 2990, agora)).toEqual({ valido: true, descontoCentavos: 2990 });
    expect(validarCupom(fixo, 10000, agora)).toEqual({ valido: true, descontoCentavos: 5000 });
  });

  it("recusa desligado, vencido e esgotado", () => {
    expect(validarCupom({ ...base, ativo: false }, 1000, agora)).toEqual({
      valido: false,
      motivo: "inativo",
    });
    expect(validarCupom({ ...base, valido_ate: "2026-09-30T23:59:59Z" }, 1000, agora)).toEqual({
      valido: false,
      motivo: "vencido",
    });
    expect(validarCupom({ ...base, usos_maximos: 3, usos: 3 }, 1000, agora)).toEqual({
      valido: false,
      motivo: "esgotado",
    });
    expect(validarCupom({ ...base, usos_maximos: 3, usos: 2 }, 1000, agora).valido).toBe(true);
    expect(validarCupom({ ...base, valido_ate: "2026-10-02T00:00:00Z" }, 1000, agora).valido).toBe(
      true,
    );
  });

  it("desconto zero não vale", () => {
    expect(validarCupom({ ...base, valor: 1 }, 50, agora)).toEqual({
      valido: false,
      motivo: "sem_valor",
    });
  });

  it("situacaoCupom resume pra lista", () => {
    expect(situacaoCupom(base, agora)).toBe("ativo");
    expect(situacaoCupom({ ...base, ativo: false }, agora)).toBe("inativo");
    expect(situacaoCupom({ ...base, usos_maximos: 1, usos: 1 }, agora)).toBe("esgotado");
  });

  it("schema normaliza código e limita percentual", () => {
    const ok = cupomSchema.parse({
      codigo: " bem vinda ",
      tipo: "percentual",
      valor: 10,
      ativo: true,
      valido_ate: null,
      usos_maximos: null,
    });
    expect(ok.codigo).toBe("BEMVINDA");
    expect(cupomSchema.safeParse({ ...ok, valor: 101 }).success).toBe(false);
    expect(cupomSchema.safeParse({ ...ok, codigo: "a!" }).success).toBe(false);
    expect(cupomSchema.safeParse({ ...ok, tipo: "valor_fixo", valor: 101 }).success).toBe(true);
  });
});

describe("transições de status do pedido", () => {
  it("não pago só confirma ou cancela", () => {
    expect(podeMudarStatus("aguardando_pagamento", "pago")).toBe(true);
    expect(podeMudarStatus("aguardando_pagamento", "cancelado")).toBe(true);
    expect(podeMudarStatus("aguardando_pagamento", "entregue")).toBe(false);
    expect(podeMudarStatus("aguardando_pagamento", "reembolsado")).toBe(false);
  });

  it("pago não cancela, reembolsa", () => {
    expect(podeMudarStatus("pago", "cancelado")).toBe(false);
    expect(podeMudarStatus("pago", "reembolsado")).toBe(true);
    expect(podeMudarStatus("pago", "em_andamento")).toBe(true);
    expect(podeMudarStatus("pago", "aguardando_pagamento")).toBe(false);
  });

  it("cancelado e reembolsado são finais", () => {
    for (const s of STATUS_PEDIDO) {
      expect(podeMudarStatus("cancelado", s)).toBe(false);
      expect(podeMudarStatus("reembolsado", s)).toBe(false);
    }
  });

  it("nenhum status vai pra ele mesmo e nada volta pra aguardando pagamento", () => {
    for (const s of STATUS_PEDIDO) {
      expect(TRANSICOES_STATUS[s]).not.toContain(s);
      expect(TRANSICOES_STATUS[s]).not.toContain("aguardando_pagamento");
    }
  });
});

describe("linkWhatsAppPedido", () => {
  it("põe 55 em número brasileiro sem DDI", () => {
    expect(linkWhatsAppPedido("(11) 99999-8888")).toBe("https://wa.me/5511999998888");
    expect(linkWhatsAppPedido("+55 11 99999-8888", "Oi, tudo bem?")).toBe(
      "https://wa.me/5511999998888?text=Oi%2C%20tudo%20bem%3F",
    );
  });

  it("recusa número curto ou vazio", () => {
    expect(linkWhatsAppPedido(null)).toBeNull();
    expect(linkWhatsAppPedido("99999")).toBeNull();
  });
});

describe("briefingEmLinhas", () => {
  it("objeto vira pergunta e resposta", () => {
    expect(briefingEmLinhas({ nome_da_marca: "Ateliê Lua", cores: ["azul", "rosa"] })).toEqual([
      { rotulo: "nome da marca", valor: "Ateliê Lua" },
      { rotulo: "cores", valor: "azul, rosa" },
    ]);
  });

  it("lista de pergunta/resposta", () => {
    expect(briefingEmLinhas([{ pergunta: "Prazo?", resposta: "Sem pressa" }, "solto"])).toEqual([
      { rotulo: "Prazo?", valor: "Sem pressa" },
      { rotulo: "Resposta 2", valor: "solto" },
    ]);
  });

  it("vazio e texto cru", () => {
    expect(briefingEmLinhas(null)).toEqual([]);
    expect(briefingEmLinhas("oi")).toEqual([{ rotulo: "Briefing", valor: "oi" }]);
  });
});

describe("produtoSchema", () => {
  const url =
    "https://egzwkyqpkexgrhbxwcvb.supabase.co/storage/v1/object/public/loja-imagens/x/a.jpg";
  const base: ProdutoInput = {
    nome: "Logo",
    slug: "logo",
    categoria_id: null,
    resumo: "",
    descricao: "",
    preco_centavos: 29000,
    preco_original_centavos: null,
    prazo_entrega: null,
    itens: [],
    imagens: [{ url, alt: "" }],
    capa_url: url,
    destaque: false,
    publicado: false,
    exige_briefing: true,
    preco_sugerido: false,
  };

  it("aceita produto válido e sob orçamento", () => {
    expect(produtoSchema.safeParse(base).success).toBe(true);
    expect(produtoSchema.safeParse({ ...base, preco_centavos: null }).success).toBe(true);
  });

  it("preço riscado precisa ser maior e precisa de preço", () => {
    expect(produtoSchema.safeParse({ ...base, preco_original_centavos: 29000 }).success).toBe(
      false,
    );
    expect(produtoSchema.safeParse({ ...base, preco_original_centavos: 39000 }).success).toBe(true);
    expect(
      produtoSchema.safeParse({ ...base, preco_centavos: null, preco_original_centavos: 39000 })
        .success,
    ).toBe(false);
  });

  it("capa tem que estar na galeria e imagem tem que ser do bucket", () => {
    expect(
      produtoSchema.safeParse({ ...base, capa_url: url.replace("a.jpg", "b.jpg") }).success,
    ).toBe(false);
    expect(
      produtoSchema.safeParse({
        ...base,
        imagens: [{ url: "https://evil.com/a.jpg", alt: "" }],
        capa_url: null,
      }).success,
    ).toBe(false);
  });

  it("slug fora do padrão não passa", () => {
    expect(produtoSchema.safeParse({ ...base, slug: "Logo Novo" }).success).toBe(false);
    expect(produtoSchema.safeParse({ ...base, slug: "logo-" }).success).toBe(false);
  });
});
