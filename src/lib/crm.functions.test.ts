import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Ver admin-usuarias.functions.test.ts pra explicação do builder falso e do
// Supabase falso. As tabelas crm_* têm RLS ligada e nenhuma policy: só o
// service role enxerga, e só depois de assertAdmin. O arquivo tem 20+ server
// fns; aqui ficam as que têm regra além de "lê e devolve".
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

const { filas, chamadas, from, logAcaoAdminServer } = vi.hoisted(() => {
  const filas = new Map<string, { data?: unknown; error?: unknown }[]>();
  const chamadas: { tabela: string; metodo: string; args: unknown[] }[] = [];
  const METODOS = [
    "select",
    "eq",
    "in",
    "is",
    "lte",
    "order",
    "limit",
    "insert",
    "update",
    "upsert",
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
  return { filas, chamadas, from, logAcaoAdminServer: vi.fn() };
});

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from } }));
vi.mock("@/lib/audit-log.server", () => ({ logAcaoAdminServer }));
vi.mock("@/lib/email-template", () => ({
  enviarEmailResend: vi.fn(),
  emailPolia: vi.fn(),
  escapeHtml: (s: string) => s,
}));

import {
  normalizarTelefone,
  STATUS_CONTATO,
  FASES_NEGOCIO,
  salvarContato,
  registrarInteracao,
  moverNegocio,
  alternarTarefa,
  salvarTarefa,
  resumoCrm,
} from "./crm.functions";
import { STATUS_META, FASE_META } from "./crm-ui";

type Chamada = (opts?: { data?: unknown; context?: { userId: string } }) => Promise<unknown>;
const fn = (f: unknown) => f as Chamada;

function enfileirar(tabela: string, ...rs: { data?: unknown; error?: unknown }[]) {
  filas.set(tabela, [...(filas.get(tabela) ?? []), ...rs]);
}
const admin = (ok = true) => enfileirar("profiles", { data: { is_admin: ok }, error: null });
const args = (tabela: string, metodo: string) =>
  chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.args);

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  filas.clear();
  chamadas.length = 0;
  vi.resetAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizarTelefone", () => {
  it("vazio vira null", () => {
    expect(normalizarTelefone(null)).toBeNull();
    expect(normalizarTelefone(undefined)).toBeNull();
    expect(normalizarTelefone("")).toBeNull();
  });

  it("põe o 55 na frente e deixa só dígitos, como o wa.me pede", () => {
    expect(normalizarTelefone("(11) 99999-8888")).toBe("5511999998888");
    expect(normalizarTelefone("11 3333-4444")).toBe("551133334444");
  });

  it("quem já veio com 55 não ganha outro", () => {
    expect(normalizarTelefone("+55 (11) 99999-8888")).toBe("5511999998888");
  });

  it("curto demais vira null em vez de link pra conversa errada", () => {
    expect(normalizarTelefone("123")).toBeNull();
    expect(normalizarTelefone("9999-8888")).toBeNull();
  });

  // Bug documentado: número do DDD 55 (Santa Maria, RS) digitado sem o
  // código do país começa com "55", cai no ramo "já tem código" e, com 11
  // dígitos, é descartado. Quando for corrigido, este it.fails passa a
  // falhar: aí é só trocar por it.
  it.fails("celular do DDD 55 sem o +55 deveria virar 5555999998888 (hoje vira null)", () => {
    expect(normalizarTelefone("(55) 99999-8888")).toBe("5555999998888");
  });
});

describe("constantes", () => {
  it("status e fases casam com os rótulos de crm-ui (uma lista não pode andar sem a outra)", () => {
    expect([...STATUS_CONTATO]).toEqual(Object.keys(STATUS_META));
    expect([...FASES_NEGOCIO]).toEqual(Object.keys(FASE_META));
  });
});

describe("salvarContato", () => {
  const salvar = fn(salvarContato);

  it("bloqueia quem não é admin antes de tocar na tabela", async () => {
    admin(false);
    await expect(salvar({ data: { nome: "Ana", email: "a@x.com" } })).rejects.toThrow("Forbidden");
    expect(args("crm_contatos", "insert")).toEqual([]);
  });

  it("nome é obrigatório e e-mail precisa ser válido", async () => {
    await expect(salvar({ data: { nome: "   ", email: "a@x.com" } })).rejects.toThrow();
    await expect(salvar({ data: { nome: "Ana", email: "nao-e-email" } })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("sem e-mail e sem WhatsApp válido não salva: não dá pra falar com a pessoa", async () => {
    admin();
    await expect(salvar({ data: { nome: "Ana", telefone: "123" } })).rejects.toThrow(
      "Precisa de e-mail ou de um WhatsApp válido com DDD.",
    );
    expect(args("crm_contatos", "insert")).toEqual([]);
  });

  it("contato novo: normaliza e-mail e telefone, tira @ do instagram, vazio vira null", async () => {
    admin();
    enfileirar("crm_contatos", { data: { id: "c1" }, error: null });
    await expect(
      salvar({
        data: {
          nome: "Ana",
          email: " ANA@Exemplo.com ",
          telefone: "(11) 99999-8888",
          instagram: "@ana.doces",
          negocio: "   ",
          tags: ["", "vip"],
        },
      }),
    ).resolves.toEqual({ id: "c1" });

    expect(args("crm_contatos", "insert")[0][0]).toMatchObject({
      nome: "Ana",
      email: "ana@exemplo.com",
      telefone: "5511999998888",
      instagram: "ana.doces",
      negocio: null,
      origem: "manual",
      status: "lead",
      tags: ["vip"],
      consent_marketing: false,
    });
    expect(logAcaoAdminServer).toHaveBeenCalledWith("admin-1", "crm_criar_contato", "c1");
  });

  it("com id faz update no contato certo e registra edição", async () => {
    admin();
    enfileirar("crm_contatos", { error: null });
    await expect(salvar({ data: { id: UUID, nome: "Ana", email: "a@x.com" } })).resolves.toEqual({
      id: UUID,
    });
    expect(args("crm_contatos", "update")).toHaveLength(1);
    expect(args("crm_contatos", "insert")).toEqual([]);
    expect(args("crm_contatos", "eq")).toEqual([["id", UUID]]);
    expect(logAcaoAdminServer).toHaveBeenCalledWith("admin-1", "crm_editar_contato", UUID);
  });

  it("e-mail repetido (23505) tem mensagem própria", async () => {
    admin();
    enfileirar("crm_contatos", { data: null, error: { code: "23505" } });
    await expect(salvar({ data: { nome: "Ana", email: "a@x.com" } })).rejects.toThrow(
      "Já existe um contato com esse e-mail.",
    );
    expect(logAcaoAdminServer).not.toHaveBeenCalled();
  });
});

describe("registrarInteracao", () => {
  const registrar = fn(registrarInteracao);

  it("conteúdo vazio não entra", async () => {
    await expect(
      registrar({ data: { contato_id: UUID, canal: "whatsapp", conteudo: "  " } }),
    ).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("mensagem que saiu de fato atualiza o último contato", async () => {
    admin();
    enfileirar("crm_interacoes", { error: null });
    enfileirar("crm_contatos", { error: null });
    await registrar({ data: { contato_id: UUID, canal: "whatsapp", conteudo: "Oi" } });
    const [patch] = args("crm_contatos", "update")[0] as [{ ultimo_contato_em: string }];
    expect(patch.ultimo_contato_em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(args("crm_contatos", "eq")).toEqual([["id", UUID]]);
  });

  it.each([
    ["canal nota", { canal: "nota", direcao: "saida" }],
    ["direção interna", { canal: "whatsapp", direcao: "interna" }],
  ])("%s não conta como contato com a pessoa", async (_rotulo, extra) => {
    admin();
    enfileirar("crm_interacoes", { error: null });
    await registrar({ data: { contato_id: UUID, conteudo: "anotação", ...extra } });
    expect(args("crm_interacoes", "insert")).toHaveLength(1);
    expect(args("crm_contatos", "update")).toEqual([]);
  });
});

describe("moverNegocio", () => {
  const mover = fn(moverNegocio);

  it.each(["fechado", "perdido"])("fase %s carimba fechado_em", async (fase) => {
    admin();
    enfileirar("crm_negocios", { error: null });
    await mover({ data: { id: UUID, fase } });
    const [patch] = args("crm_negocios", "update")[0] as [{ fase: string; fechado_em: unknown }];
    expect(patch.fase).toBe(fase);
    expect(patch.fechado_em).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it.each(["novo", "conversando", "proposta"])("fase %s limpa fechado_em", async (fase) => {
    // Reabrir um negócio fechado tem que apagar a data, senão ele continua
    // contando como "fechado no mês".
    admin();
    enfileirar("crm_negocios", { error: null });
    await mover({ data: { id: UUID, fase } });
    const [patch] = args("crm_negocios", "update")[0] as [{ fechado_em: unknown }];
    expect(patch.fechado_em).toBeNull();
  });

  it("fase fora da lista não passa", async () => {
    await expect(mover({ data: { id: UUID, fase: "ganho" } })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });
});

describe("alternarTarefa", () => {
  const alternar = fn(alternarTarefa);

  it("marcar feito carimba feito_em; desmarcar limpa", async () => {
    admin();
    enfileirar("crm_tarefas", { error: null });
    await alternar({ data: { id: UUID, feito: true } });
    expect((args("crm_tarefas", "update")[0][0] as { feito_em: unknown }).feito_em).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    admin();
    enfileirar("crm_tarefas", { error: null });
    await alternar({ data: { id: UUID, feito: false } });
    expect((args("crm_tarefas", "update")[1][0] as { feito_em: unknown }).feito_em).toBeNull();
  });
});

describe("salvarTarefa", () => {
  const salvar = fn(salvarTarefa);

  it("prazo tem que ser data de 10 caracteres", async () => {
    await expect(salvar({ data: { titulo: "Ligar", prazo: "amanhã" } })).rejects.toThrow();
    expect(chamadas).toHaveLength(0);
  });

  it("lembrete novo com contato empurra o próximo follow-up do contato", async () => {
    admin();
    enfileirar("crm_tarefas", { data: { id: "t1" }, error: null });
    enfileirar("crm_contatos", { error: null });
    await expect(
      salvar({ data: { titulo: "Ligar", prazo: "2026-10-01", contato_id: UUID2 } }),
    ).resolves.toEqual({ id: "t1" });
    expect(args("crm_contatos", "update")).toEqual([[{ proximo_followup: "2026-10-01" }]]);
    expect(args("crm_contatos", "eq")).toEqual([["id", UUID2]]);
  });

  it("lembrete solto (sem contato) não mexe em contato nenhum", async () => {
    admin();
    enfileirar("crm_tarefas", { data: { id: "t2" }, error: null });
    await salvar({ data: { titulo: "Pagar domínio", prazo: "2026-10-01" } });
    expect(args("crm_contatos", "update")).toEqual([]);
  });

  it("com id só atualiza o lembrete", async () => {
    admin();
    enfileirar("crm_tarefas", { error: null });
    await expect(
      salvar({ data: { id: UUID, titulo: "Ligar", prazo: "2026-10-02", contato_id: UUID2 } }),
    ).resolves.toEqual({ id: UUID });
    expect(args("crm_tarefas", "update")).toEqual([
      [{ contato_id: UUID2, titulo: "Ligar", tipo: "followup", prazo: "2026-10-02" }],
    ]);
    expect(args("crm_contatos", "update")).toEqual([]);
  });
});

describe("resumoCrm", () => {
  it("fecha as contas do painel a partir das linhas cruas", async () => {
    // Meio-dia UTC de 15/03: em qualquer fuso da máquina ainda é dia 15.
    vi.useFakeTimers({ now: Date.parse("2026-03-15T12:00:00Z") });
    admin();
    enfileirar("crm_contatos", {
      data: [
        {
          id: "c1",
          nome: "Ana",
          status: "lead",
          telefone: null,
          aniversario: "1990-03-15",
          ultimo_contato_em: null,
          criado_em: "2026-03-14T10:00:00Z",
          consent_marketing: true,
          descadastrado_em: null,
        },
        {
          id: "c2",
          nome: "Bia",
          status: "cliente",
          telefone: "5511999998888",
          aniversario: null,
          ultimo_contato_em: "2026-01-10T10:00:00Z",
          criado_em: "2026-01-01T10:00:00Z",
          consent_marketing: true,
          descadastrado_em: "2026-02-01T00:00:00Z",
        },
        {
          id: "c3",
          nome: "Cris",
          status: "cliente",
          telefone: null,
          aniversario: "1985-12-25",
          ultimo_contato_em: "2026-03-10T10:00:00Z",
          criado_em: "2026-03-01T10:00:00Z",
          consent_marketing: false,
          descadastrado_em: null,
        },
      ],
    });
    enfileirar("crm_negocios", {
      data: [
        { fase: "proposta", valor: 100, fechado_em: null },
        { fase: "fechado", valor: 300, fechado_em: "2026-03-10T10:00:00Z" },
        { fase: "fechado", valor: 50, fechado_em: "2026-02-20T10:00:00Z" },
        { fase: "perdido", valor: 999, fechado_em: "2026-03-11T10:00:00Z" },
      ],
    });
    enfileirar("crm_tarefas", {
      data: [
        { id: "t1", titulo: "Ligar", prazo: "2026-03-15", contato_id: "c1" },
        { id: "t2", titulo: "Cobrar", prazo: "2026-03-10", contato_id: null },
      ],
    });
    enfileirar("crm_campanhas", { data: [] });

    const r = (await fn(resumoCrm)()) as Record<string, unknown>;
    expect(r).toMatchObject({
      porStatus: { lead: 1, conversando: 0, cliente: 2, inativa: 0, perdida: 0 },
      total: 3,
      semContato30d: 1, // Bia: último contato em janeiro
      novos7d: 1, // Ana
      aniversariantesHoje: [{ id: "c1", nome: "Ana", telefone: null }],
      contatosMarketing: 1, // Ana; Bia se descadastrou; Cris não consentiu
      followupsHoje: 1,
      negociosAbertos: { quantidade: 1, valor: 100 },
      fechadoNoMes: { quantidade: 1, valor: 300 }, // o de fevereiro fica fora, o perdido também
      ultimasCampanhas: [],
    });
    expect(r.followupsVencidos).toEqual([
      { id: "t1", titulo: "Ligar", prazo: "2026-03-15", contato_id: "c1", contato: "Ana" },
      { id: "t2", titulo: "Cobrar", prazo: "2026-03-10", contato_id: null, contato: null },
    ]);
    // Só lembrete aberto e vencido ou de hoje.
    expect(args("crm_tarefas", "is")).toEqual([["feito_em", null]]);
    expect(args("crm_tarefas", "lte")).toEqual([["prazo", "2026-03-15"]]);
  });
});
