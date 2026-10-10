import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
let scriptPromise: Promise<void> | null = null;

function carregarScriptTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existente = document.querySelector(`script[src="${SCRIPT_SRC}"]`);
    if (existente) {
      existente.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Falha ao carregar o Turnstile"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export function useTurnstile() {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // Fica true quando o script do Cloudflare falha ao carregar (bloqueador de
  // anúncio/privacidade, rede instável). Sem isso, o widget nunca aparece e o
  // botão de envio continua clicável até o submit tropeçar num erro genérico.
  const [erroCarregamento, setErroCarregamento] = useState(false);

  useEffect(() => {
    let cancelado = false;
    carregarScriptTurnstile()
      .then(() => {
        if (cancelado || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          action: "turnstile-spin-v1",
          callback: (t: string) => setToken(t),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
      })
      .catch(() => {
        setToken(null);
        setErroCarregamento(true);
      });
    return () => {
      cancelado = true;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
    };
  }, []);

  function reset() {
    setToken(null);
    if (widgetIdRef.current && window.turnstile) window.turnstile.reset(widgetIdRef.current);
  }

  return { containerRef, token, reset, erroCarregamento };
}
