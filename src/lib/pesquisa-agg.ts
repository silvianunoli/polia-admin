// Agregação da pesquisa de discovery — funções puras (sem Supabase, sem React).
// O painel /admin/pesquisas monta os gráficos a partir daqui, e o teste cobre
// a lógica que é fácil de errar (taxa, abandono, distribuição sobre respondentes).

import type { Pergunta } from "@/lib/pesquisas/tipos";

export interface RespostaRow {
  progresso: number;
  concluida: boolean;
  respostas: Record<string, unknown>;
  criado_em: string;
}

export interface FunilResumo {
  comecaram: number;
  concluiram: number;
  taxaConclusao: number; // 0..100
}

export function funil(rows: RespostaRow[]): FunilResumo {
  const comecaram = rows.length;
  const concluiram = rows.filter((r) => r.concluida).length;
  return {
    comecaram,
    concluiram,
    taxaConclusao: comecaram ? Math.round((concluiram / comecaram) * 100) : 0,
  };
}

export interface AbandonoItem {
  id: string;
  ordem: number;
  titulo: string;
  abandonos: number;
}

// Entre quem NÃO concluiu, em qual pergunta parou (progresso = ordem da última
// respondida; 0 = começou e não respondeu nenhuma).
export function abandonoPorPergunta(
  rows: RespostaRow[],
  perguntas: Pick<Pergunta, "id" | "ordem" | "titulo">[],
): AbandonoItem[] {
  const naoConcluidos = rows.filter((r) => !r.concluida);
  const contagem = new Map<number, number>();
  for (const r of naoConcluidos) {
    contagem.set(r.progresso, (contagem.get(r.progresso) ?? 0) + 1);
  }
  return perguntas.map((p) => ({
    id: p.id,
    ordem: p.ordem,
    titulo: p.titulo,
    abandonos: contagem.get(p.ordem) ?? 0,
  }));
}

export interface DistribItem {
  id: string;
  rotulo: string;
  contagem: number;
  pct: number; // sobre quem respondeu ESTA pergunta
}

export function distribuicao(rows: RespostaRow[], pergunta: Pergunta): DistribItem[] {
  if (pergunta.tipo === "aberta" || !pergunta.opcoes) return [];
  const ehMultipla = pergunta.tipo === "multipla";
  const respondentes = rows.filter((r) => {
    const v = r.respostas[pergunta.id];
    return ehMultipla ? Array.isArray(v) && v.length > 0 : typeof v === "string";
  });
  const total = respondentes.length;
  return pergunta.opcoes
    .map((op) => {
      const contagem = respondentes.filter((r) => {
        const v = r.respostas[pergunta.id];
        return ehMultipla ? Array.isArray(v) && v.includes(op.id) : v === op.id;
      }).length;
      return {
        id: op.id,
        rotulo: op.rotulo,
        contagem,
        pct: total ? Math.round((contagem / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.contagem - a.contagem);
}

export function respostasAbertas(rows: RespostaRow[], perguntaId: string): string[] {
  return rows
    .map((r) => r.respostas[perguntaId])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

export function filtrarPorSegmento(
  rows: RespostaRow[],
  dimId: string,
  valor: string,
): RespostaRow[] {
  if (!dimId || !valor) return rows;
  return rows.filter((r) => r.respostas[dimId] === valor);
}
