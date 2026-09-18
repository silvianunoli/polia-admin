// Envio de e-mail pelo Resend. A casca HTML (escapeHtml/emailPolia) mora em
// email-casca.ts, sem dependência de servidor, e é reexportada aqui pra todos
// os imports antigos continuarem valendo.
import { escapeHtml, emailPolia, emailPoliaEditorial } from "@/lib/email-casca";

export { escapeHtml, emailPolia, emailPoliaEditorial };

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
