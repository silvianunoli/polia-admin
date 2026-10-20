import { nomePlano } from "@/lib/founder-formato";

// Teste de 7 dias do Pro (reverse trial, GRW-66, 20/10/2026). Durante o teste
// a conta fica com profiles.plano = 'projete' DE VERDADE, sem assinatura no
// Stripe. Quem diz que é teste é a tabela public.testes_pro (migração
// 20261020120000_teste_pro_7_dias.sql no polia-app). No admin, conta em teste
// aberto aparece como "Pro (teste até dd/mm)" e NÃO conta como assinante,
// pagante nem conversão: pra receita ela é Grátis.
//
// Funções puras (sem banco) pra caber em teste. Quem lê a tabela é
// teste-pro.server.ts, que trata erro de leitura como "nenhum teste".

export interface TesteProLinha {
  user_id: string;
  inicio: string;
  fim: string;
  origem: string;
  encerrado_em: string | null;
  resultado: string | null;
}

/** Teste aberto = não foi encerrado e o fim ainda não chegou. */
export function testeAberto(
  t: Pick<TesteProLinha, "fim" | "encerrado_em">,
  agora: number = Date.now(),
): boolean {
  if (t.encerrado_em) return false;
  const fim = Date.parse(t.fim);
  return Number.isFinite(fim) && fim > agora;
}

/** user_id -> fim do teste, só dos testes abertos agora. */
export function testesAbertosPorUsuaria(
  testes: readonly TesteProLinha[],
  agora: number = Date.now(),
): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of testes) if (testeAberto(t, agora)) m.set(t.user_id, t.fim);
  return m;
}

/** dd/mm no fuso de Brasília. */
export function diaMesBRT(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

/**
 * Nome do plano pra tela. Com teste aberto (testeAte preenchido) e o plano
 * ainda Pro, vira "Pro (teste até dd/mm)". Se alguém mudou o plano à mão no
 * meio do teste, mostra o plano real.
 */
export function rotuloPlano(plano: string | null | undefined, testeAte?: string | null): string {
  if (testeAte && plano === "projete")
    return `${nomePlano(plano)} (teste até ${diaMesBRT(testeAte)})`;
  return nomePlano(plano);
}

export interface ResumoTestePro {
  /** Teste aberto agora. */
  emTeste: number;
  /** Fechados pelo cron ou pela assinatura (encerrado_em preenchido). */
  encerrados: number;
  assinaram: number;
  voltaramGratis: number;
  /** Fim já passou, mas o cron (a cada 15 min) ainda não fechou. */
  aguardandoFechamento: number;
  /** assinaram / encerrados, em %. null sem nenhum encerrado. */
  taxaConversao: number | null;
}

export function resumirTestesPro(
  testes: readonly TesteProLinha[],
  agora: number = Date.now(),
): ResumoTestePro {
  let emTeste = 0;
  let encerrados = 0;
  let assinaram = 0;
  let voltaramGratis = 0;
  let aguardandoFechamento = 0;
  for (const t of testes) {
    if (t.encerrado_em) {
      encerrados += 1;
      if (t.resultado === "assinou") assinaram += 1;
      else if (t.resultado === "voltou_gratis") voltaramGratis += 1;
    } else if (testeAberto(t, agora)) {
      emTeste += 1;
    } else {
      aguardandoFechamento += 1;
    }
  }
  return {
    emTeste,
    encerrados,
    assinaram,
    voltaramGratis,
    aguardandoFechamento,
    taxaConversao: encerrados ? (assinaram / encerrados) * 100 : null,
  };
}
