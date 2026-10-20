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

const { filas, chamadas, from, logAcaoAdminServer, auth, rpc, cancelar, testesAbertos } =
  vi.hoisted(() => {
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
    const auth = { admin: { getUserById: vi.fn(), deleteUser: vi.fn(), listUsers: vi.fn() } };
    return {
      filas,
      chamadas,
      from,
      logAcaoAdminServer: vi.fn(),
      auth,
      rpc: vi.fn(),
      cancelar: vi.fn(),
      testesAbertos: vi.fn(),
    };
  });

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from, auth, rpc } }));
vi.mock("@/lib/audit-log.server", () => ({ logAcaoAdminServer }));
vi.mock("@/lib/teste-pro.server", () => ({ testesAbertos }));
vi.mock("@/lib/stripe.functions", () => ({
  stripeClient: () => ({ subscriptions: { cancel: cancelar } }),
}));

import {
  atualizarAcessoDaUsuaria,
  excluirCadastroDaUsuaria,
  lerAcessoDaUsuaria,
  listarEmailsDasUsuarias,
  mascararEmail,
} from "./acesso-usuaria.functions";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";

type Chamada = (opts?: { data?: unknown; context?: { userId: string } }) => Promise<unknown>;
const ler = lerAcessoDaUsuaria as unknown as Chamada;
const atualizar = atualizarAcessoDaUsuaria as unknown as Chamada;
const excluir = excluirCadastroDaUsuaria as unknown as Chamada;

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
  testesAbertos.mockResolvedValue(new Map());
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
    auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "ana@gmail.com" } } });
    await expect(ler({ data: { userId: ANA } })).resolves.toEqual({
      email: "ana@gmail.com",
      plano: "controle",
      is_admin: false,
      assinatura: { status: "active", cancel_at_period_end: true },
      testeProAte: null,
    });
  });

  it("conta no teste de 7 dias do Pro volta com a data de fim do teste", async () => {
    admin();
    enfileirar("profiles", { data: { plano: "projete", is_admin: false }, error: null });
    testesAbertos.mockResolvedValue(new Map([[ANA, "2026-10-27T12:00:00.000Z"]]));
    const r = (await ler({ data: { userId: ANA } })) as {
      plano: string;
      testeProAte: string | null;
      assinatura: unknown;
    };
    expect(testesAbertos).toHaveBeenCalledWith([ANA]);
    expect(r.plano).toBe("projete");
    expect(r.testeProAte).toBe("2026-10-27T12:00:00.000Z");
    expect(r.assinatura).toBeNull();
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

describe("excluirCadastroDaUsuaria", () => {
  const alvo = (is_admin = false) =>
    enfileirar("profiles", { data: { is_admin, full_name: "Ana" }, error: null });
  const caminhoFeliz = () => {
    auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "ana.lima@gmail.com" } } });
    rpc.mockResolvedValue({ error: null });
    auth.admin.deleteUser.mockResolvedValue({ error: null });
  };

  it("bloqueia quem não é admin antes de apagar qualquer coisa", async () => {
    admin(false);
    await expect(excluir({ data: { userId: ANA } })).rejects.toThrow("Forbidden");
    expect(rpc).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("recusa id que não é uuid antes de consultar", async () => {
    await expect(excluir({ data: { userId: "1 or 1=1" } })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("não exclui a própria conta", async () => {
    admin();
    const r = (await excluir({ data: { userId: ADMIN } })) as { ok: boolean; error: string };
    expect(r.ok).toBe(false);
    expect(r.error).toContain("própria conta");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("não exclui conta de administradora", async () => {
    admin();
    alvo(true);
    const r = (await excluir({ data: { userId: ANA } })) as { ok: boolean; error: string };
    expect(r).toMatchObject({ ok: false });
    expect(r.error).toContain("Acesso de administradora");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("usuária que não existe não vira exclusão", async () => {
    admin();
    enfileirar("profiles", { data: null, error: null });
    await expect(excluir({ data: { userId: ANA } })).resolves.toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sem assinatura: apaga dados, depois login, e registra com e-mail mascarado", async () => {
    admin();
    alvo();
    caminhoFeliz();
    await expect(excluir({ data: { userId: ANA } })).resolves.toEqual({
      ok: true,
      assinaturaCancelada: false,
      error: null,
    });
    expect(cancelar).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("excluir_dados_da_usuaria", { alvo: ANA });
    expect(auth.admin.deleteUser).toHaveBeenCalledWith(ANA);
    expect(logAcaoAdminServer).toHaveBeenCalledWith(ADMIN, "usuaria_excluida", ANA, {
      email: "ana***@gmail.com",
      assinatura_cancelada: false,
    });
  });

  it("assinatura cobrando é cancelada no Stripe antes de apagar", async () => {
    admin();
    alvo();
    caminhoFeliz();
    enfileirar("assinaturas", {
      data: { stripe_subscription_id: "sub_123", status: "active" },
      error: null,
    });
    const r = (await excluir({ data: { userId: ANA } })) as { assinaturaCancelada: boolean };
    expect(cancelar).toHaveBeenCalledWith("sub_123");
    expect(r.assinaturaCancelada).toBe(true);
  });

  it("assinatura já cancelada não chama o Stripe", async () => {
    admin();
    alvo();
    caminhoFeliz();
    enfileirar("assinaturas", {
      data: { stripe_subscription_id: "sub_123", status: "canceled" },
      error: null,
    });
    await excluir({ data: { userId: ANA } });
    expect(cancelar).not.toHaveBeenCalled();
  });

  it("Stripe falhou: nada é apagado", async () => {
    admin();
    alvo();
    caminhoFeliz();
    enfileirar("assinaturas", {
      data: { stripe_subscription_id: "sub_123", status: "past_due" },
      error: null,
    });
    cancelar.mockRejectedValue(new Error("stripe fora"));
    const r = (await excluir({ data: { userId: ANA } })) as { error: string };
    expect(r.error).toContain("nada foi apagado");
    expect(rpc).not.toHaveBeenCalled();
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("falha ao apagar dados não chega a apagar o login", async () => {
    admin();
    alvo();
    caminhoFeliz();
    rpc.mockResolvedValue({ error: { message: "boom" } });
    const r = (await excluir({ data: { userId: ANA } })) as { error: string };
    expect(r.error).toContain("Nada foi apagado");
    expect(auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(logAcaoAdminServer).not.toHaveBeenCalled();
  });

  it("login que não sai vira erro e fica no log como parcial", async () => {
    admin();
    alvo();
    caminhoFeliz();
    auth.admin.deleteUser.mockResolvedValue({ error: { message: "Database error" } });
    const r = (await excluir({ data: { userId: ANA } })) as { error: string };
    expect(r.error).toContain("login ainda existe");
    expect(logAcaoAdminServer.mock.calls[0][1]).toBe("usuaria_excluida_parcial");
  });
});

describe("listarEmailsDasUsuarias", () => {
  const listar = listarEmailsDasUsuarias as unknown as Chamada;

  it("bloqueia quem não é admin", async () => {
    admin(false);
    await expect(listar()).rejects.toThrow("Forbidden");
    expect(auth.admin.listUsers).not.toHaveBeenCalled();
  });

  it("devolve id -> e-mail e pula conta sem e-mail", async () => {
    admin();
    auth.admin.listUsers.mockResolvedValue({
      data: {
        users: [
          { id: ANA, email: "ana@gmail.com" },
          { id: ADMIN, email: null },
        ],
      },
      error: null,
    });
    await expect(listar()).resolves.toEqual({ [ANA]: "ana@gmail.com" });
  });
});

describe("mascararEmail", () => {
  it("mostra só o começo do nome", () => {
    expect(mascararEmail("silvia@gmail.com")).toBe("sil***@gmail.com");
    expect(mascararEmail(null)).toBe("sem e-mail");
  });
});
