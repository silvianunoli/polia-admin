// Casca HTML compartilhada pros e-mails da Pólia (Resend).
//
// Vive num arquivo próprio, sem nenhuma dependência de servidor, porque o
// editor de campanha precisa dela no client pra pré-visualizar exatamente o
// que vai sair. email-template.ts reexporta tudo daqui, então os imports
// antigos continuam valendo.
//
// Layout em tabela + estilo inline: é o padrão robusto pra e-mail — Outlook
// desktop não lê <style>/flexbox/grid, então nada de CSS moderno aqui.
// Paleta e tokens iguais ao .polia-v3 (src/styles.css) — bg pedra, ink quase
// preto, botão turquesa/ink.
// Fonte web (Fraunces) não carrega em cliente de e-mail; o fallback Georgia
// imita o peso serifado sem depender do carregamento.

// Escapa HTML antes de interpolar qualquer texto de origem não confiável
// (formulário público, input de usuária) num e-mail — sem isso, dá pra
// injetar HTML/script no corpo do e-mail que o destinatário abre.
export function escapeHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const FONTE_UI = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

export function emailPolia({
  preheader,
  headline,
  paragrafos,
  corpoHtml,
  ctaLabel,
  ctaUrl,
  rodapeHtml,
}: {
  preheader: string;
  headline: string;
  /** Corpo em parágrafos simples: o caminho dos 9 e-mails transacionais. */
  paragrafos?: string[];
  /** Corpo já em HTML (editor de campanha). Usado no lugar de paragrafos. */
  corpoHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  /** Linha extra no rodapé, acima do "Pólia · usepolia.com.br" (descadastro). */
  rodapeHtml?: string;
}): string {
  const corpo =
    corpoHtml ??
    (paragrafos ?? [])
      .map(
        (p) =>
          `<p style="margin:0 0 16px;font-family:${FONTE_UI};font-size:15px;line-height:1.6;color:#2C2C2C;">${p}</p>`,
      )
      .join("\n");

  const botao =
    ctaLabel && ctaUrl
      ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
        <tr>
          <td style="border-radius:8px;background-color:#7CCBCD;">
            <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;font-family:${FONTE_UI};font-size:15px;font-weight:600;color:#0A0A0A;text-decoration:none;border-radius:8px;">
              ${ctaLabel}
            </a>
          </td>
        </tr>
      </table>`
      : "";

  const rodapeExtra = rodapeHtml
    ? `<p style="margin:0 0 8px;font-family:${FONTE_UI};font-size:12px;line-height:1.6;color:#9E9E9E;">${rodapeHtml}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${headline}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F2F0ED;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F2F0ED;">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
            <tr>
              <td style="padding-bottom:24px;text-align:left;">
                <span style="font-family:Georgia,'Times New Roman',serif;font-size:22px;color:#0A0A0A;">Pólia</span>
              </td>
            </tr>
            <tr>
              <td style="background-color:#ffffff;border:1px solid #E6E6E6;border-radius:12px;padding:32px;">
                <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#0A0A0A;">
                  ${headline}
                </h1>
                ${corpo}
                ${botao}
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;text-align:left;">
                ${rodapeExtra}
                <p style="margin:0;font-family:${FONTE_UI};font-size:12px;color:#9E9E9E;">
                  Pólia · usepolia.com.br
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
