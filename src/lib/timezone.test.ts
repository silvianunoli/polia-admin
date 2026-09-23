import { describe, it, expect } from "vitest";
import { saoPauloLocalInputToUtcIso, utcIsoToSaoPauloLocalInput } from "./timezone";

// O <input type="datetime-local"> do agendador não tem fuso. Se a conversão
// escorregar, o post agendado pras 9h sai às 6h ou ao meio-dia, e a
// fundadora só descobre pelo Instagram.

describe("saoPauloLocalInputToUtcIso", () => {
  it("interpreta a hora de parede como Brasília e devolve UTC", () => {
    expect(saoPauloLocalInputToUtcIso("2026-07-10T09:00")).toBe("2026-07-10T12:00:00.000Z");
  });

  it("meia-noite em Brasília é 03:00 UTC do mesmo dia", () => {
    expect(saoPauloLocalInputToUtcIso("2026-07-10T00:00")).toBe("2026-07-10T03:00:00.000Z");
  });

  it("fim de noite atravessa o ano em UTC", () => {
    expect(saoPauloLocalInputToUtcIso("2026-12-31T22:30")).toBe("2027-01-01T01:30:00.000Z");
  });

  it("respeita a tabela histórica de fuso, não um -3 fixo", () => {
    // Dezembro de 2018 ainda tinha horário de verão (UTC-2). Se um dia o
    // Brasil voltar com ele, a função continua certa sem ninguém mexer.
    expect(saoPauloLocalInputToUtcIso("2018-12-01T09:00")).toBe("2018-12-01T11:00:00.000Z");
  });
});

describe("utcIsoToSaoPauloLocalInput", () => {
  it("converte UTC do banco pra hora de parede de Brasília", () => {
    expect(utcIsoToSaoPauloLocalInput("2026-07-10T12:00:00.000Z")).toBe("2026-07-10T09:00");
  });

  it("volta um dia (e um ano) quando o UTC já virou", () => {
    expect(utcIsoToSaoPauloLocalInput("2026-01-01T02:30:00.000Z")).toBe("2025-12-31T23:30");
  });

  it("meia-noite sai como 00:00, nunca 24:00", () => {
    // Intl com hour12:false já devolveu "24" à meia-noite em versões antigas
    // do ICU; "T24:00" é valor inválido pro input.
    expect(utcIsoToSaoPauloLocalInput("2026-07-10T03:00:00.000Z")).toBe("2026-07-10T00:00");
  });

  it("descarta os segundos, que o input não aceita", () => {
    expect(utcIsoToSaoPauloLocalInput("2026-07-10T12:34:56.000Z")).toBe("2026-07-10T09:34");
  });
});

describe("ida e volta", () => {
  it.each(["2026-07-10T09:00", "2028-02-29T10:15", "2026-01-01T00:00", "2026-12-31T23:59"])(
    "%s sobrevive a input -> UTC -> input",
    (local) => {
      expect(utcIsoToSaoPauloLocalInput(saoPauloLocalInputToUtcIso(local))).toBe(local);
    },
  );
});
