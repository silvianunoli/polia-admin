import { describe, it, expect, vi, beforeEach } from "vitest";

// CRM-10. Mesmo builder falso de convites.functions.test.ts. O que importa:
// profiles.plano e is_admin são escritos com service role, então assertAdmin é
// a ÚNICA trava; e ninguém tira o próprio admin no meio da ação.
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
          fn({ data: validator(opts?.data), context: opts?.context ?? { userId: ADMIN } });
      },
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));

const { filas, chamadas, from, logAcaoAdminServer } = vi.hoisted(() => {
  const filas = new Map<string, { data?: unknown; error?: unknown }[]>();
  const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
  const METODOS = ["select", "eq", "order", "limit", "update", "maybeSingle"];
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
  return { filas, chamadas, from, logAcaoAdminServer: vi.fn() };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/audit-log.server", () => ({ logAcaoAdminServer }));

import { atualizarAcessoDaUsuaria, lerAcessoDaUsuaria } from "./acesso-usuaria.functions";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";

type Chamada = (opts?: { data?: unknown; context?: { userId: string } }) => Promise<unknown>;
const ler = lerAcessoDaUsuaria as unknown as Chamada;
const atualizar = atualizarAcessoDaUsuaria as unknown as Chamada;

function enfileirar(tabela: string, ...rs: { data?: unknown; error?: unknown }[]) {
  filas.set(tabela, [...(filas.get(tabela) ?? []), ...rs]);
}
const admin = (ok = true) => enfileirar("profiles", { data: { is_admin: ok }, error: null });
const args = (tabela: string, metodo: string) =>
  chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.args);

beforeEach(() => {
  filas.clear();
  chamadas.length = 0;
  vi.resetAllMocks();
});

describe("lerAcessoDaUsuaria", () => {
  it("bloqueia quem não é admin", async () => {
    admin(false);
    await expect(ler({ data: { userId: ANA } })).rejects.toThrow("Forbidden");
    expect(args("assinaturas", "select")).toEqual([]);
  });

  it("devolve plano, admin e a assinatura mais recente", async () => {
    admin();
    enfileirar("profiles", { data: { plano: "controle", is_admin: null }, error: null });
    enfileirar("assinaturas", {
      data: { status: "active", cancel_at_period_end: true },
      error: null,
    });
    await expect(ler({ data: { userId: ANA } })).resolves.toEqual({
      plano: "controle",
      is_admin: false,
      assinatura: { status: "active", cancel_at_period_end: true },
    });
  });

  it("quem nunca assinou volta com assinatura null", async () => {
    admin();
    enfileirar("profiles", { data: { plano: "confere", is_admin: false }, error: null });
    const r = (await ler({ data: { userId: ANA } })) as { assinatura: unknown };
    expect(r.assinatura).toBeNull();
  });

  it("recusa id que não é uuid antes de consultar", async () => {
    await expect(ler({ data: { userId: "1 or 1=1" } })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });
});

describe("atualizarAcessoDaUsuaria", () => {
  it("bloqueia quem não é admin antes de escrever", async () => {
    admin(false);
    await expect(
      atualizar({ data: { userId: ANA, plano: "projete", is_admin: false } }),
    ).rejects.toThrow("Forbidden");
    expect(args("profiles", "update")).toEqual([]);
  });

  it("recusa plano fora da lista, inclusive cancelada e nome visível", async () => {
    for (const plano of ["cancelada", "Premium", "comeco"]) {
      await expect(atualizar({ data: { userId: ANA, plano, is_admin: false } })).rejects.toThrow();
    }
    expect(chamadas).toHaveLength(0);
  });

  it("não deixa a administradora tirar o próprio admin", async () => {
    admin();
    await expect(
      atualizar({ data: { userId: ADMIN, plano: "beta", is_admin: false } }),
    ).rejects.toThrow("próprio acesso");
    expect(args("profiles", "update")).toEqual([]);
  });

  it("muda o plano e registra antes e depois no log", async () => {
    admin();
    enfileirar("profiles", { data: { plano: "confere", is_admin: false }, error: null });
    enfileirar("profiles", { error: null });
    await expect(
      atualizar({ data: { userId: ANA, plano: "controle", is_admin: false } }),
    ).resolves.toEqual({ ok: true });
    expect(args("profiles", "update")).toEqual([[{ plano: "controle", is_admin: false }]]);
    expect(logAcaoAdminServer).toHaveBeenCalledWith(
      ADMIN,
      "usuaria_acesso",
      `${ANA} · plano controle`,
      {
        antes: { plano: "confere", is_admin: false },
        depois: { plano: "controle", is_admin: false },
      },
    );
  });

  it("dar ou tirar admin tem ação própria no log", async () => {
    admin();
    enfileirar("profiles", { data: { plano: "beta", is_admin: false }, error: null });
    enfileirar("profiles", { error: null });
    await atualizar({ data: { userId: ANA, plano: "beta", is_admin: true } });
    expect(logAcaoAdminServer.mock.calls[0][1]).toBe("usuaria_acesso_admin");
  });

  it("usuária que não existe não vira update", async () => {
    admin();
    enfileirar("profiles", { data: null, error: null });
    await expect(
      atualizar({ data: { userId: ANA, plano: "controle", is_admin: false } }),
    ).rejects.toThrow("Não achei");
    expect(args("profiles", "update")).toEqual([]);
  });

  it("falha do banco vira erro e não vai pro log", async () => {
    admin();
    enfileirar("profiles", { data: { plano: "confere", is_admin: false }, error: null });
    enfileirar("profiles", { error: { message: "boom" } });
    await expect(
      atualizar({ data: { userId: ANA, plano: "controle", is_admin: false } }),
    ).rejects.toThrow("Falha ao mudar");
    expect(logAcaoAdminServer).not.toHaveBeenCalled();
  });
});
