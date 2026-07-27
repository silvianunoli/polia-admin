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

export function resendApiKey(): string {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[Resend] Missing RESEND_API_KEY environment variable.");
    throw new Error("Missing RESEND_API_KEY environment variable.");
  }
  return key;
}

// Envio best-effort: quem chama decide se uma falha de e-mail deve derrubar
// a operação principal (normalmente não deve — o dado já foi salvo/o estado
// já mudou, o e-mail é só a notificação).
export async function enviarEmailResend(params: {
  to: string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  contexto: string;
}): Promise<boolean> {
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Pólia <naoresponda@usepolia.com.br>",
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
        ...(params.replyTo ? { reply_to: params.replyTo } : {}),
      }),
    });
    if (!resp.ok) {
      console.error(`${params.contexto} Falha ao enviar e-mail:`, await resp.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${params.contexto} Erro ao enviar e-mail:`, err);
    return false;
  }
}

// Casca HTML compartilhada pros e-mails transacionais da Pólia (Resend).
// Layout em tabela + estilo inline: é o padrão robusto pra e-mail — Outlook
// desktop não lê <style>/flexbox/grid, então nada de CSS moderno aqui.
// Paleta e tokens iguais ao .polia-v3 (src/styles.css) — bg pedra, ink quase
// preto, botão turquesa/ink.
// Fonte web (Fraunces) não carrega em cliente de e-mail; o fallback Georgia
// imita o peso serifado sem depender do carregamento.
export function emailPolia({
  preheader,
  headline,
  paragrafos,
  ctaLabel,
  ctaUrl,
}: {
  preheader: string;
  headline: string;
  paragrafos: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const corpoParagrafos = paragrafos
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#2C2C2C;">${p}</p>`,
    )
    .join("\n");

  const botao = ctaLabel && ctaUrl
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
        <tr>
          <td style="border-radius:8px;background-color:#7CCBCD;">
            <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#0A0A0A;text-decoration:none;border-radius:8px;">
              ${ctaLabel}
            </a>
          </td>
        </tr>
      </table>`
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
                ${corpoParagrafos}
                ${botao}
              </td>
            </tr>
            <tr>
              <td style="padding-top:24px;text-align:left;">
                <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#9E9E9E;">
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
