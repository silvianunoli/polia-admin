import { describe, it, expect, vi, beforeEach } from "vitest";

// Motor das automações rodando de ponta a ponta contra um banco falso em memória: dá pra
// seguir o FALA inteiro (pergunta, botão, tag, CRM, aviso) sem Supabase e sem Meta.

type Linha = Record<string, unknown>;

const { db, envios, publicas, emails, meta } = vi.hoisted(() => ({
  db: {} as Record<string, Linha[]>,
  // Respostas falsas da Meta: se a pessoa segue e a data de publicação de cada post.
  meta: { segue: true, datas: {} as Record<string, string> },
  envios: [] as {
    canal: string;
    externoId: string;
    envio: Record<string, unknown>;
    comentarioId?: string;
  }[],
  publicas: [] as { comentarioId: string; texto: string }[],
  emails: [] as { subject: string }[],
}));

vi.mock("@/integrations/supabase/client.server", () => {
  let seq = 0;
  const VIVOS = ["rodando", "aguardando"];

  function from(tabela: string) {
    let op: "select" | "insert" | "update" | "delete" = "select";
    let valores: Linha | Linha[] | null = null;
    const filtros: ((r: Linha) => boolean)[] = [];
    let unica = false;
    let talvez = false;
    let limite: number | null = null;
    let devolve = false;

    const linhas = () => (db[tabela] ??= []);

    async function rodar() {
      if (op === "insert") {
        const novas = (Array.isArray(valores) ? valores : [valores]).map((v): Linha => ({
          id: `id-${++seq}`,
          criado_em: new Date().toISOString(),
          iniciado_em: new Date().toISOString(),
          atualizado_em: new Date().toISOString(),
          ...(tabela === "auto_execucoes" ? { tentativas: 0, aguardando: null, dados: {} } : {}),
          ...(v as Linha),
        }));
        for (const n of novas) {
          if (
            tabela === "auto_execucoes" &&
            linhas().some(
              (r) => r.conversa_id === n.conversa_id && VIVOS.includes(String(r.estado)),
            )
          ) {
            return { data: null, error: { code: "23505" } };
          }
          if (
            tabela === "conv_mensagens" &&
            n.meta_id &&
            linhas().some((r) => r.meta_id === n.meta_id)
          ) {
            return { data: null, error: { code: "23505" } };
          }
          linhas().push(n);
        }
        return { data: devolve ? (unica ? novas[0] : novas) : null, error: null };
      }
      const alvo = linhas().filter((r) => filtros.every((f) => f(r)));
      if (op === "update") {
        alvo.forEach((r) => Object.assign(r, valores));
        return { data: null, error: null };
      }
      if (op === "delete") {
        db[tabela] = linhas().filter((r) => !alvo.includes(r));
        return { data: null, error: null };
      }
      const res = limite ? alvo.slice(0, limite) : alvo;
      if (unica || talvez) return { data: res[0] ? { ...res[0] } : null, error: null };
      return { data: res.map((r) => ({ ...r })), error: null };
    }

    const c: Record<string, unknown> = {
      select: () => {
        if (op !== "select") devolve = true;
        return c;
      },
      insert: (v: Linha) => ((op = "insert"), (valores = v), c),
      update: (v: Linha) => ((op = "update"), (valores = v), c),
      delete: () => ((op = "delete"), c),
      eq: (k: string, v: unknown) => (filtros.push((r) => r[k] === v), c),
      in: (k: string, v: unknown[]) => (filtros.push((r) => v.includes(r[k])), c),
      gte: (k: string, v: string) => (filtros.push((r) => String(r[k]) >= v), c),
      order: () => c,
      limit: (n: number) => ((limite = n), c),
      single: () => ((unica = true), c),
      maybeSingle: () => ((talvez = true), c),
      then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro),
    };
    return c;
  }
  return { supabaseAdmin: { from } };
});

vi.mock("@/lib/conversas-meta.server", () => ({
  enviarPeloCanal: vi.fn(
    async (
      canal: string,
      externoId: string,
      envio: Record<string, unknown>,
      comentarioId?: string,
    ) => {
      envios.push({ canal, externoId, envio, comentarioId });
      return `mid-${envios.length}`;
    },
  ),
  responderComentarioEmPublico: vi.fn(async (comentarioId: string, texto: string) => {
    publicas.push({ comentarioId, texto });
  }),
  seguePerfil: vi.fn(async () => meta.segue),
  dataDoPost: vi.fn(async (id: string) => meta.datas[id] ?? null),
}));

vi.mock("@/lib/email-template", () => ({
  enviarEmailResend: vi.fn(async (p: { subject: string }) => {
    emails.push({ subject: p.subject });
    return true;
  }),
  emailPolia: () => "<html></html>",
  escapeHtml: (s: string) => s,
}));

import { aoReceberMensagem, tratarCliqueLink } from "@/lib/automacoes.server";
import {
  LINK_WHATSAPP_FALA,
  automacaoComentarioEmBranco,
  guiadoEmBranco,
  guiadoParaPassos,
  modeloFalaInstagram,
  modeloFalaWhatsapp,
  payloadBotao,
} from "@/lib/automacoes";
import type { MensagemRecebida } from "@/lib/conversas-meta";

let contador = 0;
function msg(texto: string | null, extra: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return {
    metaId: `in-${++contador}`,
    direcao: "entrada",
    tipo: "texto",
    texto,
    midia: null,
    dados: {},
    abreJanela: true,
    quando: new Date().toISOString(),
    ...extra,
  };
}

function preparar(canal: "instagram" | "whatsapp", janelaAberta = true) {
  for (const k of Object.keys(db)) delete db[k];
  envios.length = 0;
  publicas.length = 0;
  emails.length = 0;
  db.crm_contatos = [{ id: "c1", nome: "Ana Paula", campos: {}, tags: [], status: "lead" }];
  db.conv_conversas = [
    {
      id: "conv1",
      contato_id: "c1",
      canal,
      automacao_pausada: false,
      ultima_entrada_em: janelaAberta ? new Date().toISOString() : null,
    },
  ];
  db.crm_negocios = [];
  db.crm_tarefas = [];
  db.conv_mensagens = [];
  db.auto_execucoes = [];
  db.auto_automacoes = [];
}

function ligar(a: ReturnType<typeof modeloFalaWhatsapp>, id: string) {
  db.auto_automacoes.push({
    id,
    ...a,
    ativa: true,
    execucoes: 0,
    criado_em: new Date().toISOString(),
  });
}

const ctx = (canal: "instagram" | "whatsapp") => ({
  canal,
  externoId: "pessoa-1",
  contatoId: "c1",
  conversaId: "conv1",
});

const exec = () => db.auto_execucoes[0];
const contato = () =>
  db.crm_contatos[0] as { campos: Record<string, string>; tags: string[]; status: string };
const ultimoTexto = () => String(envios[envios.length - 1]?.envio.texto ?? "");

describe("FALA no WhatsApp, de ponta a ponta", () => {
  beforeEach(() => {
    preparar("whatsapp");
    ligar(modeloFalaWhatsapp(), "a-wa");
  });

  it("faz as 6 perguntas, guarda tudo, marca tag, abre negócio, lembrete e avisa", async () => {
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("Comentei FALA") });
    expect(ultimoTexto()).toContain("Oi, Ana. Que bom que você veio do carrossel.");
    expect(exec()).toMatchObject({ estado: "aguardando", aguardando: "resposta", passo_idx: 0 });

    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("Fico sem graça e dou desconto") });
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("Canecas da Ana, @canecasdaana") });
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("Canecas personalizadas") });

    // Passo 4 tem botões: vão no envio com payload.
    const comBotoes = envios[envios.length - 1].envio as {
      botoes: { payload: string; titulo: string }[];
    };
    expect(comBotoes.botoes.map((b) => b.titulo)).toEqual([
      "Instagram",
      "WhatsApp",
      "Loja ou site",
    ]);

    // Toque no botão (payload) e depois resposta digitada igual ao texto do botão.
    await aoReceberMensagem({
      ...ctx("whatsapp"),
      mensagem: msg("WhatsApp", { tipo: "botao", dados: { payload: payloadBotao("p4", "b2") } }),
    });
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("mais de r$ 10 mil") });
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("Este mês", { tipo: "botao" }) });

    expect(contato().campos).toEqual({
      resposta_ta_caro: "Fico sem graça e dou desconto",
      marca_instagram: "Canecas da Ana, @canecasdaana",
      produto_marca: "Canecas personalizadas",
      onde_vende: "WhatsApp",
      faturamento: "Mais de R$ 10 mil",
      prazo: "Este mês",
    });
    expect(contato().tags).toContain("FALA briefing");
    expect(contato().status).toBe("conversando");
    expect(db.crm_negocios).toHaveLength(1);
    expect(db.crm_negocios[0]).toMatchObject({ titulo: "Sua Marca Fala Primeiro", fase: "novo" });
    expect(db.crm_tarefas).toHaveLength(1);
    expect(emails).toHaveLength(1);
    expect(exec()).toMatchObject({ estado: "concluida" });
    // O PDF sem link é pulado; a última mensagem é a promessa da Sil.
    expect(ultimoTexto()).toContain("A Sil vai olhar o seu briefing");
    expect(envios.some((e) => e.envio.tipo === "arquivo")).toBe(false);
    // Toda mensagem da automação ficou gravada na conversa, marcada como automação.
    const saidas = db.conv_mensagens.filter((m) => m.direcao === "saida");
    expect(saidas).toHaveLength(envios.length);
    expect(saidas.every((m) => (m.dados as Linha).automacao_id === "a-wa")).toBe(true);
  });

  it("conversa pausada não recebe nada automático", async () => {
    db.conv_conversas[0].automacao_pausada = true;
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("Comentei FALA") });
    expect(envios).toHaveLength(0);
    expect(db.auto_execucoes).toHaveLength(0);
  });

  it("pergunta com formato errado pede de novo, até 2 vezes, e depois segue", async () => {
    const a = modeloFalaWhatsapp();
    (a.passos[0] as { validacao: string }).validacao = "email";
    db.auto_automacoes = [];
    ligar(a, "a-wa");
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("Comentei FALA") });
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("sem email") });
    expect(ultimoTexto()).toContain("Não reconheci esse e-mail");
    expect(exec()).toMatchObject({ passo_idx: 0, tentativas: 1 });
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("ainda não") });
    await aoReceberMensagem({ ...ctx("whatsapp"), mensagem: msg("desisto") });
    expect(exec()).toMatchObject({ passo_idx: 1 });
  });
});

describe("comentário vira Direct (igual ao ManyChat)", () => {
  beforeEach(() => {
    preparar("instagram", false);
    meta.segue = true;
    meta.datas = {};
  });

  const comentario = (texto: string, mediaId = "M1") =>
    msg(texto, {
      tipo: "comentario",
      abreJanela: false,
      dados: { comment_id: "C1", media_id: mediaId },
    });

  // Toque num botão: no app real o webhook grava a mensagem e abre a janela antes do motor.
  const toque = (payload: string, titulo: string) => {
    db.conv_conversas[0].ultima_entrada_em = new Date().toISOString();
    return msg(titulo, { tipo: "botao", dados: { payload } });
  };

  it("FALA: boas-vindas com botão em privado, resposta pública, e o toque libera a DM com link", async () => {
    ligar(modeloFalaInstagram(), "a-ig");
    await aoReceberMensagem({ ...ctx("instagram"), mensagem: comentario("FALA!") });

    expect(envios).toHaveLength(1);
    expect(envios[0].comentarioId).toBe("C1");
    expect((envios[0].envio.botoes as { titulo: string }[]).map((b) => b.titulo)).toEqual([
      "Quero continuar",
    ]);
    expect(publicas).toHaveLength(1);
    const g = modeloFalaInstagram().gatilho as { respostas_publicas: string[] };
    expect(g.respostas_publicas).toContain(publicas[0].texto);
    expect(exec()).toMatchObject({ estado: "aguardando", aguardando: "resposta", passo_idx: 0 });

    await aoReceberMensagem({
      ...ctx("instagram"),
      mensagem: toque(payloadBotao("boas_vindas", "continuar"), "Quero continuar"),
    });
    expect(envios).toHaveLength(2);
    expect(envios[1].comentarioId).toBeUndefined();
    const links = envios[1].envio.links as { titulo: string; url: string }[];
    expect(links).toHaveLength(1);
    expect(links[0].titulo).toBe("Abrir o WhatsApp");
    // O link passa pelo office pra contar o clique.
    expect(links[0].url.startsWith("https://office.usepolia.com.br/api/link?e=")).toBe(true);
    expect(contato().tags).toContain("FALA comentou");
    expect(exec()).toMatchObject({ estado: "concluida" });
  });

  it("clique no link conta e redireciona só pro endereço da automação", async () => {
    ligar(modeloFalaInstagram(), "a-ig");
    await aoReceberMensagem({ ...ctx("instagram"), mensagem: comentario("fala") });
    await aoReceberMensagem({
      ...ctx("instagram"),
      mensagem: toque(payloadBotao("boas_vindas", "continuar"), "Quero continuar"),
    });
    const url = (envios[1].envio.links as { url: string }[])[0].url;
    // O id falso do banco em memória não tem formato de UUID: troca por um que tenha.
    const uuid = "00000000-0000-4000-8000-000000000001";
    exec().id = uuid;
    const real = url.replace(/e=[^&]+/, `e=${uuid}`);

    const r = await tratarCliqueLink(new Request(real));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(LINK_WHATSAPP_FALA);
    expect((exec().dados as { cliques: number }).cliques).toBe(1);

    const errado = await tratarCliqueLink(new Request(real.replace(/b=[^&]+/, "b=outro")));
    expect(errado.headers.get("location")).toBe("https://usepolia.com.br/");
  });

  it("comentário sem a palavra escolhida não dispara", async () => {
    const a = modeloFalaInstagram();
    if (a.gatilho.tipo === "comentario") a.gatilho.palavras = ["fala"];
    ligar(a, "a-ig");
    await aoReceberMensagem({ ...ctx("instagram"), mensagem: comentario("que lindo") });
    expect(envios).toHaveLength(0);
  });

  it("pedido pra seguir: só manda o link depois que a pessoa segue", async () => {
    const a = automacaoComentarioEmBranco();
    const g = guiadoEmBranco();
    g.seguir.ativo = true;
    a.passos = guiadoParaPassos(g);
    ligar(a, "a-seguir");

    await aoReceberMensagem({ ...ctx("instagram"), mensagem: comentario("quero") });
    await aoReceberMensagem({
      ...ctx("instagram"),
      mensagem: toque(payloadBotao("boas_vindas", "continuar"), g.boasVindas.botao),
    });
    expect(ultimoTexto()).toBe(g.seguir.texto);

    meta.segue = false;
    await aoReceberMensagem({
      ...ctx("instagram"),
      mensagem: toque(payloadBotao("seguir", "seguir"), g.seguir.botao),
    });
    expect(ultimoTexto()).toBe(g.seguir.textoNaoSegue);
    expect(exec()).toMatchObject({ estado: "aguardando", tentativas: 1 });

    meta.segue = true;
    await aoReceberMensagem({
      ...ctx("instagram"),
      mensagem: toque(payloadBotao("seguir", "seguir"), g.seguir.botao),
    });
    expect(ultimoTexto()).toBe(g.link.texto);
    expect(exec()).toMatchObject({ estado: "concluida" });
  });

  it("pedido de e-mail: o e-mail vira o e-mail do contato", async () => {
    const a = automacaoComentarioEmBranco();
    const g = guiadoEmBranco();
    g.email.ativo = true;
    a.passos = guiadoParaPassos(g);
    ligar(a, "a-email");

    await aoReceberMensagem({ ...ctx("instagram"), mensagem: comentario("quero") });
    await aoReceberMensagem({
      ...ctx("instagram"),
      mensagem: toque(payloadBotao("boas_vindas", "continuar"), g.boasVindas.botao),
    });
    expect(ultimoTexto()).toBe(g.email.texto);
    await aoReceberMensagem({ ...ctx("instagram"), mensagem: msg("Ana@Marca.com.br") });
    expect((db.crm_contatos[0] as { email?: string }).email).toBe("ana@marca.com.br");
    expect(ultimoTexto()).toBe(g.link.texto);
  });

  it("próxima publicação: post antigo não conta, o primeiro post novo vira o post da automação", async () => {
    const a = automacaoComentarioEmBranco();
    if (a.gatilho.tipo === "comentario") {
      a.gatilho.proximo_post = true;
      a.gatilho.proximo_desde = "2026-10-26T12:00:00.000Z";
    }
    ligar(a, "a-proximo");
    meta.datas = { VELHO: "2026-10-20T10:00:00.000Z", NOVO: "2026-10-27T09:00:00.000Z" };

    await aoReceberMensagem({ ...ctx("instagram"), mensagem: comentario("oi", "VELHO") });
    expect(envios).toHaveLength(0);

    await aoReceberMensagem({ ...ctx("instagram"), mensagem: comentario("oi", "NOVO") });
    expect(envios).toHaveLength(1);
    expect(db.auto_automacoes[0].gatilho).toMatchObject({ posts: ["NOVO"], proximo_post: false });
  });
});

describe("resposta padrão", () => {
  it("dispara quando nada casa, e só uma vez a cada 24h", async () => {
    preparar("instagram");
    db.auto_automacoes.push({
      id: "a-padrao",
      nome: "Padrão",
      canal: "ambos",
      ativa: true,
      execucoes: 0,
      gatilho: { tipo: "resposta_padrao" },
      passos: [
        {
          id: "x",
          tipo: "mensagem",
          texto: "Oi. Já já a Pólia responde.",
          botoes: [],
          salvar_em: null,
        },
      ],
    });
    await aoReceberMensagem({ ...ctx("instagram"), mensagem: msg("oi") });
    await aoReceberMensagem({ ...ctx("instagram"), mensagem: msg("tem alguém aí?") });
    expect(envios).toHaveLength(1);
  });
});
