import { describe, it, expect, vi, beforeEach } from "vitest";

// Ver admin-usuarias.functions.test.ts pra explicação do builder falso e do
// Supabase falso. Aqui o que importa: convites_cadastro tem RLS deny-all e é
// lida com service role, então assertAdmin é a ÚNICA trava; e o e-mail de
// convite é lido por quem ainda nem conhece a Pólia, então o nome do plano
// que vai nele tem que ser o visível (Grátis/Premium/Pro), nunca a chave.
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

const { filas, chamadas, from, listUsersMock, logAcaoAdminServer, enviarEmailResend, emailPolia } =
  vi.hoisted(() => {
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
    return {
      filas,
      chamadas,
      from,
      listUsersMock: vi.fn(),
      logAcaoAdminServer: vi.fn(),
      enviarEmailResend: vi.fn(),
      emailPolia: vi.fn(),
    };
  });

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from, auth: { admin: { listUsers: listUsersMock } } },
}));
vi.mock("@/lib/audit-log.server", () => ({ logAcaoAdminServer }));
vi.mock("@/lib/email-template", () => ({ enviarEmailResend, emailPolia }));

import {
  listarConvites,
  criarConvite,
  atualizarAcessoDoConvite,
  enviarConvite,
  removerConvite,
} from "./convites.functions";

type Chamada = (opts?: { data?: unknown; context?: { userId: string } }) => Promise<unknown>;
const listar = listarConvites as unknown as Chamada;
const criar = criarConvite as unknown as Chamada;
const atualizar = atualizarAcessoDoConvite as unknown as Chamada;
const enviar = enviarConvite as unknown as Chamada;
const remover = removerConvite as unknown as Chamada;

function enfileirar(tabela: string, ...rs: { data?: unknown; error?: unknown }[]) {
  filas.set(tabela, [...(filas.get(tabela) ?? []), ...rs]);
}
const admin = (ok = true) => enfileirar("profiles", { data: { is_admin: ok }, error: null });
const args = (tabela: string, metodo: string) =>
  chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.args);

const NOMES_MORTOS = /Começo|Alcance|Voo|Confere|Controle|Projete/;

beforeEach(() => {
  filas.clear();
  chamadas.length = 0;
  vi.resetAllMocks();
  enviarEmailResend.mockResolvedValue(true);
  emailPolia.mockImplementation((p: { paragrafos: string[] }) => p.paragrafos.join(" "));
});

describe("criarConvite", () => {
  it("bloqueia quem não é admin antes de tocar na tabela", async () => {
    admin(false);
    await expect(
      criar({ data: { email: "ana@exemplo.com", plano: "confere", is_admin: false } }),
    ).rejects.toThrow("Forbidden");
    expect(args("convites_cadastro", "insert")).toEqual([]);
  });

  it("recusa plano fora da lista e e-mail inválido antes de qualquer consulta", async () => {
    await expect(
      criar({ data: { email: "ana@exemplo.com", plano: "comeco", is_admin: false } }),
    ).rejects.toThrow();
    await expect(
      criar({ data: { email: "nao-e-email", plano: "confere", is_admin: false } }),
    ).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("grava o e-mail em minúsculas e registra a ação", async () => {
    admin();
    enfileirar("convites_cadastro", { error: null });
    await expect(
      criar({ data: { email: "  Ana@Exemplo.com ", plano: "controle", is_admin: false } }),
    ).resolves.toEqual({ ok: true });
    expect(args("convites_cadastro", "insert")).toEqual([
      [{ email: "ana@exemplo.com", plano: "controle", is_admin: false }],
    ]);
    expect(logAcaoAdminServer).toHaveBeenCalledWith(
      "admin-1",
      "criar_convite",
      "ana@exemplo.com · plano controle",
    );
  });

  it("acesso de administradora tem ação própria no log", async () => {
    // É o que dá entrada no office inteiro; não pode ficar indistinguível
    // de "liberei mais um e-mail".
    admin();
    enfileirar("convites_cadastro", { error: null });
    await criar({ data: { email: "sil@exemplo.com", plano: "beta", is_admin: true } });
    expect(logAcaoAdminServer).toHaveBeenCalledWith(
      "admin-1",
      "criar_convite_admin",
      expect.any(String),
    );
  });

  it("e-mail já convidado (23505) vira mensagem própria; outro erro vira genérica", async () => {
    admin();
    enfileirar("convites_cadastro", { error: { code: "23505" } });
    await expect(
      criar({ data: { email: "ana@exemplo.com", plano: "confere", is_admin: false } }),
    ).rejects.toThrow("Esse e-mail já tem convite.");

    admin();
    enfileirar("convites_cadastro", { error: { code: "XX" } });
    await expect(
      criar({ data: { email: "ana@exemplo.com", plano: "confere", is_admin: false } }),
    ).rejects.toThrow("Falha ao criar convite.");
    expect(logAcaoAdminServer).not.toHaveBeenCalled();
  });
});

describe("atualizarAcessoDoConvite", () => {
  const data = { email: "ana@exemplo.com", plano: "projete", is_admin: false };

  it("convite que não existe: recusa sem atualizar", async () => {
    admin();
    enfileirar("convites_cadastro", { data: null });
    await expect(atualizar({ data })).rejects.toThrow("não está na lista de convites");
    expect(args("convites_cadastro", "update")).toEqual([]);
  });

  it("convite já usado: recusa, porque o gatilho só roda no nascimento da conta", async () => {
    admin();
    enfileirar("convites_cadastro", { data: { usado_em: "2026-09-01T00:00:00Z" } });
    await expect(atualizar({ data })).rejects.toThrow("já criou a conta");
    expect(args("convites_cadastro", "update")).toEqual([]);
    expect(logAcaoAdminServer).not.toHaveBeenCalled();
  });

  it("convite pendente: atualiza plano e admin, e registra", async () => {
    admin();
    enfileirar("convites_cadastro", { data: { usado_em: null } }, { error: null });
    await expect(atualizar({ data })).resolves.toEqual({ ok: true });
    expect(args("convites_cadastro", "update")).toEqual([[{ plano: "projete", is_admin: false }]]);
    expect(args("convites_cadastro", "eq")).toContainEqual(["email", "ana@exemplo.com"]);
    expect(logAcaoAdminServer).toHaveBeenCalledWith(
      "admin-1",
      "convite_acesso",
      "ana@exemplo.com · plano projete",
    );
  });

  it("virar admin pelo convite tem ação própria no log", async () => {
    admin();
    enfileirar("convites_cadastro", { data: { usado_em: null } }, { error: null });
    await atualizar({ data: { ...data, is_admin: true } });
    expect(logAcaoAdminServer).toHaveBeenCalledWith(
      "admin-1",
      "convite_acesso_admin",
      expect.any(String),
    );
  });
});

describe("enviarConvite", () => {
  const data = { email: "ana@exemplo.com" };

  it.each([
    ["confere", "plano Grátis"],
    ["controle", "plano Premium"],
    ["projete", "plano Pro"],
    ["beta", "acesso completo"],
    [null, "plano Grátis"],
  ])("plano %s chega no e-mail como '%s'", async (plano, nome) => {
    admin();
    enfileirar("convites_cadastro", { data: { usado_em: null, plano } }, { error: null });
    await expect(enviar({ data })).resolves.toEqual({ ok: true });

    const envio = enviarEmailResend.mock.calls[0][0] as {
      to: string[];
      text: string;
      html: string;
    };
    expect(envio.to).toEqual(["ana@exemplo.com"]);
    expect(envio.text).toContain(nome);
    expect(envio.html).toContain(nome);
  });

  it("o e-mail nunca cita chave interna, nome morto de plano ou acesso de admin", async () => {
    admin();
    enfileirar(
      "convites_cadastro",
      { data: { usado_em: null, plano: "controle" } },
      { error: null },
    );
    await enviar({ data });
    const envio = enviarEmailResend.mock.calls[0][0] as { text: string; html: string };
    for (const campo of [envio.text, envio.html]) {
      expect(campo).not.toMatch(NOMES_MORTOS);
      expect(campo).not.toMatch(/\bcontrole\b|\bconfere\b|\bprojete\b|admin/i);
    }
  });

  it("o link de cadastro já leva o e-mail, codificado", async () => {
    admin();
    enfileirar(
      "convites_cadastro",
      { data: { usado_em: null, plano: "confere" } },
      { error: null },
    );
    await enviar({ data: { email: "ana+teste@exemplo.com" } });
    const envio = enviarEmailResend.mock.calls[0][0] as { text: string };
    expect(envio.text).toContain(
      "https://one.usepolia.com.br/auth/cadastro?email=ana%2Bteste%40exemplo.com",
    );
  });

  it("sucesso marca enviado_em e registra a ação", async () => {
    admin();
    enfileirar(
      "convites_cadastro",
      { data: { usado_em: null, plano: "confere" } },
      { error: null },
    );
    await enviar({ data });
    const [patch] = args("convites_cadastro", "update")[0] as [{ enviado_em: string }];
    expect(patch.enviado_em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(logAcaoAdminServer).toHaveBeenCalledWith("admin-1", "enviar_convite", "ana@exemplo.com");
  });

  it("falha no envio: erro pra tela, sem marcar enviado nem registrar", async () => {
    // Marcar "enviado" sem enviar foi exatamente o bug das boas-vindas do
    // produto (memória "só marca com envio confirmado").
    admin();
    enfileirar("convites_cadastro", { data: { usado_em: null, plano: "confere" } });
    enviarEmailResend.mockResolvedValue(false);
    await expect(enviar({ data })).rejects.toThrow("Não consegui enviar o convite agora");
    expect(args("convites_cadastro", "update")).toEqual([]);
    expect(logAcaoAdminServer).not.toHaveBeenCalled();
  });

  it("convite já usado ou inexistente: não envia nada", async () => {
    admin();
    enfileirar("convites_cadastro", {
      data: { usado_em: "2026-09-01T00:00:00Z", plano: "confere" },
    });
    await expect(enviar({ data })).rejects.toThrow("já criou a conta");

    admin();
    enfileirar("convites_cadastro", { data: null });
    await expect(enviar({ data })).rejects.toThrow("não está na lista de convites");
    expect(enviarEmailResend).not.toHaveBeenCalled();
  });
});

describe("removerConvite", () => {
  it("apaga pelo e-mail e registra", async () => {
    admin();
    enfileirar("convites_cadastro", { error: null });
    await expect(remover({ data: { email: "Ana@Exemplo.com" } })).resolves.toEqual({ ok: true });
    expect(args("convites_cadastro", "delete")).toHaveLength(1);
    expect(args("convites_cadastro", "eq")).toContainEqual(["email", "ana@exemplo.com"]);
    expect(logAcaoAdminServer).toHaveBeenCalledWith(
      "admin-1",
      "remover_convite",
      "ana@exemplo.com",
    );
  });

  it("erro do banco vira mensagem amigável", async () => {
    admin();
    enfileirar("convites_cadastro", { error: { code: "XX" } });
    await expect(remover({ data: { email: "a@x.com" } })).rejects.toThrow(
      "Falha ao remover convite.",
    );
  });
});

describe("listarConvites", () => {
  const linha = {
    email: "ana@exemplo.com",
    criado_em: "2026-09-01T00:00:00Z",
    usado_em: null,
    enviado_em: null,
    plano: "confere",
    is_admin: null,
  };

  it("bloqueia quem não é admin", async () => {
    admin(false);
    await expect(listar()).rejects.toThrow("Forbidden");
  });

  it("erro na listagem vira mensagem amigável", async () => {
    admin();
    enfileirar("convites_cadastro", { data: null, error: { code: "XX" } });
    await expect(listar()).rejects.toThrow("Falha ao listar convites.");
  });

  it("convite pendente: sem conta, e não consulta a Admin API à toa", async () => {
    admin();
    enfileirar("convites_cadastro", { data: [linha] });
    const r = (await listar()) as { convites: Record<string, unknown>[] };
    expect(r.convites).toEqual([{ ...linha, is_admin: false, contaPlano: null, contaAdmin: null }]);
    expect(listUsersMock).not.toHaveBeenCalled();
  });

  it("convite usado: traz o plano REAL da conta, não o do convite", async () => {
    // Quem se cadastrou e mudou de plano depois não pode aparecer com o
    // plano de quando foi convidada.
    admin();
    enfileirar("convites_cadastro", { data: [{ ...linha, usado_em: "2026-09-02T00:00:00Z" }] });
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: "u1", email: "Ana@Exemplo.com" }] },
      error: null,
    });
    enfileirar("profiles", { data: [{ id: "u1", plano: "controle", is_admin: true }] });

    const r = (await listar()) as { convites: Record<string, unknown>[] };
    expect(r.convites[0]).toMatchObject({
      plano: "confere",
      contaPlano: "controle",
      contaAdmin: true,
    });
  });
});
