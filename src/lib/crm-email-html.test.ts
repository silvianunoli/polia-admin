import { describe, it, expect } from "vitest";
import { inlineParaEmail, montarHtmlCampanha, textoDoHtml } from "./crm-email-html";

// A casca (cores, fonte, descadastro, assinatura) já é provada em
// email-casca.test.ts. Aqui é só o miolo: o HTML do editor virando e-mail e
// a versão em texto puro que vai junto.

const PALETA = [
  "#0A0A0A",
  "#2C2C2C",
  "#6B6B6B",
  "#7CCBCD",
  "#24696B",
  "#E6E6E6",
  "#F2F0ED",
  "#F6DAD4",
  "#FFC629",
  "#FBEAE7",
  "#FFFFFF",
];

describe("inlineParaEmail", () => {
  it("parágrafo e título ganham estilo inline com a fonte do produto", () => {
    const html = inlineParaEmail("<p>Oi.</p><h2>Título</h2><h3>Sub</h3>");
    expect(html).toMatch(/<p style="[^"]*'Inter'[^"]*">Oi\.<\/p>/);
    expect(html).toMatch(/<h2 style="[^"]*'Cabinet Grotesk'[^"]*">Título<\/h2>/);
    expect(html).toMatch(/<h3 style="[^"]*'Cabinet Grotesk'[^"]*">Sub<\/h3>/);
  });

  it("link e imagem mantêm os atributos originais", () => {
    // O estilo entra ANTES do href/src; se a regex engolisse o atributo, o
    // link deixaria de apontar pra algum lugar.
    const html = inlineParaEmail('<a href="https://x.com">x</a><img src="a.png" alt="a">');
    expect(html).toContain(
      '<a style="color:#24696B;text-decoration:underline;" href="https://x.com">',
    );
    expect(html).toContain(
      '<img style="max-width:100%;height:auto;border-radius:12px;" src="a.png"',
    );
  });

  it("nenhuma tag de bloco do editor fica nua", () => {
    const html = inlineParaEmail(
      "<p>a</p><h2>b</h2><h3>c</h3><ul><li>d</li></ul><ol><li>e</li></ol><blockquote>f</blockquote><hr>",
    );
    expect(html).not.toMatch(/<(p|h2|h3|ul|ol|li|blockquote|hr)>/);
  });

  it("deixa em paz o que não conhece", () => {
    expect(inlineParaEmail("<strong>x</strong><em>y</em>")).toBe("<strong>x</strong><em>y</em>");
  });

  it("só usa cor que é token da paleta", () => {
    const html = inlineParaEmail(
      "<p>a</p><h2>b</h2><a href='x'>c</a><blockquote>d</blockquote><hr>",
    );
    const fora = [...new Set(html.match(/#[0-9A-Fa-f]{6}/g) ?? [])]
      .map((h) => h.toUpperCase())
      .filter((h) => !PALETA.includes(h));
    expect(fora).toEqual([]);
  });
});

describe("montarHtmlCampanha", () => {
  it("sem preheader usa o assunto no lugar", () => {
    const com = montarHtmlCampanha({ assunto: "Assunto", preheader: "Assunto", corpo: "<p>x</p>" });
    const sem = montarHtmlCampanha({ assunto: "Assunto", preheader: null, corpo: "<p>x</p>" });
    expect(sem).toBe(com);
  });

  it("a copy fixa da casca não tem travessão, exclamação nem emoji", () => {
    // O corpo é neutro de propósito: o que sobra é o texto que a casca põe
    // sozinha (assinatura, dúvida, descadastro). O <style> sai antes porque
    // "!important" não é copy.
    const html = montarHtmlCampanha({ assunto: "Assunto", preheader: null, corpo: "<p>x</p>" });
    const texto = textoDoHtml(html.replace(/<style[\s\S]*?<\/style>/gi, ""));
    expect(texto).not.toMatch(/—|!|\p{Extended_Pictographic}/u);
    expect(texto).toContain("Não quero mais receber");
  });

  // Bug documentado: o assunto vai cru pro <title> e pro <h1> da casca, sem
  // escapeHtml. "Preço < R$ 50 & frete" quebra o HTML do e-mail. É texto da
  // própria admin (não é fronteira de segurança), mas é defeito visível.
  // Quando for corrigido, este it.fails passa a falhar: aí é só trocar por it.
  it.fails("assunto com & e < deveria chegar escapado no título", () => {
    const html = montarHtmlCampanha({
      assunto: "Preço < R$ 50 & frete",
      preheader: null,
      corpo: "",
    });
    expect(html).toContain("Preço &lt; R$ 50 &amp; frete");
  });
});

describe("textoDoHtml", () => {
  it("quebra de linha e fim de bloco viram linhas; tags somem", () => {
    expect(textoDoHtml("<p>Oi<br>tudo</p><p>bem</p>")).toBe("Oi\ntudo\n\nbem");
  });

  it("desfaz as entidades que o editor gera", () => {
    expect(textoDoHtml("<p>a &amp; b &lt;c&gt; &quot;d&quot;&nbsp;e</p>")).toBe('a & b <c> "d" e');
  });

  it("não deixa mais de uma linha em branco seguida", () => {
    expect(textoDoHtml("<p>a</p><p></p><p></p><p>b</p>")).toBe("a\n\nb");
  });

  it("vazio continua vazio", () => {
    expect(textoDoHtml("")).toBe("");
  });
});
