import { describe, it, expect } from "vitest";
import {
  assinaturaValida,
  calcularJanela,
  normalizarWebhook,
  resumoMensagem,
  variantesTelefoneBR,
} from "@/lib/conversas-meta";

async function assinar(corpo: string, segredo: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(corpo)));
  return "sha256=" + [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("assinaturaValida", () => {
  const corpo = JSON.stringify({ object: "instagram", entry: [] });

  it("aceita a assinatura de qualquer um dos segredos configurados", async () => {
    const cab = await assinar(corpo, "segredo-whatsapp");
    expect(await assinaturaValida(corpo, cab, ["segredo-instagram", "segredo-whatsapp"])).toBe(
      true,
    );
  });

  it("recusa corpo alterado, segredo errado, cabeçalho ausente ou malformado", async () => {
    const cab = await assinar(corpo, "segredo");
    expect(await assinaturaValida(corpo + " ", cab, ["segredo"])).toBe(false);
    expect(await assinaturaValida(corpo, cab, ["outro"])).toBe(false);
    expect(await assinaturaValida(corpo, null, ["segredo"])).toBe(false);
    expect(await assinaturaValida(corpo, "sha1=abc", ["segredo"])).toBe(false);
    expect(await assinaturaValida(corpo, "sha256=zz", ["segredo"])).toBe(false);
  });

  it("sem segredo configurado, nada passa", async () => {
    const cab = await assinar(corpo, "segredo");
    expect(await assinaturaValida(corpo, cab, [undefined, undefined])).toBe(false);
  });
});

describe("normalizarWebhook: Instagram", () => {
  const base = (messaging: unknown[], changes: unknown[] = []) => ({
    object: "instagram",
    entry: [{ id: "CONTA", time: 1, messaging, changes }],
  });

  it("Direct de texto vira entrada que abre a janela", () => {
    const { eventos } = normalizarWebhook(
      base([
        {
          sender: { id: "PESSOA" },
          recipient: { id: "CONTA" },
          timestamp: 1761480000000,
          message: { mid: "m1", text: "Oi" },
        },
      ]),
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      canal: "instagram",
      externoId: "PESSOA",
      mensagem: { metaId: "m1", direcao: "entrada", tipo: "texto", texto: "Oi", abreJanela: true },
    });
    expect(eventos[0].mensagem?.quando).toBe(new Date(1761480000000).toISOString());
  });

  it("eco (mensagem que saiu da conta) vira saída pra pessoa destinatária, sem abrir janela", () => {
    const { eventos } = normalizarWebhook(
      base([
        {
          sender: { id: "CONTA" },
          recipient: { id: "PESSOA" },
          timestamp: 1,
          message: { mid: "m2", text: "Respondi pelo celular", is_echo: true },
        },
      ]),
    );
    expect(eventos[0]).toMatchObject({
      externoId: "PESSOA",
      mensagem: { direcao: "saida", abreJanela: false },
    });
  });

  it("menção em story e resposta a story guardam mídia e contexto", () => {
    const { eventos } = normalizarWebhook(
      base([
        {
          sender: { id: "P" },
          recipient: { id: "CONTA" },
          timestamp: 1,
          message: {
            mid: "m3",
            attachments: [{ type: "story_mention", payload: { url: "https://cdn/x.jpg" } }],
          },
        },
        {
          sender: { id: "P" },
          recipient: { id: "CONTA" },
          timestamp: 2,
          message: {
            mid: "m4",
            text: "Amei",
            reply_to: { story: { id: "S1", url: "https://cdn/story" } },
          },
        },
      ]),
    );
    expect(eventos[0].mensagem).toMatchObject({
      tipo: "story_mencao",
      midia: { url: "https://cdn/x.jpg" },
    });
    expect(eventos[1].mensagem).toMatchObject({
      tipo: "story_resposta",
      texto: "Amei",
      dados: { story_id: "S1", story_url: "https://cdn/story" },
    });
  });

  it("comentário vira entrada que NÃO abre a janela do Direct, e o da própria conta é ignorado", () => {
    const { eventos } = normalizarWebhook(
      base(
        [],
        [
          {
            field: "comments",
            value: {
              id: "C1",
              text: "FALA",
              from: { id: "P", username: "Marca_Linda" },
              media: { id: "MID", media_product_type: "REELS" },
            },
          },
          { field: "comments", value: { id: "C2", text: "olha o Direct", from: { id: "CONTA" } } },
        ],
      ),
    );
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      externoId: "P",
      username: "Marca_Linda",
      mensagem: {
        metaId: "comentario:C1",
        tipo: "comentario",
        abreJanela: false,
        dados: { comment_id: "C1", media_id: "MID" },
      },
    });
  });

  it("botão tocado (quick reply e postback) vira tipo botao com o payload", () => {
    const { eventos } = normalizarWebhook(
      base([
        {
          sender: { id: "P" },
          recipient: { id: "CONTA" },
          timestamp: 1,
          message: { mid: "m5", text: "Quero", quick_reply: { payload: "SIM" } },
        },
        {
          sender: { id: "P" },
          recipient: { id: "CONTA" },
          timestamp: 2,
          postback: { mid: "m6", title: "Preços", payload: "PRECOS" },
        },
      ]),
    );
    expect(eventos.map((e) => [e.mensagem?.tipo, e.mensagem?.dados.payload])).toEqual([
      ["botao", "SIM"],
      ["botao", "PRECOS"],
    ]);
  });

  it("lê o formato do botão Teste do painel (changes + timestamp em segundos)", () => {
    // Payload exato que a Meta mandou em 26/10/2026 pelo "Enviar para servidor v25.0".
    const { eventos } = normalizarWebhook({
      object: "instagram",
      entry: [
        {
          id: "0",
          time: 1793028325,
          changes: [
            {
              field: "messages",
              value: {
                sender: { id: "12334" },
                recipient: { id: "23245" },
                timestamp: "1527459824",
                message: { mid: "random_mid", text: "random_text" },
              },
            },
          ],
        },
      ],
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      externoId: "12334",
      mensagem: { metaId: "random_mid", texto: "random_text", direcao: "entrada" },
    });
    expect(eventos[0].mensagem?.quando).toBe(new Date(1527459824 * 1000).toISOString());
  });

  it("ignora mensagem apagada, sem mid e leitura", () => {
    const { eventos } = normalizarWebhook(
      base([
        { sender: { id: "P" }, recipient: { id: "C" }, message: { mid: "x", is_deleted: true } },
        { sender: { id: "P" }, recipient: { id: "C" }, message: { text: "sem mid" } },
        { sender: { id: "P" }, recipient: { id: "C" }, read: { mid: "x" } },
      ]),
    );
    expect(eventos).toHaveLength(0);
  });
});

describe("normalizarWebhook: WhatsApp", () => {
  const base = (value: unknown) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value }] }],
  });

  it("texto pega o nome do perfil e o timestamp em segundos", () => {
    const { eventos } = normalizarWebhook(
      base({
        messaging_product: "whatsapp",
        contacts: [{ wa_id: "5511999990000", profile: { name: "Ana" } }],
        messages: [
          {
            from: "5511999990000",
            id: "wamid.1",
            timestamp: "1761480000",
            type: "text",
            text: { body: "Comentei FALA" },
          },
        ],
      }),
    );
    expect(eventos[0]).toMatchObject({
      canal: "whatsapp",
      externoId: "5511999990000",
      nome: "Ana",
      mensagem: { metaId: "wamid.1", texto: "Comentei FALA", abreJanela: true },
    });
    expect(eventos[0].mensagem?.quando).toBe(new Date(1761480000 * 1000).toISOString());
  });

  it("mídia guarda o ID pra baixar depois, com legenda, mime e nome do arquivo", () => {
    const { eventos } = normalizarWebhook(
      base({
        messages: [
          {
            from: "55",
            id: "wamid.2",
            timestamp: "1",
            type: "document",
            document: {
              id: "MEDIA9",
              mime_type: "application/pdf",
              filename: "briefing.pdf",
              caption: "segue",
            },
          },
        ],
      }),
    );
    expect(eventos[0].mensagem).toMatchObject({
      tipo: "arquivo",
      texto: "segue",
      midia: { waMediaId: "MEDIA9", mime: "application/pdf", nome: "briefing.pdf" },
    });
  });

  it("resposta de botão interativo vira tipo botao com o título e o id", () => {
    const { eventos } = normalizarWebhook(
      base({
        messages: [
          {
            from: "55",
            id: "wamid.3",
            timestamp: "1",
            type: "interactive",
            interactive: {
              type: "button_reply",
              button_reply: { id: "ate3", title: "Até R$ 3 mil" },
            },
          },
        ],
      }),
    );
    expect(eventos[0].mensagem).toMatchObject({
      tipo: "botao",
      texto: "Até R$ 3 mil",
      dados: { payload: "ate3" },
    });
  });

  it("status de entrega vira StatusEntrega; falha traz o motivo", () => {
    const { statuses, eventos } = normalizarWebhook(
      base({
        statuses: [
          { id: "wamid.9", status: "delivered", timestamp: "1", recipient_id: "55" },
          {
            id: "wamid.10",
            status: "failed",
            errors: [
              {
                code: 131047,
                title: "Re-engagement message",
                error_data: { details: "Mais de 24h" },
              },
            ],
          },
          { id: "wamid.11", status: "desconhecido" },
        ],
      }),
    );
    expect(eventos).toHaveLength(0);
    expect(statuses).toEqual([
      { metaId: "wamid.9", status: "entregue", erro: null },
      { metaId: "wamid.10", status: "falhou", erro: "Mais de 24h" },
    ]);
  });

  it("payload de outro objeto ou quebrado não explode", () => {
    expect(normalizarWebhook({ object: "page", entry: [] })).toEqual({ eventos: [], statuses: [] });
    expect(normalizarWebhook(null)).toEqual({ eventos: [], statuses: [] });
    expect(normalizarWebhook({ object: "instagram", entry: "x" })).toEqual({
      eventos: [],
      statuses: [],
    });
  });
});

describe("calcularJanela", () => {
  const agora = Date.parse("2026-10-26T12:00:00Z");

  it("aberta até 24h depois da última mensagem da pessoa", () => {
    expect(calcularJanela("2026-10-25T13:00:00Z", agora)).toEqual({
      aberta: true,
      fechaEm: "2026-10-26T13:00:00.000Z",
    });
    expect(calcularJanela("2026-10-25T11:59:00Z", agora).aberta).toBe(false);
  });

  it("sem mensagem da pessoa, fechada e sem prazo", () => {
    expect(calcularJanela(null, agora)).toEqual({ aberta: false, fechaEm: null });
  });
});

describe("variantesTelefoneBR", () => {
  it("celular antigo sem o 9 também procura com o 9, e vice-versa", () => {
    expect(variantesTelefoneBR("551199990000")).toEqual(["551199990000", "5511999990000"]);
    expect(variantesTelefoneBR("5511999990000")).toEqual(["5511999990000", "551199990000"]);
  });

  it("número de fora do Brasil fica como veio", () => {
    expect(variantesTelefoneBR("14155550100")).toEqual(["14155550100"]);
  });
});

describe("resumoMensagem", () => {
  it("põe o rótulo do tipo na frente e corta em 140", () => {
    expect(resumoMensagem("imagem", null)).toBe("Foto");
    expect(resumoMensagem("comentario", "FALA")).toBe("Comentou: FALA");
    expect(resumoMensagem("texto", "  oi\n\ntudo bem ")).toBe("oi tudo bem");
    expect(resumoMensagem("texto", "a".repeat(200))).toHaveLength(140);
  });
});
