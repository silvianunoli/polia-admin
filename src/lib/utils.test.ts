import { describe, it, expect } from "vitest";
import { cn } from "./utils";

// Wrapper de clsx + tailwind-merge. Um teste só, pra provar que é o merge
// (que resolve conflito) e não só a concatenação.
describe("cn", () => {
  it("a última classe conflitante vence e condicional falsa some", () => {
    const escondido = false as boolean;
    expect(cn("px-2 text-[var(--ink)]", escondido && "hidden", "px-4")).toBe(
      "text-[var(--ink)] px-4",
    );
  });
});
