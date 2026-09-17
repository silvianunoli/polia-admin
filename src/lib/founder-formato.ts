export function formatarDuracao(segundos: number | null | undefined): string {
  if (segundos === null || segundos === undefined) return "—";
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const resto = s % 60;
  if (m < 60) return resto ? `${m}m ${resto}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

export function formatarDataHoraBRT(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarDataBRT(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function formatarPct(valor: number | null | undefined, casas = 0): string {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return "—";
  return `${valor.toFixed(casas)}%`;
}

export function formatarNumero(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—";
  return valor.toLocaleString("pt-BR");
}

export const NOME_PLANO: Record<string, string> = {
  beta: "Lançamento",
  confere: "Grátis",
  controle: "Premium",
  projete: "Pro",
  cancelada: "Cancelada",
};

export function nomePlano(plano: string | null | undefined): string {
  if (!plano) return "—";
  return NOME_PLANO[plano] ?? plano;
}
