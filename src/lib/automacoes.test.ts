import { describe, it, expect } from "vitest";
import {
  LINK_WHATSAPP_FALA,
  automacaoComentarioEmBranco,
  automacaoSchema,
  guiadoEmBranco,
  guiadoParaPassos,
  passosParaGuiado,
  botaoEscolhido,
  gatilhoCasa,
  interpolar,
  modeloFalaInstagram,
  modeloFalaWhatsapp,
  payloadBotao,
  proximoIndice,
  respostaValida,
  type Passo,
} from "@/lib/automacoes";

describe("modelos do FALA", () => {
  it("os dois modelos passam na mesma validação que a tela usa ao salvar", () => {
    expect(automacaoSchema.safeParse(modeloFalaInstagram()).success).toBe(true);
    expect(automacaoSchema.safeParse(modeloFalaWhatsapp()).success).toBe(true);
  });

  it("o briefing guarda as respostas de botão (o ManyChat de hoje não guarda)", () => {
    const campos = modeloFalaWhatsapp()
      .passos.map((p) => ("salvar_em" in p ? p.salvar_em : null))
      .filter(Boolean);
    expect(campos).toEqual([
      "resposta_ta_caro",
      "marca_instagram",
      "produto_marca",
      "onde_vende",
      "faturamento",
      "prazo",
    ]);
  });

  it("nascem desligados", () => {
    expect(modeloFalaInstagram().ativa).toBe(false);
    expect(modeloFalaWhatsapp().ativa).toBe(false);
  });
});

describe("automacaoSchema", () => {
  const base = modeloFalaWhatsapp();

  it("recusa gatilho de comentário fora do Instagram", () => {
    const r = automacaoSchema.safeParse({
      ...base,
      canal: "whatsapp",
      gatilho: { tipo: "comentario", posts: [], palavras: [], respostas_publicas: [] },
    });
    expect(r.success).toBe(false);
  });

  it("recusa botão que pula pra passo inexistente e botão com mais de 20 letras", () => {
    const passos = structuredClone(base.passos);
    const p4 = passos.find((p) => p.id === "p4") as Extract<Passo, { tipo: "mensagem" }>;
    p4.botoes[0].ir_para = "nao-existe";
    expect(automacaoSchema.safeParse({ ...base, passos }).success).toBe(false);

    const passos2 = structuredClone(base.passos);
    (passos2.find((p) => p.id === "p4") as Extract<Passo, { tipo: "mensagem" }>).botoes[0].titulo =
      "um texto bem maior que vinte";
    expect(automacaoSchema.safeParse({ ...base, passos: passos2 }).success).toBe(false);
  });

  it("recusa automação sem passo e palavra-chave vazia", () => {
    expect(automacaoSchema.safeParse({ ...base, passos: [] }).success).toBe(false);
    expect(
      automacaoSchema.safeParse({
        ...base,
        gatilho: { tipo: "palavra_chave", palavras: [], modo: "contem" },
      }).success,
    ).toBe(false);
  });
});

describe("gatilhoCasa", () => {
  const comentario = (texto: string, mediaId = "M1") => ({
    canal: "instagram" as const,
    tipo: "comentario",
    texto,
    mediaId,
  });

  it("comentário: palavra sem acento nem maiúscula, e filtro por post", () => {
    const g = {
      tipo: "comentario" as const,
      posts: ["M1"],
      palavras: ["fala"],
      respostas_publicas: [],
      proximo_post: false,
      proximo_desde: null,
      guiado: false,
    };
    expect(gatilhoCasa(g, comentario("FALA!"))).toBe(true);
    expect(gatilhoCasa(g, comentario("Fála comigo"))).toBe(true);
    expect(gatilhoCasa(g, comentario("FALA", "OUTRO"))).toBe(false);
    expect(gatilhoCasa(g, comentario("amei"))).toBe(false);
  });

  it("comentário sem filtro casa qualquer comentário, mas nunca uma DM", () => {
    const g = {
      tipo: "comentario" as const,
      posts: [],
      palavras: [],
      respostas_publicas: [],
      proximo_post: false,
      proximo_desde: null,
      guiado: false,
    };
    expect(gatilhoCasa(g, comentario("qualquer coisa"))).toBe(true);
    expect(gatilhoCasa(g, { canal: "instagram", tipo: "texto", texto: "oi", mediaId: null })).toBe(
      false,
    );
  });

  it("palavra-chave: contém ou exata, e comentário não dispara palavra-chave", () => {
    const contem = {
      tipo: "palavra_chave" as const,
      palavras: ["Comentei FALA"],
      modo: "contem" as const,
    };
    const exata = { tipo: "palavra_chave" as const, palavras: ["preço"], modo: "exata" as const };
    const msg = (texto: string, tipo = "texto") => ({
      canal: "whatsapp" as const,
      tipo,
      texto,
      mediaId: null,
    });
    expect(gatilhoCasa(contem, msg("Oi! comentei fala no post"))).toBe(true);
    expect(gatilhoCasa(exata, msg("Preco"))).toBe(true);
    expect(gatilhoCasa(exata, msg("qual o preço?"))).toBe(false);
    expect(gatilhoCasa(contem, msg("Comentei FALA", "comentario"))).toBe(false);
    expect(gatilhoCasa(contem, msg("Comentei FALA", "imagem"))).toBe(false);
  });
});

describe("botões e respostas", () => {
  const passo = modeloFalaWhatsapp().passos.find((p) => p.id === "p5") as Extract<
    Passo,
    { tipo: "mensagem" }
  >;

  it("acha o botão pelo payload ou pelo texto digitado", () => {
    expect(botaoEscolhido(passo, { texto: null, payload: payloadBotao("p5", "b2") })?.titulo).toBe(
      "R$ 3 a 10 mil",
    );
    expect(botaoEscolhido(passo, { texto: "mais de r$ 10 mil", payload: null })?.titulo).toBe(
      "Mais de R$ 10 mil",
    );
    expect(botaoEscolhido(passo, { texto: "uns 5 mil", payload: null })).toBeNull();
    // Payload de outro passo não vale.
    expect(botaoEscolhido(passo, { texto: null, payload: payloadBotao("p4", "b2") })).toBeNull();
  });

  it("proximoIndice segue o pulo do botão ou vai pro seguinte", () => {
    const passos = modeloFalaWhatsapp().passos;
    expect(proximoIndice(passos, 3, null)).toBe(4);
    expect(proximoIndice(passos, 3, "p9")).toBe(8);
    expect(proximoIndice(passos, 3, "sumiu")).toBe(4);
  });

  it("respostaValida por formato", () => {
    expect(respostaValida("email", "ana@marca.com.br")).toBe(true);
    expect(respostaValida("email", "ana arroba marca")).toBe(false);
    expect(respostaValida("telefone", "(11) 99999-0000")).toBe(true);
    expect(respostaValida("telefone", "99")).toBe(false);
    expect(respostaValida("numero", "R$ 1.500,00")).toBe(true);
    expect(respostaValida("numero", "uns mil")).toBe(false);
    expect(respostaValida("texto", "  ")).toBe(false);
  });
});

describe("interpolar", () => {
  it("primeiro nome, campo guardado, e variável vazia some sem deixar espaço sobrando", () => {
    const contato = { nome: "Ana Paula", campos: { marca_instagram: "@canecasda" } };
    expect(interpolar("Oi, {primeiro_nome}. A {marca_instagram} vende o quê?", contato)).toBe(
      "Oi, Ana. A @canecasda vende o quê?",
    );
    expect(interpolar("Prazo: {prazo}.", contato)).toBe("Prazo:.");
  });

  it("contato sem nome de verdade não vira 'Oi, Contato'", () => {
    expect(interpolar("Oi, {primeiro_nome}.", { nome: "Contato do Instagram", campos: {} })).toBe(
      "Oi.",
    );
    expect(interpolar("Oi, {primeiro_nome}.", { nome: "+5511999990000", campos: {} })).toBe("Oi.");
  });

  it("{instagram} vira o @ do perfil, e some quando a pessoa não tem @", () => {
    const contato = { nome: "Ana Paula", campos: {}, instagram: "canecasda" };
    expect(interpolar("Oiee, {instagram}!!", contato)).toBe("Oiee, @canecasda!!");
    expect(interpolar("Oiee, {instagram}!!", { ...contato, instagram: "@canecasda" })).toBe(
      "Oiee, @canecasda!!",
    );
    expect(interpolar("Oiee, {instagram}!!", { ...contato, instagram: null })).toBe("Oiee!!");
  });
});

describe("comentário guiado", () => {
  it("formulário vira passos e volta igual, com os passos ligados e desligados", () => {
    const g = guiadoEmBranco();
    g.seguir.ativo = true;
    g.tags = ["veio do post"];
    const passos = guiadoParaPassos(g);
    expect(passos.map((p) => p.id)).toEqual(["boas_vindas", "seguir", "link", "tags"]);
    expect(passosParaGuiado(passos)).toEqual(g);
  });

  it("o modelo FALA traz o texto do ManyChat, 3 respostas públicas e o botão de link", () => {
    const a = modeloFalaInstagram();
    const volta = passosParaGuiado(a.passos);
    expect(volta.boasVindas.botao).toBe("Quero continuar");
    expect(volta.link.botoes[0]).toEqual({ titulo: "Abrir o WhatsApp", url: LINK_WHATSAPP_FALA });
    expect(a.gatilho.tipo === "comentario" && a.gatilho.respostas_publicas).toHaveLength(3);
  });

  it("botão de link sem endereço não salva", () => {
    const a = automacaoComentarioEmBranco();
    const g = guiadoEmBranco();
    g.link.botoes = [{ titulo: "Abrir", url: "" }];
    expect(automacaoSchema.safeParse({ ...a, passos: guiadoParaPassos(g) }).success).toBe(false);
  });
});
