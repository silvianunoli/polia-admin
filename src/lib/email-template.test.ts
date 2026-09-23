import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resendApiKey,
  enviarEmailResend,
  escapeHtml,
  emailPolia,
  emailPoliaEditorial,
} from "./email-template";

// enviarEmailResend é best-effort por contrato: quem chama já salvou o dado,
// o e-mail é só a notificação. Então o que se prova aqui é que ela NUNCA
// lança, e que devolve false honestamente em cada jeito de falhar. Entre
// 05/2026 e 12/08/2026 a chave do Resend não existia no Worker e todo e-mail
// falhava calado; o "false" é o que deixa quem chama registrar isso.

const fetchMock = vi.fn();
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("RESEND_API_KEY", "re_teste_123");
  fetchMock.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  consoleError.mockRestore();
});

const params = {
  to: ["ana@exemplo.com"],
  subject: "Assunto",
  text: "texto",
  html: "<p>html</p>",
  contexto: "[Teste]",
};

describe("resendApiKey", () => {
  it("devolve a chave do ambiente", () => {
    expect(resendApiKey()).toBe("re_teste_123");
  });

  it("sem chave, lança e registra no console", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect(() => resendApiKey()).toThrow("Missing RESEND_API_KEY");
    expect(consoleError).toHaveBeenCalled();
  });
});

describe("enviarEmailResend", () => {
  it("envia pro Resend com remetente da Pólia e Bearer da chave", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await expect(enviarEmailResend(params)).resolves.toBe(true);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_teste_123");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("Pólia <naoresponda@usepolia.com.br>");
    expect(body.to).toEqual(["ana@exemplo.com"]);
    expect(body.subject).toBe("Assunto");
    expect(body.text).toBe("texto");
    expect(body.html).toBe("<p>html</p>");
  });

  it("reply_to só entra quando pedido", async () => {
    fetchMock.mockResolvedValue({ ok: true });
    await enviarEmailResend(params);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("reply_to");

    await enviarEmailResend({ ...params, replyTo: "oi@usepolia.com.br" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).reply_to).toBe("oi@usepolia.com.br");
  });

  it("resposta não-ok devolve false e registra o contexto", async () => {
    fetchMock.mockResolvedValue({ ok: false, text: async () => "unauthorized" });
    await expect(enviarEmailResend(params)).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[Teste]"), "unauthorized");
  });

  it("rede caindo devolve false, não lança", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(enviarEmailResend(params)).resolves.toBe(false);
  });

  it("sem chave no ambiente devolve false, não lança", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(enviarEmailResend(params)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("reexports", () => {
  it("mantém os imports antigos de escapeHtml/emailPolia/emailPoliaEditorial", () => {
    expect(typeof escapeHtml).toBe("function");
    expect(typeof emailPolia).toBe("function");
    expect(typeof emailPoliaEditorial).toBe("function");
  });
});
