/*
  Fuso horário: a fronteira entre o que a pessoa vê e o que o banco guarda.

  O problema que originou este arquivo: um post agendado para 11:00 foi
  publicado às 8:00. O seletor `datetime-local` devolve "2026-08-12T11:00" — sem
  fuso nenhum. Gravado direto num `timestamptz`, o Postgres assume UTC, e 11:00
  UTC no Brasil é 8:00 da manhã. Três horas antes, todo dia, em silêncio.

  A regra desta camada:

    GRAVAR  → sempre em UTC, com fuso explícito (`isoDeLocal`)
    MOSTRAR → sempre no fuso de quem olha (`horaLocal`, `dataLocal`)

  Nada de fatiar a string do banco para pegar a hora. `"...T14:00:00+00".slice(11,16)`
  devolve "14:00", que é a hora de Londres — foi assim que o calendário passou a
  mostrar um horário e o robô a usar outro.
*/

/** Já tem fuso declarado? ("Z" ou "+03:00" no fim) */
function temFuso(valor: string): boolean {
  return /[zZ]$/.test(valor) || /[+-]\d{2}:\d{2}$/.test(valor);
}

/**
 * Hora escolhida na tela → instante em UTC para o banco.
 *
 * Aceita "2026-08-12T11:00" (do `datetime-local`) ou "2026-08-12T11:00:00".
 * Um valor que JÁ traz fuso passa intacto: a função é idempotente de propósito,
 * porque nem toda chamada sabe de onde veio o valor.
 */
export function isoDeLocal(valor: string): string {
  if (!valor) return valor;
  if (temFuso(valor)) return valor;
  // Sem fuso, o navegador interpreta como hora LOCAL — que é exatamente o que a
  // pessoa quis dizer ao digitar no seletor.
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor;
  return d.toISOString();
}

/** Instante do banco → "HH:MM" no fuso de quem está olhando. */
export function horaLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Instante do banco → "dd/mm" no fuso de quem está olhando. */
export function dataLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Instante do banco → valor para um campo `datetime-local`.
 * O campo não aceita fuso; precisa da hora local já formatada.
 */
export function paraCampoLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
