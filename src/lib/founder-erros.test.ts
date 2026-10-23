import { describe, it, expect } from "vitest";
import { classificarErro, nomeNavegador } from "./founder-erros";

// Mensagens reais de erros_app (semana de 16 a 23/10/2026).
describe("classificarErro", () => {
  it("hidratação (#418) se recupera sozinha", () => {
    const c = classificarErro(
      "Uncaught Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML",
      "client",
    );
    expect(c.categoria).toBe("Página diferente do esperado");
    expect(c.gravidade).toBe("recupera");
  });

  it("chunk sumido depois do deploy quebra a tela, antes do 'Failed to fetch' genérico", () => {
    const c = classificarErro(
      "Failed to fetch dynamically imported module: https://one.usepolia.com.br/assets/landing-b-TCZcpJIJ.js",
      "client",
    );
    expect(c.categoria).toBe("Versão antiga após atualização");
    expect(c.gravidade).toBe("quebra");
  });

  it("#520 é o React se recuperando", () => {
    expect(
      classificarErro("Uncaught Error: Minified React error #520; visit", "client").gravidade,
    ).toBe("recupera");
  });

  it("erro do Zod no validateSearch vira link com dado inválido", () => {
    const msg =
      '[\n  {\n    "validation": "email",\n    "code": "invalid_string",\n    "message": "Invalid email"\n  }\n]';
    expect(classificarErro(msg, "client").categoria).toBe("Link com dado inválido");
  });

  it("WebView do Android e tradutor são ruído", () => {
    expect(
      classificarErro("Uncaught Error: Error invoking postMessage: Java object is gone", "client")
        .gravidade,
    ).toBe("ruido");
    expect(
      classificarErro(
        "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
        "client",
      ).gravidade,
    ).toBe("ruido");
  });

  it("server sem padrão conhecido quebra; client sem padrão fica a investigar com a mensagem crua", () => {
    expect(classificarErro("relation x does not exist", "server")).toMatchObject({
      categoria: "Servidor",
      gravidade: "quebra",
    });
    expect(classificarErro("algo novo", "client")).toEqual({
      titulo: "algo novo",
      categoria: "Sem classificação",
      gravidade: "investigar",
    });
  });
});

describe("nomeNavegador", () => {
  it("reconhece navegador de dentro do Instagram antes do Chrome", () => {
    expect(
      nomeNavegador(
        "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36 Instagram 350.0",
      ),
    ).toBe("Instagram (dentro do app)");
  });

  it("Safari de iPhone e ausência de user agent", () => {
    expect(
      nomeNavegador(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Safari iPhone");
    expect(nomeNavegador(null)).toBeNull();
  });
});
