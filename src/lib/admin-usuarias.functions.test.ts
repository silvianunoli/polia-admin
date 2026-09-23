import { describe, it, expect, vi, beforeEach } from "vitest";

// O builder do TanStack Start vira um que só guarda validador e handler: a
// server fn passa a ser uma função async comum, chamada com { data, context }.
// O middleware real (JWT) fica de fora; o que se prova é o que acontece
// DEPOIS dele, começando pelo gate de admin.
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (i: unknown) => unknown = (i) => i;
    const builder = {
      inputValidator(v: (i: unknown) => unknown) {
        validator = v;
        return builder;
      },
      middleware() {
        return builder;
      },
      handler(fn: (ctx: { data: unknown; context: unknown }) => unknown) {
        return async (opts?: { data?: unknown; context?: unknown }) =>
          fn({ data: validator(opts?.data), context: opts?.context ?? { userId: "admin-1" } });
      },
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

// Supabase falso: cada from(tabela) devolve uma cadeia em que todo método
// volta a própria cadeia, e o await entrega o próximo resultado enfileirado
// pra aquela tabela. Nada de vi.fn na cadeia: o Vitest trataria o retorno
// "thenable" como promessa e consumiria a fila por conta própria.
const { filas, chamadas, from, listUsersMock } = vi.hoisted(() => {
  const filas = new Map<string, { data?: unknown; error?: unknown }[]>();
  const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
  const METODOS = [
    "select",
    "eq",
    "in",
    "order",
    "limit",
    "insert",
    "update",
    "delete",
    "maybeSingle",
    "single",
  ];
  function from(tabela: string) {
    const cadeia: Record<string, unknown> = {};
    for (const m of METODOS) {
      cadeia[m] = (...args: unknown[]) => {
        chamadas.push({ tabela, metodo: m, args });
        return cadeia;
      };
    }
    cadeia.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => {
      const fila = filas.get(tabela);
      const r = fila && fila.length ? fila.shift() : { data: null, error: null };
      return Promise.resolve(r).then(res, rej);
    };
    return cadeia;
  }
  return { filas, chamadas, from, listUsersMock: vi.fn() };
});

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from, auth: { admin: { listUsers: listUsersMock } } },
}));

import { buscarUsuariaPorEmail } from "./admin-usuarias.functions";

type Chamada = (opts?: { data?: unknown; context?: { userId: string } }) => Promise<unknown>;
const buscar = buscarUsuariaPorEmail as unknown as Chamada;

function enfileirar(tabela: string, ...rs: { data?: unknown; error?: unknown }[]) {
  filas.set(tabela, [...(filas.get(tabela) ?? []), ...rs]);
}
const admin = (ok = true) => enfileirar("profiles", { data: { is_admin: ok }, error: null });

beforeEach(() => {
  filas.clear();
  chamadas.length = 0;
  vi.resetAllMocks();
});

describe("buscarUsuariaPorEmail", () => {
  it("bloqueia quem não é admin antes de tocar na Admin API", async () => {
    admin(false);
    await expect(buscar({ data: { email: "ana@exemplo.com" } })).rejects.toThrow("Forbidden");
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("e-mail é obrigatório", async () => {
    await expect(buscar({ data: {} })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("normaliza o e-mail (espaço e maiúscula) antes de comparar", async () => {
    admin();
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "u1", email: "Ana@Exemplo.com" }] },
      error: null,
    });
    enfileirar("profiles", { data: { id: "u1", full_name: "Ana" }, error: null });

    await expect(buscar({ data: { email: "  ANA@exemplo.COM " } })).resolves.toEqual({
      encontrada: true,
      id: "u1",
      email: "Ana@Exemplo.com",
      nome: "Ana",
    });
  });

  it("sem perfil, o nome vira travessão de vazio", async () => {
    admin();
    listUsersMock.mockResolvedValue({ data: { users: [{ id: "u1", email: "a@x.com" }] } });
    enfileirar("profiles", { data: null, error: null });
    await expect(buscar({ data: { email: "a@x.com" } })).resolves.toMatchObject({ nome: "—" });
  });

  it("não achou: encontrada false, sem vazar nada", async () => {
    admin();
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    await expect(buscar({ data: { email: "ninguem@x.com" } })).resolves.toEqual({
      encontrada: false,
    });
  });

  it("falha da Admin API vira erro amigável", async () => {
    admin();
    listUsersMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(buscar({ data: { email: "a@x.com" } })).rejects.toThrow(
      "Falha ao buscar usuária.",
    );
  });
});
