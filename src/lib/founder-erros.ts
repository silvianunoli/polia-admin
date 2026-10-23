// Classificação dos erros de erros_app (FND-14, 23/10/2026). A mensagem crua
// vem do navegador, em inglês e minificada ("Minified React error #418"); aqui
// cada padrão conhecido ganha título em português, categoria e gravidade. A
// mensagem original não some: segue na tabela pra investigação.
//
// Regra por padrão de texto, em ordem: o primeiro que casar vence. Por isso o
// "Failed to fetch dynamically imported module" vem antes do "Failed to fetch"
// genérico de conexão.

import type { Estado } from "@/components/founder/EstadoPill";

export type Gravidade = "quebra" | "investigar" | "recupera" | "ruido";

export const GRAVIDADE: Record<Gravidade, { rotulo: string; estado: Estado; ordem: number }> = {
  quebra: { rotulo: "Quebra a tela", estado: "critico", ordem: 0 },
  investigar: { rotulo: "A investigar", estado: "atencao", ordem: 1 },
  recupera: { rotulo: "Se recupera sozinho", estado: "operacional", ordem: 2 },
  ruido: { rotulo: "Ruído", estado: "sem_dados", ordem: 3 },
};

export type Classificacao = { titulo: string; categoria: string; gravidade: Gravidade };

const REGRAS: { padrao: RegExp; c: Classificacao }[] = [
  {
    padrao:
      /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS/i,
    c: {
      titulo: "Versão antiga da página depois de uma atualização",
      categoria: "Versão antiga após atualização",
      gravidade: "quebra",
    },
  },
  {
    padrao: /React error #418|React error #425|Hydration failed|didn't match the client/i,
    c: {
      titulo: "A página chegou diferente do que o navegador esperava",
      categoria: "Página diferente do esperado",
      gravidade: "recupera",
    },
  },
  {
    padrao: /React error #520|error during concurrent rendering/i,
    c: {
      titulo: "O React refez a página depois de uma falha",
      categoria: "Página refeita pelo React",
      gravidade: "recupera",
    },
  },
  {
    padrao: /"code":\s*"invalid_|ZodError|Invalid email/i,
    c: {
      titulo: "Link com dado inválido no endereço",
      categoria: "Link com dado inválido",
      gravidade: "quebra",
    },
  },
  {
    padrao: /Java object is gone/i,
    c: {
      titulo: "O aplicativo Android fechou no meio de uma ação",
      categoria: "Ambiente externo",
      gravidade: "ruido",
    },
  },
  {
    padrao: /Failed to execute '(removeChild|insertBefore)' on 'Node'/i,
    c: {
      titulo: "O tradutor ou uma extensão mexeu na página",
      categoria: "Ambiente externo",
      gravidade: "ruido",
    },
  },
  {
    padrao: /ResizeObserver loop|^Script error\.?$/i,
    c: {
      titulo: "Aviso do navegador sem efeito na tela",
      categoria: "Ambiente externo",
      gravidade: "ruido",
    },
  },
  {
    padrao: /Failed to fetch|NetworkError|Load failed|network request failed/i,
    c: {
      titulo: "A conexão da visitante caiu no meio",
      categoria: "Conexão",
      gravidade: "recupera",
    },
  },
];

export function classificarErro(mensagem: string, origem: string): Classificacao {
  for (const r of REGRAS) if (r.padrao.test(mensagem)) return r.c;
  if (origem === "server") {
    return { titulo: "Erro no servidor", categoria: "Servidor", gravidade: "quebra" };
  }
  return {
    titulo: mensagem.slice(0, 90) || "Erro sem mensagem",
    categoria: "Sem classificação",
    gravidade: "investigar",
  };
}

// Nome curto do navegador a partir do user agent gravado em contexto.navegador
// (só erros a partir de 23/10/2026 têm). Os navegadores de dentro de app vêm
// primeiro: são a suspeita principal do erro de página diferente do esperado.
export function nomeNavegador(ua: string | null | undefined): string | null {
  if (!ua) return null;
  if (/Instagram/i.test(ua)) return "Instagram (dentro do app)";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook (dentro do app)";
  if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return "TikTok (dentro do app)";
  if (/; wv\)/.test(ua)) return "Android WebView";
  if (/Edg\//.test(ua)) return "Edge";
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/CriOS|Chrome\//.test(ua)) return /Mobile/.test(ua) ? "Chrome celular" : "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return /iPhone|iPad/.test(ua) ? "Safari iPhone" : "Safari";
  return "Outro";
}
