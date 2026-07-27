// Verificação server-side do Cloudflare Turnstile.
//
// IMPORTANTE: o token do Turnstile é de USO ÚNICO. Valide-o só aqui, no
// servidor — nunca também no cliente com o mesmo token, senão a segunda
// verificação falha ("timeout-or-duplicate"). Este helper chama o Worker de
// siteverify (que guarda o TURNSTILE_SECRET_KEY) — a mesma URL que o cliente
// já usava, mas agora quem decide bloquear é o servidor.
//
// Fail-closed: sem token, sem URL configurada, ou erro de rede → retorna false
// (bloqueia). É um gate anti-abuso; na dúvida, barra.
export async function verificarTurnstileServer(
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;

  const url = import.meta.env.VITE_TURNSTILE_VERIFY_URL as string | undefined;
  if (!url) {
    console.error("[Turnstile] VITE_TURNSTILE_VERIFY_URL ausente — bloqueando por segurança.");
    return false;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return !!data.success;
  } catch {
    return false;
  }
}
