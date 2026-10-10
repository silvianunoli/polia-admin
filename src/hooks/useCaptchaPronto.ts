import { useEffect, useState } from "react";

// O token do Turnstile é de uso único: depois de cada envio a tela pede outro
// e, até o widget devolver, o próximo envio sai sem token e volta "Confirma
// que não é um robô". Botão de reenvio espera o token novo.
//
// Se o widget não carregar (bloqueador de anúncio), o token nunca chega. Aí,
// depois da espera, o botão libera mesmo assim e quem decide é o Supabase,
// igual ao envio principal (ver src/lib/captcha.ts).
const ESPERA_MAX_MS = 8000;

export function useCaptchaPronto(
  captcha: { token: string | null; pedidoDeReset: number },
  esperaMs = ESPERA_MAX_MS,
): boolean {
  // Guarda pra qual pedido de token a espera esgotou: um reset novo zera a
  // liberação no mesmo render, sem janela de clique com token velho.
  const [esgotouNoPedido, setEsgotouNoPedido] = useState<number | null>(null);
  const { token, pedidoDeReset } = captcha;

  useEffect(() => {
    if (token) return;
    const t = setTimeout(() => setEsgotouNoPedido(pedidoDeReset), esperaMs);
    return () => clearTimeout(t);
  }, [token, pedidoDeReset, esperaMs]);

  return !!token || esgotouNoPedido === pedidoDeReset;
}
