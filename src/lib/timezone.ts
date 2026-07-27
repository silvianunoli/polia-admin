const SAO_PAULO_TZ = "America/Sao_Paulo";

function getSaoPauloOffsetMinutes(date: Date): number {
  const utcStr = date.toLocaleString("en-US", { timeZone: "UTC" });
  const spStr = date.toLocaleString("en-US", { timeZone: SAO_PAULO_TZ });
  return (new Date(utcStr).getTime() - new Date(spStr).getTime()) / 60_000;
}

/**
 * Valor de um <input type="datetime-local"> (ex.: "2026-07-10T09:00") é hora
 * de parede sem fuso. Interpreta como America/Sao_Paulo e devolve ISO em UTC.
 */
export function saoPauloLocalInputToUtcIso(localValue: string): string {
  const asIfUtc = new Date(`${localValue}:00Z`);
  const offsetMinutes = getSaoPauloOffsetMinutes(asIfUtc);
  return new Date(asIfUtc.getTime() + offsetMinutes * 60_000).toISOString();
}

/**
 * ISO em UTC (do banco) -> valor pra um <input type="datetime-local">, ou
 * seja, a hora de parede em America/Sao_Paulo.
 */
export function utcIsoToSaoPauloLocalInput(utcIso: string): string {
  const d = new Date(utcIso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
