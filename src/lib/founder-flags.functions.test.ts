import { describe, it, expect, vi, beforeEach } from "vitest";

// Ver admin-usuarias.functions.test.ts pra explicação do builder falso e do
// Supabase falso. Aqui o gate é o assertAdmin de founder-auth.server (já
// provado no próprio teste dele), então ele vira espião: o que se prova é
// que TODA server fn chama ele com a usuária logada e para quando ele barra.
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

const { filas, chamadas, from, assertAdmin, logAcaoAdminServer } = vi.hoisted(() => {
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
  return { filas, chamadas, from, assertAdmin: vi.fn(), logAcaoAdminServer: vi.fn() };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/founder-auth.server", () => ({ assertAdmin }));
vi.mock("@/lib/audit-log.server", () => ({ logAcaoAdminServer }));

import {
  getFounderFlags,
  alterarFounderFlag,
  criarFounderFlag,
  getFounderFlagsResumo,
} from "./founder-flags.functions";

type Chamada = (opts?: { data?: unknown; context?: { userId: string } }) => Promise<unknown>;
const fn = (f: unknown) => f as Chamada;

function enfileirar(tabela: string, ...rs: { data?: unknown; error?: unknown }[]) {
  filas.set(tabela, [...(filas.get(tabela) ?? []), ...rs]);
}
const args = (tabela: string, metodo: string) =>
  chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.args);

const UUID = "11111111-1111-4111-8111-111111111111";

const linhaDb = {
  key: "novo_painel",
  ambiente: "prod",
  nome: "Novo painel",
  descricao: null,
  estado: "beta",
  rollout_pct: 25,
  beta_user_ids: null,
  atualizado_em: "2026-09-20T10:00:00Z",
  atualizado_por: "admin-1",
};

beforeEach(() => {
  filas.clear();
  chamadas.length = 0;
  vi.resetAllMocks();
  assertAdmin.mockResolvedValue(undefined);
});

describe.each([
  ["getFounderFlags", getFounderFlags, undefined],
  ["alterarFounderFlag", alterarFounderFlag, { key: "x", ambiente: "prod", estado: "on" }],
  ["criarFounderFlag", criarFounderFlag, { key: "nova_flag", nome: "Nova" }],
  ["getFounderFlagsResumo", getFounderFlagsResumo, undefined],
])("%s", (_nome, serverFn, data) => {
  it("passa pelo assertAdmin com a usuária logada e para se ele barrar", async () => {
    assertAdmin.mockRejectedValue(new Error("Forbidden"));
    await expect(fn(serverFn)({ data, context: { userId: "user-7" } })).rejects.toThrow(
      "Forbidden",
    );
    expect(assertAdmin).toHaveBeenCalledWith("user-7");
    expect(chamadas).toHaveLength(0);
  });
});

describe("alterarFounderFlag", () => {
  const alterar = fn(alterarFounderFlag);

  it("o patch leva só o que veio, mais quem e quando", async () => {
    // Campo ausente não pode virar null no banco: mudar o estado não pode
    // zerar o rollout nem apagar a descrição.
    enfileirar("founder_flags", { data: linhaDb });
    await alterar({ data: { key: "novo_painel", ambiente: "prod", estado: "beta" } });
    expect(args("founder_flags", "update")).toEqual([
      [{ atualizado_em: expect.any(String), atualizado_por: "admin-1", estado: "beta" }],
    ]);
    expect(args("founder_flags", "eq")).toEqual([
      ["key", "novo_painel"],
      ["ambiente", "prod"],
    ]);
  });

  it("descricao null é permitido (limpar de propósito) e chega no patch", async () => {
    enfileirar("founder_flags", { data: linhaDb });
    await alterar({ data: { key: "novo_painel", ambiente: "prod", descricao: null } });
    expect(args("founder_flags", "update")[0][0]).toMatchObject({ descricao: null });
  });

  it("devolve a linha em camelCase; beta_user_ids nulo vira lista vazia", async () => {
    enfileirar("founder_flags", { data: linhaDb });
    await expect(
      alterar({ data: { key: "novo_painel", ambiente: "prod", estado: "beta" } }),
    ).resolves.toEqual({
      key: "novo_painel",
      ambiente: "prod",
      nome: "Novo painel",
      descricao: null,
      estado: "beta",
      rolloutPct: 25,
      betaUserIds: [],
      atualizadoEm: "2026-09-20T10:00:00Z",
      atualizadoPor: "admin-1",
    });
  });

  it("valida rollout (0..100, inteiro), estado e ids de beta antes de tocar no banco", async () => {
    const base = { key: "novo_painel", ambiente: "prod" };
    await expect(alterar({ data: { ...base, rolloutPct: 101 } })).rejects.toThrow();
    await expect(alterar({ data: { ...base, rolloutPct: 12.5 } })).rejects.toThrow();
    await expect(alterar({ data: { ...base, estado: "ligado" } })).rejects.toThrow();
    await expect(alterar({ data: { ...base, betaUserIds: ["nao-e-uuid"] } })).rejects.toThrow();
    await expect(alterar({ data: { ...base, ambiente: "staging" } })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("flag inexistente e erro do banco viram erro", async () => {
    enfileirar("founder_flags", { data: null, error: null });
    await expect(
      alterar({ data: { key: "nao_existe", ambiente: "prod", estado: "on" } }),
    ).rejects.toThrow("Flag não encontrada");

    enfileirar("founder_flags", { data: null, error: { message: "permission denied" } });
    await expect(
      alterar({ data: { key: "novo_painel", ambiente: "prod", estado: "on" } }),
    ).rejects.toThrow("permission denied");
    expect(logAcaoAdminServer).not.toHaveBeenCalled();
  });

  it("registra a ação com chave@ambiente e o resumo do que mudou", async () => {
    enfileirar("founder_flags", { data: linhaDb });
    await alterar({
      data: { key: "novo_painel", ambiente: "preview", rolloutPct: 50, betaUserIds: [UUID] },
    });
    expect(logAcaoAdminServer).toHaveBeenCalledWith(
      "admin-1",
      "alterar_founder_flag",
      "novo_painel@preview",
      { estado: undefined, rollout_pct: 50, beta: 1 },
    );
  });
});

describe("criarFounderFlag", () => {
  const criar = fn(criarFounderFlag);

  it.each(["Minha-Flag", "1abc", "a", "com espaço", "UPPER"])(
    "recusa chave '%s' (só minúscula, número e _, começando por letra)",
    async (key) => {
      await expect(criar({ data: { key, nome: "X" } })).rejects.toThrow();
      expect(chamadas).toHaveLength(0);
    },
  );

  it("nasce desligada em prod E preview, rollout 0, com a autora", async () => {
    enfileirar("founder_flags", { error: null });
    await expect(criar({ data: { key: "nova_flag2", nome: "Nova" } })).resolves.toEqual({
      ok: true,
    });
    const comum = {
      key: "nova_flag2",
      nome: "Nova",
      descricao: null,
      estado: "off",
      rollout_pct: 0,
      atualizado_por: "admin-1",
    };
    expect(args("founder_flags", "insert")).toEqual([
      [
        [
          { ...comum, ambiente: "prod" },
          { ...comum, ambiente: "preview" },
        ],
      ],
    ]);
    expect(logAcaoAdminServer).toHaveBeenCalledWith("admin-1", "criar_founder_flag", "nova_flag2", {
      nome: "Nova",
    });
  });

  it("chave repetida (23505) tem mensagem própria", async () => {
    enfileirar("founder_flags", { error: { code: "23505", message: "dup" } });
    await expect(criar({ data: { key: "nova_flag2", nome: "Nova" } })).rejects.toThrow(
      "Já existe uma flag com essa chave.",
    );
  });
});

describe("getFounderFlags", () => {
  const listar = fn(getFounderFlags);

  it("resolve o nome de quem mexeu: display_name, senão full_name, senão id curto", async () => {
    enfileirar("founder_flags", {
      data: [
        { ...linhaDb, atualizado_por: "11111111-aaaa" },
        { ...linhaDb, ambiente: "preview", atualizado_por: "22222222-bbbb" },
      ],
    });
    enfileirar("founder_flags_historico", {
      data: [
        {
          id: "h1",
          flag_key: "novo_painel",
          ambiente: "prod",
          alterado_por: "33333333-cccc",
          alterado_em: "2026-09-19T00:00:00Z",
          estado_anterior: { estado: "off" },
          estado_novo: { estado: "beta" },
          motivo: null,
        },
      ],
    });
    enfileirar("profiles", {
      data: [
        { id: "11111111-aaaa", display_name: "Sil", full_name: "Silvia" },
        { id: "22222222-bbbb", display_name: null, full_name: "Bia" },
        { id: "33333333-cccc", display_name: null, full_name: null },
      ],
    });

    const r = (await listar()) as {
      flags: unknown[];
      historico: Record<string, unknown>[];
      nomes: Record<string, string>;
    };
    expect(r.nomes).toEqual({
      "11111111-aaaa": "Sil",
      "22222222-bbbb": "Bia",
      "33333333-cccc": "33333333",
    });
    expect(r.flags).toHaveLength(2);
    expect(r.historico[0]).toEqual({
      id: "h1",
      flagKey: "novo_painel",
      ambiente: "prod",
      alteradoPor: "33333333-cccc",
      alteradoEm: "2026-09-19T00:00:00Z",
      estadoAnterior: { estado: "off" },
      estadoNovo: { estado: "beta" },
      motivo: null,
    });
    // Consulta os três ids de uma vez, sem repetir.
    expect(args("profiles", "in")).toEqual([
      ["id", ["11111111-aaaa", "22222222-bbbb", "33333333-cccc"]],
    ]);
  });

  it("sem flag nem histórico, não consulta profiles", async () => {
    await expect(listar()).resolves.toEqual({ flags: [], historico: [], nomes: {} });
    expect(args("profiles", "in")).toEqual([]);
  });
});

describe("getFounderFlagsResumo", () => {
  it("só olha prod e devolve o mínimo pro card", async () => {
    enfileirar("founder_flags", {
      data: [{ key: "novo_painel", nome: "Novo painel", estado: "on", rollout_pct: 100 }],
    });
    await expect(fn(getFounderFlagsResumo)()).resolves.toEqual([
      { key: "novo_painel", nome: "Novo painel", estado: "on", rolloutPct: 100 },
    ]);
    expect(args("founder_flags", "eq")).toEqual([["ambiente", "prod"]]);
  });
});
