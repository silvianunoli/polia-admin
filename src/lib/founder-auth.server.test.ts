import { describe, it, expect, vi, beforeEach } from "vitest";

// assertAdmin é a única trava entre "JWT válido" e "pode ver o office". O
// middleware requireSupabaseAuth só garante que a pessoa está logada no
// produto, e QUALQUER usuária da Pólia está. Quem decide se ela entra aqui é
// o is_admin de profiles, lido com service role. Cada ramo abaixo é um jeito
// de uma usuária comum acabar dentro do Founder Dashboard se regredir.
const { maybeSingle, eq, select, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { maybeSingle, eq, select, from };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));

import { assertAdmin } from "./founder-auth.server";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("assertAdmin", () => {
  it("deixa passar quando o perfil tem is_admin = true", async () => {
    maybeSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    await expect(assertAdmin("admin-1")).resolves.toBeUndefined();
  });

  it("bloqueia usuária comum do produto (is_admin = false)", async () => {
    maybeSingle.mockResolvedValue({ data: { is_admin: false }, error: null });
    await expect(assertAdmin("user-1")).rejects.toThrow("Forbidden");
  });

  it("bloqueia quando o perfil não existe", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(assertAdmin("fantasma")).rejects.toThrow("Forbidden");
  });

  it("bloqueia quando is_admin nunca foi preenchido (null)", async () => {
    maybeSingle.mockResolvedValue({ data: { is_admin: null }, error: null });
    await expect(assertAdmin("user-2")).rejects.toThrow("Forbidden");
  });

  it("bloqueia quando a consulta falha: erro de banco nunca vira acesso", async () => {
    // Fail closed. Se o Supabase cair, a resposta certa é "não", não "sim".
    maybeSingle.mockResolvedValue({ data: null, error: { message: "timeout" } });
    await expect(assertAdmin("user-3")).rejects.toThrow("Forbidden");
  });

  it("consulta profiles pelo id recebido, só a coluna is_admin", async () => {
    maybeSingle.mockResolvedValue({ data: { is_admin: true }, error: null });
    await assertAdmin("admin-9");
    expect(from).toHaveBeenCalledWith("profiles");
    expect(select).toHaveBeenCalledWith("is_admin");
    expect(eq).toHaveBeenCalledWith("id", "admin-9");
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});
