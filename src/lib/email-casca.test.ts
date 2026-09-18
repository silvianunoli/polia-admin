import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { emailPolia, emailPoliaEditorial, emailPoliaCampanha, escapeHtml } from "./email-casca";
import { montarHtmlCampanha } from "./crm-email-html";

// Este arquivo existe por causa de um defeito real, e é irmão do
// polia-app/src/lib/email-template.test.ts.
//
// A casca daqui é cópia da do produto (polia-app/supabase/functions/_shared/
// email-polia.ts). Entre 17/08 e 18/09/2026 ela ficou parada na versão pré-v3
// — título em Georgia serifada e rodapé em #9E9E9E, que reprova AA — enquanto
// o produto já tinha virado. O convite e a primeira campanha chegaram com
// outra cara dos e-mails que as usuárias recebem, e ninguém percebeu até a
// fundadora abrir a caixa de entrada.
//
// O CLAUDE.md do repo já pedia sincronia. Pedido em comentário não sincroniza
// nada; teste sincroniza.

// Os tokens reais do escopo .polia-v3 (src/styles.css). Nenhuma outra cor pode
// aparecer num e-mail da Pólia.
const PALETA = [
  "#0A0A0A", // --ink
  "#2C2C2C", // --ink-soft
  "#6B6B6B", // --muted
  "#7CCBCD", // --secondary
  "#24696B", // --secondary-text
  "#E6E6E6", // --line
  "#F2F0ED", // --bg
  "#F6DAD4", // --surface-pink
  "#FFC629", // --highlight
  "#FBEAE7", // --danger-soft
  "#FFFFFF",
];

function hexesDe(html: string): string[] {
  return [...new Set((html.match(/#[0-9A-Fa-f]{6}/g) ?? []).map((h) => h.toUpperCase()))].sort();
}

const variantes: [string, string][] = [
  [
    "transacional",
    emailPolia({
      preheader: "preheader",
      headline: "Seu convite chegou",
      paragrafos: ["Primeiro parágrafo."],
      ctaLabel: "Criar minha conta",
      ctaUrl: "https://one.usepolia.com.br/cadastro",
    }),
  ],
  [
    "editorial",
    emailPoliaEditorial({
      preheader: "preheader",
      rotulo: "Pólia · Material gratuito",
      headline: "Seu manual",
      paragrafos: ["Primeiro parágrafo."],
      ctaLabel: "Baixar",
      ctaUrl: "https://one.usepolia.com.br/manual",
      assinatura: { nome: "Sil" },
    }),
  ],
  [
    "campanha",
    emailPoliaCampanha({
      preheader: "preheader",
      headline: "Novidades de outubro",
      corpoHtml: "<p>Oi.</p>",
      descadastroUrl: "https://one.usepolia.com.br/descadastrar?t=x",
    }),
  ],
];

describe.each(variantes)("casca de e-mail: %s", (nome, html) => {
  it("usa Cabinet Grotesk no título, nunca serifada", () => {
    expect(html).toContain("'Cabinet Grotesk'");
    // Georgia foi o que a cópia morta usava. O lookbehind evita pegar o
    // "sans-serif" do fim da pilha, que é o fallback correto.
    expect(html).not.toMatch(/Georgia|Times New Roman|Fraunces|(?<!sans-)serif/);
  });

  it("só usa cor que é token do escopo .polia-v3", () => {
    const fora = hexesDe(html).filter((h) => !PALETA.includes(h));
    expect(fora, `${nome} tem cor fora da paleta`).toEqual([]);
  });

  it("não ressuscita os cinzas que reprovam AA sobre o fundo", () => {
    expect(html).not.toMatch(/#9E9E9E|#767676/i);
  });
});

describe("campanha", () => {
  const html = montarHtmlCampanha({
    assunto: "Novidades de outubro",
    preheader: "O que mudou",
    corpo: '<p>Oi.</p><h2>Título</h2><ul><li>Item</li></ul><p><a href="https://x.com">link</a></p>',
  });

  it("leva o marcador de descadastro que o Resend troca por destinatária", () => {
    // Sem isso a campanha sai sem saída de um clique e sem List-Unsubscribe.
    expect(html).toContain("{{{RESEND_UNSUBSCRIBE_URL}}}");
  });

  it("estiliza o corpo do editor inline, porque e-mail não herda CSS", () => {
    // Tag nua vazando pro HTML final vira parágrafo sem margem no Outlook.
    expect(html).not.toMatch(/<(p|h2|h3|ul|ol|li|blockquote)>/);
  });

  it("monta o corpo com a fonte do produto, não com serifada", () => {
    expect(html).toMatch(/<p style="[^"]*'Inter'/);
    expect(html).toMatch(/<h2 style="[^"]*'Cabinet Grotesk'/);
  });

  it("mantém a mesma moldura do transacional", () => {
    // O que pode diferir é o miolo: título, preheader e a linha de descadastro
    // (que o transacional não tem). Cabeçalho, cartão e rodapé são os mesmos.
    const transacional = emailPolia({
      preheader: "O que mudou",
      headline: "Novidades de outubro",
      paragrafos: ["Oi."],
    });
    const linhas = (h: string) =>
      h
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const soNaCampanha = linhas(html).filter((l) => !linhas(transacional).includes(l));
    const foraDoEsperado = soNaCampanha.filter(
      (l) => !/RESEND_UNSUBSCRIBE_URL|<p style|<h2 style|<ul style|<li style|<\/ul>/.test(l),
    );
    expect(foraDoEsperado).toEqual([]);
  });
});

describe("escapeHtml", () => {
  it("neutraliza script vindo de campo público", () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });
});

describe("sincronia com o produto", () => {
  // O caminho é relativo ao workspace da Sil, onde os dois repos ficam lado a
  // lado. Em CI (só este repo é clonado) o arquivo não existe e o teste some,
  // porque falhar ali não diria nada sobre este commit.
  const fonteDaVerdade = path.resolve(
    __dirname,
    "../../../polia-app/supabase/functions/_shared/email-polia.ts",
  );

  it.skipIf(!existsSync(fonteDaVerdade))(
    "não divergiu da casca do polia-app nos blocos compartilhados",
    () => {
      const daqui = readFileSync(path.resolve(__dirname, "./email-casca.ts"), "utf8");
      const doApp = readFileSync(fonteDaVerdade, "utf8");

      // Compara o que tem que ser idêntico: tokens e blocos. O cabeçalho de
      // comentário e a variante de campanha (que só existe aqui) ficam fora.
      const trecho = (fonte: string) => {
        const inicio = fonte.indexOf("const COR_BG");
        const fim = fonte.indexOf("export function emailPoliaEditorial");
        return fonte.slice(inicio, fim).trim();
      };

      expect(trecho(daqui)).toBe(trecho(doApp));
    },
  );
});
