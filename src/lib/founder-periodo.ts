import { z } from "zod";

// Filtro global de período do Founder Dashboard. Vive no search param da rota
// /founder (validateSearch) e é resolvido aqui, em um lugar só, pra todo
// server fn comparar "período atual" contra "período anterior" da mesma
// duração. America/Sao_Paulo é UTC-3 o ano inteiro (sem horário de verão
// desde 2019), então o "hoje" começa à meia-noite BRT, não UTC.

export const periodoSearchSchema = z.object({
  periodo: z.enum(["hoje", "7", "30", "90", "custom"]).default("7"),
  de: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type PeriodoSearch = z.infer<typeof periodoSearchSchema>;

export interface PeriodoResolvido {
  ini: string;
  fim: string;
  iniAnterior: string;
  fimAnterior: string;
  rotulo: string;
  dias: number;
}

const OFFSET_BRT_MS = 3 * 3600000;
const DIA_MS = 86400000;

function inicioDoDiaBR(instante: number): number {
  const brt = instante - OFFSET_BRT_MS;
  return Math.floor(brt / DIA_MS) * DIA_MS + OFFSET_BRT_MS;
}

function dataBRparaUtc(data: string, fimDoDia: boolean): number {
  const base = Date.parse(`${data}T00:00:00.000Z`) + OFFSET_BRT_MS;
  return fimDoDia ? base + DIA_MS - 1 : base;
}

export function resolverPeriodo(search: PeriodoSearch, agora = Date.now()): PeriodoResolvido {
  let ini: number;
  let fim = agora;
  let rotulo: string;

  if (search.periodo === "hoje") {
    ini = inicioDoDiaBR(agora);
    rotulo = "hoje";
  } else if (search.periodo === "custom" && search.de && search.ate) {
    ini = dataBRparaUtc(search.de, false);
    fim = Math.min(dataBRparaUtc(search.ate, true), agora);
    if (fim < ini) fim = ini;
    rotulo = `${search.de} a ${search.ate}`;
  } else {
    const dias = search.periodo === "custom" ? 7 : Number(search.periodo);
    ini = agora - dias * DIA_MS;
    rotulo = `últimos ${dias} dias`;
  }

  const duracao = Math.max(fim - ini, 1);
  const iniAnterior = ini - duracao;
  const fimAnterior = ini;

  return {
    ini: new Date(ini).toISOString(),
    fim: new Date(fim).toISOString(),
    iniAnterior: new Date(iniAnterior).toISOString(),
    fimAnterior: new Date(fimAnterior).toISOString(),
    rotulo,
    dias: Math.max(1, Math.round(duracao / DIA_MS)),
  };
}

export function dataBRT(instante: number | string = Date.now()): string {
  const ms = typeof instante === "string" ? Date.parse(instante) : instante;
  return new Date(ms - OFFSET_BRT_MS).toISOString().slice(0, 10);
}

export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / anterior) * 100;
}
