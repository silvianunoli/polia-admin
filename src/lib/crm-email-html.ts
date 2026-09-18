import { emailPoliaCampanha } from "@/lib/email-casca";

// Estilo inline do corpo escrito no editor. A casca (cabeçalho, cartão,
// rodapé) é a de email-casca.ts, a mesma dos outros e-mails da Pólia — aqui só
// se resolve o miolo.
//
// Regra de e-mail: tabela + estilo inline. Outlook desktop ignora <style>,
// flexbox e grid, e o Gmail corta o <head>. Nada de CSS moderno aqui.

// O Tiptap devolve HTML limpo mas sem estilo nenhum, e cliente de e-mail não
// herda margem nem cor de link. Então cada tag comum recebe o seu inline.
// Os valores são os mesmos dos parágrafos da casca: Inter 16px/1.65 em
// --ink-soft, título em Cabinet Grotesk. Nada de serifada: os títulos da
// Pólia são grotescas, e Georgia aqui foi justamente o erro que fez os
// e-mails do admin divergirem dos do produto.
const FONTE_CORPO = "'Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const FONTE_TITULO =
  "'Cabinet Grotesk','Inter',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
const CORPO = `font-family:${FONTE_CORPO};font-size:16px;line-height:1.65;color:#2C2C2C;`;

const ESTILOS: [RegExp, string][] = [
  [/<p>/g, `<p style="margin:0 0 18px;${CORPO}">`],
  [
    /<h2>/g,
    `<h2 style="margin:28px 0 12px;font-family:${FONTE_TITULO};font-size:22px;font-weight:700;line-height:1.2;letter-spacing:-0.02em;color:#0A0A0A;">`,
  ],
  [
    /<h3>/g,
    `<h3 style="margin:24px 0 8px;font-family:${FONTE_TITULO};font-size:18px;font-weight:700;line-height:1.25;letter-spacing:-0.02em;color:#0A0A0A;">`,
  ],
  [/<ul>/g, '<ul style="margin:0 0 18px;padding-left:20px;">'],
  [/<ol>/g, '<ol style="margin:0 0 18px;padding-left:20px;">'],
  [/<li>/g, `<li style="margin:0 0 8px;${CORPO}">`],
  [
    /<blockquote>/g,
    `<blockquote style="margin:0 0 18px;padding:8px 0 8px 16px;border-left:2px solid #7CCBCD;${CORPO}">`,
  ],
  [/<a /g, '<a style="color:#24696B;text-decoration:underline;" '],
  [/<hr>/g, '<hr style="border:none;border-top:1px solid #E6E6E6;margin:28px 0;">'],
  [/<img /g, '<img style="max-width:100%;height:auto;border-radius:12px;" '],
];

export function inlineParaEmail(html: string): string {
  let saida = html;
  for (const [de, para] of ESTILOS) saida = saida.replace(de, para);
  return saida;
}

// A campanha usa a MESMA casca dos outros e-mails da Pólia: logo no topo,
// título em Cabinet Grotesk, filete, corpo em Inter e o rodapé com o domínio,
// a assinatura da marca e o descadastro. O {{{RESEND_UNSUBSCRIBE_URL}}} é
// trocado pelo Resend pelo link real de cada destinatária.
export function montarHtmlCampanha(params: {
  assunto: string;
  preheader: string | null;
  corpo: string;
}): string {
  return emailPoliaCampanha({
    preheader: params.preheader ?? params.assunto,
    headline: params.assunto,
    corpoHtml: inlineParaEmail(params.corpo),
    descadastroUrl: "{{{RESEND_UNSUBSCRIBE_URL}}}",
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
