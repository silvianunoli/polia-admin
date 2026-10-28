import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Supabase falso: grava o que foi pedido e devolve id 1 em todo insert.
const { chamadas } = vi.hoisted(() => ({
  chamadas: [] as { tabela: string; metodo: string; args: unknown[] }[],
}));
vi.mock("@/integrations/supabase/client.server", () => {
  function from(tabela: string) {
    const cadeia: Record<string, unknown> = {};
    for (const m of [
      "select",
      "insert",
      "update",
      "eq",
      "in",
      "is",
      "ilike",
      "limit",
      "single",
      "maybeSingle",
    ]) {
      cadeia[m] = (...args: unknown[]) => {
        chamadas.push({ tabela, metodo: m, args });
        return cadeia;
      };
    }
    cadeia.then = (res: (v: unknown) => unknown) =>
      Promise.resolve({ data: tabela === "conv_eventos" ? { id: 1 } : null, error: null }).then(
        res,
      );
    return cadeia;
  }
  return { supabaseAdmin: { from } };
});

import { tratarWebhookMeta } from "@/lib/conversas-meta.server";

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

const URL_WEBHOOK = "https://office.usepolia.com.br/api/meta/webhook";
const ENV_ORIGINAL = { ...process.env };

beforeEach(() => {
  chamadas.length = 0;
  process.env.META_WEBHOOK_VERIFY_TOKEN = "combinado";
  process.env.META_APP_SECRET = "segredo-meta";
  process.env.INSTAGRAM_APP_SECRET = "segredo-ig";
});
afterEach(() => {
  process.env = { ...ENV_ORIGINAL };
});

describe("tratarWebhookMeta: verificação (GET)", () => {
  it("devolve o challenge quando o token bate", async () => {
    const r = await tratarWebhookMeta(
      new Request(`${URL_WEBHOOK}?hub.mode=subscribe&hub.verify_token=combinado&hub.challenge=123`),
      {},
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("123");
  });

  it("recusa token errado e recusa tudo se o token não estiver configurado", async () => {
    const errado = await tratarWebhookMeta(
      new Request(`${URL_WEBHOOK}?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=1`),
      {},
    );
    expect(errado.status).toBe(403);

    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
    const semToken = await tratarWebhookMeta(
      new Request(`${URL_WEBHOOK}?hub.mode=subscribe&hub.verify_token=&hub.challenge=1`),
      {},
    );
    expect(semToken.status).toBe(403);
  });
});

describe("tratarWebhookMeta: evento (POST)", () => {
  const corpo = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("sem assinatura válida: 401 e nada gravado", async () => {
    const r = await tratarWebhookMeta(
      new Request(URL_WEBHOOK, {
        method: "POST",
        body: corpo,
        headers: { "x-hub-signature-256": await assinar(corpo, "chute") },
      }),
      {},
    );
    expect(r.status).toBe(401);
    expect(chamadas).toHaveLength(0);
  });

  it("sem segredo configurado: 503", async () => {
    delete process.env.META_APP_SECRET;
    delete process.env.INSTAGRAM_APP_SECRET;
    const r = await tratarWebhookMeta(
      new Request(URL_WEBHOOK, { method: "POST", body: corpo }),
      {},
    );
    expect(r.status).toBe(503);
  });

  it("assinado: grava o evento cru, responde 200 e deixa o processamento no waitUntil", async () => {
    const pendentes: Promise<unknown>[] = [];
    const r = await tratarWebhookMeta(
      new Request(URL_WEBHOOK, {
        method: "POST",
        body: corpo,
        headers: { "x-hub-signature-256": await assinar(corpo, "segredo-ig") },
      }),
      { waitUntil: (p: Promise<unknown>) => pendentes.push(p) },
    );
    expect(r.status).toBe(200);
    expect(chamadas[0]).toMatchObject({
      tabela: "conv_eventos",
      metodo: "insert",
      args: [{ origem: "whatsapp_business_account" }],
    });
    expect(pendentes).toHaveLength(1);
    await pendentes[0];
    // Payload sem mensagem: só marca o evento como processado.
    expect(chamadas.some((c) => c.tabela === "conv_eventos" && c.metodo === "update")).toBe(true);
  });

  it("JSON quebrado com assinatura certa: 400", async () => {
    const quebrado = "{nao e json";
    const r = await tratarWebhookMeta(
      new Request(URL_WEBHOOK, {
        method: "POST",
        body: quebrado,
        headers: { "x-hub-signature-256": await assinar(quebrado, "segredo-meta") },
      }),
      {},
    );
    expect(r.status).toBe(400);
  });
});

describe("conta do WhatsApp (tela de canais)", () => {
  it("lê números e apps ligados, e o conectar faz POST em subscribed_apps", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "token-sistema";
    const chamadasFetch: { url: string; metodo: string }[] = [];
    const respostas: Record<string, unknown> = {
      "?fields=name": { name: "Pólia" },
      "/phone_numbers": {
        data: [
          {
            id: "PN1",
            display_phone_number: "+55 11 99696-3296",
            verified_name: "Pólia",
            quality_rating: "GREEN",
            status: "CONNECTED",
          },
        ],
      },
      "/subscribed_apps": {
        data: [{ whatsapp_business_api_data: { id: "MC", name: "ManyChat" } }],
      },
    };
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      chamadasFetch.push({ url, metodo: init?.method ?? "GET" });
      if (init?.method === "POST") return new Response(JSON.stringify({ success: true }));
      const chave = Object.keys(respostas).find((k) => url.includes(k))!;
      return new Response(JSON.stringify(respostas[chave]));
    }) as typeof fetch;
    try {
      const { lerContaWhatsapp, ligarAppNaContaWhatsapp } =
        await import("@/lib/conversas-meta.server");
      const conta = await lerContaWhatsapp("123456");
      expect(conta).toEqual({
        nome: "Pólia",
        numeros: [
          {
            id: "PN1",
            numero: "+55 11 99696-3296",
            nome: "Pólia",
            qualidade: "GREEN",
            status: "CONNECTED",
          },
        ],
        apps: [{ id: "MC", nome: "ManyChat" }],
      });
      await ligarAppNaContaWhatsapp("123456");
      expect(chamadasFetch.at(-1)).toEqual({
        url: "https://graph.facebook.com/v23.0/123456/subscribed_apps",
        metodo: "POST",
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("sem token do usuário do sistema, explica o que falta", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    const { lerContaWhatsapp } = await import("@/lib/conversas-meta.server");
    await expect(lerContaWhatsapp("123456")).rejects.toThrow("WHATSAPP_ACCESS_TOKEN");
  });
});
