import { describe, expect, it } from "vitest";
import { eventoDeCortesia } from "./founder-cortesia";

describe("eventoDeCortesia", () => {
  it("só a marca cortesia: true conta como cortesia", () => {
    expect(eventoDeCortesia({ propriedades: { cortesia: true, status: "active" } })).toBe(true);
    expect(eventoDeCortesia({ propriedades: { status: "active" } })).toBe(false);
    expect(eventoDeCortesia({ propriedades: { cortesia: "sim" } })).toBe(false);
  });

  it("evento antigo sem propriedades continua contando", () => {
    expect(eventoDeCortesia({ propriedades: null })).toBe(false);
    expect(eventoDeCortesia({})).toBe(false);
  });
});
