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

  // A campanha assina como Pólia, não como One: quem recebe pode nunca ter
  // entrado no produto (veio do quiz, do manual, de um serviço avulso).
  // Decisão da Sil em 18/09/2026.
  it("assina como Pólia, nunca como One", () => {
    expect(html).toContain("logo-email-polia.png");
    expect(html).not.toContain("logo-email.png");
    expect(html).toMatch(/>\s*usepolia\.com\.br\s*</);
    expect(html).not.toContain("one.usepolia.com.br");
  });

  it("o logo vem do biolink, que é o domínio da marca", () => {
    expect(html).toContain("https://usepolia.com.br/marketing/logo-email-polia.png");
    // alt de verdade: imagem remota vem bloqueada em boa parte dos clientes.
    expect(html).toMatch(/<img[^>]*alt="Pólia"/);
  });

  it("mantém a estrutura do transacional fora a marca", () => {
    // Mesma tabela, mesmo cartão, mesmo filete, mesmos paddings. Se isso
    // divergir, os dois e-mails deixam de parecer da mesma casa.
    const transacional = emailPolia({
      preheader: "O que mudou",
      headline: "Novidades de outubro",
      paragrafos: ["Oi."],
    });
    for (const marca of [
      'style="padding:40px 16px 48px;"',
      'class="polia-cartao"',
      `border-radius:12px;padding:32px;`,
      "Pequenas marcas. Grandes sonhos.",
      "polia-h1",
    ]) {
      expect(html, `campanha perdeu: ${marca}`).toContain(marca);
      expect(transacional, `transacional perdeu: ${marca}`).toContain(marca);
    }
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
  // Dois caminhos possíveis, e é de propósito:
  //   - CASCA_DO_APP: o CI define isso depois de clonar o polia-app ao lado
  //     (ver .github/workflows/deploy.yml). Só existe se o secret de leitura
  //     do outro repo estiver configurado.
  //   - fallback: o workspace da Sil, onde os dois repos ficam lado a lado.
  // Não achando nenhum dos dois, o caso se pula em vez de falhar: a ausência
  // do outro repo não diz nada sobre este commit.
  const fonteDaVerdade =
    process.env.CASCA_DO_APP ||
    path.resolve(__dirname, "../../../polia-app/supabase/functions/_shared/email-polia.ts");

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
