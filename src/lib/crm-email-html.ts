// Casca HTML da campanha. Vive fora dos .functions.ts porque o editor precisa
// dela no client pra pré-visualizar exatamente o que vai sair.
//
// Regra de e-mail: tabela + estilo inline. Outlook desktop ignora <style>,
// flexbox e grid, e o Gmail corta o <head>. Nada de CSS moderno aqui.

// O Tiptap devolve HTML limpo mas sem estilo nenhum, e cliente de e-mail não
// herda margem nem cor de link. Então cada tag comum recebe o seu inline.
const ESTILOS: [RegExp, string][] = [
  [/<p>/g, '<p style="margin:0 0 16px 0;font-size:16px;line-height:1.65;color:#0A0A0A;">'],
  [
    /<h1>/g,
    '<h1 style="margin:24px 0 12px 0;font-size:24px;line-height:1.25;color:#0A0A0A;font-weight:600;">',
  ],
  [
    /<h2>/g,
    '<h2 style="margin:24px 0 12px 0;font-size:20px;line-height:1.3;color:#0A0A0A;font-weight:600;">',
  ],
  [
    /<h3>/g,
    '<h3 style="margin:20px 0 8px 0;font-size:17px;line-height:1.35;color:#0A0A0A;font-weight:600;">',
  ],
  [/<ul>/g, '<ul style="margin:0 0 16px 0;padding-left:20px;">'],
  [/<ol>/g, '<ol style="margin:0 0 16px 0;padding-left:20px;">'],
  [/<li>/g, '<li style="margin:0 0 8px 0;font-size:16px;line-height:1.6;color:#0A0A0A;">'],
  [
    /<blockquote>/g,
    '<blockquote style="margin:0 0 16px 0;padding:8px 0 8px 16px;border-left:3px solid #7CCBCD;color:#2C2C2C;">',
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

export function montarHtmlCampanha(params: {
  assunto: string;
  preheader: string | null;
  corpo: string;
}): string {
  const preheader = params.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${params.preheader}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${params.assunto}</title></head>
<body style="margin:0;padding:0;background-color:#F2F0ED;">
${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2F0ED;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border:1px solid #E6E6E6;border-radius:12px;">
      <tr><td style="padding:32px 32px 8px 32px;">
        <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#6B6B6B;">Pólia</p>
      </td></tr>
      <tr><td style="padding:8px 32px 24px 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#0A0A0A;">
${inlineParaEmail(params.corpo)}
      </td></tr>
      <tr><td style="padding:0 32px 32px 32px;">
        <hr style="border:none;border-top:1px solid #E6E6E6;margin:0 0 16px 0;">
        <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#6B6B6B;">
          Você recebe este e-mail porque pediu pra acompanhar a Pólia.<br>
          <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#24696B;">Não quero mais receber</a>
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
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
