import { dataBRT } from "@/lib/founder-periodo";

// Ativação "de verdade" (GRW-66, 20/10/2026), em /founder/produto/ativacao.
// Pura (sem banco) pra caber em teste; quem busca é getAtivacaoReal em
// founder-produto.functions.ts.
//
// Ativada = conta que (a) salvou pelo menos 1 produto pela calculadora
// (produtos.calculadora_breakdown não nulo) E (b) voltou em outro dia: tem
// evento em founder_eventos num dia (Brasília) diferente do dia em que criou a
// conta, dentro dos 7 primeiros dias.
//
// Voltaram depois de 48h = das contas com 3 dias ou mais de vida, quantas têm
// evento depois de created_at + 48h.

const DIA_MS = 86_400_000;

export interface ContaNova {
  id: string;
  criadaEm: string;
}

export interface ResultadoAtivacao {
  contas: number;
  ativadas: number;
  /** ativadas / contas, em %. null sem conta. */
  taxa: number | null;
  /** Contas com 3 dias ou mais de vida (base do "voltaram depois de 48h"). */
  base48h: number;
  voltaram48h: number;
  /** voltaram48h / base48h, em %. null sem base. */
  taxa48h: number | null;
}

/** Voltou num dia (Brasília) diferente do cadastro, dentro dos 7 primeiros dias. */
export function voltouEmOutroDia(criadaEm: string, eventos: readonly string[]): boolean {
  const t0 = Date.parse(criadaEm);
  const diaCadastro = dataBRT(t0);
  return eventos.some((iso) => {
    const t = Date.parse(iso);
    return t >= t0 && t < t0 + 7 * DIA_MS && dataBRT(t) !== diaCadastro;
  });
}

/** Tem evento depois de created_at + 48h. */
export function voltouDepoisDe48h(criadaEm: string, eventos: readonly string[]): boolean {
  const limite = Date.parse(criadaEm) + 2 * DIA_MS;
  return eventos.some((iso) => Date.parse(iso) > limite);
}

export function calcularAtivacaoReal(
  contas: readonly ContaNova[],
  calcularamPreco: ReadonlySet<string>,
  eventosPorConta: ReadonlyMap<string, readonly string[]>,
  agora: number = Date.now(),
): ResultadoAtivacao {
  let ativadas = 0;
  let base48h = 0;
  let voltaram48h = 0;
  for (const c of contas) {
    const eventos = eventosPorConta.get(c.id) ?? [];
    if (calcularamPreco.has(c.id) && voltouEmOutroDia(c.criadaEm, eventos)) ativadas += 1;
    if (agora - Date.parse(c.criadaEm) >= 3 * DIA_MS) {
      base48h += 1;
      if (voltouDepoisDe48h(c.criadaEm, eventos)) voltaram48h += 1;
    }
  }
  return {
    contas: contas.length,
    ativadas,
    taxa: contas.length ? (ativadas / contas.length) * 100 : null,
    base48h,
    voltaram48h,
    taxa48h: base48h ? (voltaram48h / base48h) * 100 : null,
  };
}
