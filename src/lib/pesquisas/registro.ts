// Registro de todas as pesquisas definidas em código. Pesquisa nova = arquivo
// novo aqui dentro + entrada neste array + linha correspondente na tabela
// `pesquisas` (migração). O admin lista o que está aqui; a página pública
// resolve qual delas está `ativa` no banco (ver pesquisa.functions.ts).

import type { PesquisaConfig } from "./tipos";
import { discoveryNegocio } from "./discovery-negocio";
import { pesquisaPrecificacao } from "./pesquisa-precificacao";

export const PESQUISAS: PesquisaConfig[] = [discoveryNegocio, pesquisaPrecificacao];

export function pesquisaPorSlug(slug: string): PesquisaConfig | undefined {
  return PESQUISAS.find((p) => p.slug === slug);
}

export function perguntasPorId(
  config: PesquisaConfig,
): Record<string, PesquisaConfig["perguntas"][number]> {
  return Object.fromEntries(config.perguntas.map((p) => [p.id, p]));
}

export function totalPerguntas(config: PesquisaConfig): number {
  return config.perguntas.length;
}

export function perguntaPorOrdem(config: PesquisaConfig, ordem: number) {
  return config.perguntas.find((p) => p.ordem === ordem);
}

export type { PesquisaConfig, Pergunta, TipoPergunta, OpcaoPergunta } from "./tipos";
