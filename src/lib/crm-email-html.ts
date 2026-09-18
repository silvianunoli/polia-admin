import { emailPolia } from "@/lib/email-casca";

// Casca HTML da campanha. Vive fora dos .functions.ts porque o editor precisa
// dela no client pra pré-visualizar exatamente o que vai sair.
//
// Regra de e-mail: tabela + estilo inline. Outlook desktop ignora <style>,
// flexbox e grid, e o Gmail corta o <head>. Nada de CSS moderno aqui.

// O Tiptap devolve HTML limpo mas sem estilo nenhum, e cliente de e-mail não
// herda margem nem cor de link. Então cada tag comum recebe o seu inline.
// Os valores batem com os dos e-mails transacionais: corpo 15px/1.6 em
// #2C2C2C, título serifado em Georgia como a headline da casca.
const UI = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const ESTILOS: [RegExp, string][] = [
  [
    /<p>/g,
    `<p style="margin:0 0 16px;font-family:${UI};font-size:15px;line-height:1.6;color:#2C2C2C;">`,
  ],
  [
    /<h2>/g,
    `<h2 style="margin:24px 0 12px;font-family:${SERIF};font-size:19px;line-height:1.3;color:#0A0A0A;">`,
  ],
  [
    /<h3>/g,
    `<h3 style="margin:20px 0 8px;font-family:${SERIF};font-size:17px;line-height:1.35;color:#0A0A0A;">`,
  ],
  [/<ul>/g, '<ul style="margin:0 0 16px;padding-left:20px;">'],
  [/<ol>/g, '<ol style="margin:0 0 16px;padding-left:20px;">'],
  [
    /<li>/g,
    `<li style="margin:0 0 8px;font-family:${UI};font-size:15px;line-height:1.6;color:#2C2C2C;">`,
  ],
  [
    /<blockquote>/g,
    `<blockquote style="margin:0 0 16px;padding:8px 0 8px 16px;border-left:3px solid #7CCBCD;font-family:${UI};font-size:15px;line-height:1.6;color:#2C2C2C;">`,
  ],
  [/<a /g, '<a style="color:#24696B;text-decoration:underline;" '],
  [/<hr>/g, '<hr style="border:none;border-top:1px solid #E6E6E6;margin:24px 0;">'],
  [/<img /g, '<img style="max-width:100%;height:auto;border-radius:8px;" '],
];

export function inlineParaEmail(html: string): string {
  let saida = html;
  for (const [de, para] of ESTILOS) saida = saida.replace(de, para);
  return saida;
}

// A campanha usa a MESMA casca dos 9 e-mails transacionais (email-casca.ts):
// wordmark Pólia em cima, card branco de 480px, headline serifada, rodapé
// discreto. Antes daqui existia uma casca própria, parecida mas não igual, e
// a newsletter chegava com outra cara na caixa de entrada.
export function montarHtmlCampanha(params: {
  assunto: string;
  preheader: string | null;
  corpo: string;
}): string {
  return emailPolia({
    preheader: params.preheader ?? params.assunto,
    headline: params.assunto,
    corpoHtml: inlineParaEmail(params.corpo),
    rodapeHtml:
      'Você recebe este e-mail porque pediu pra acompanhar a Pólia. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#24696B;">Não quero mais receber</a>',
  });
}

export function textoDoHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|li|blockquote)>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
