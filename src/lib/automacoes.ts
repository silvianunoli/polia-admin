// Automações da caixa de entrada (fase 2 do "ManyChat próprio", CRM-27). Parte pura: tipos,
// validação, casamento de gatilho, navegação entre passos e variáveis. O que fala com banco e
// com a Meta fica em automacoes.server.ts.
//
// Uma automação = um gatilho + uma LISTA de passos (o construtor em lista que a Sil escolheu;
// o canvas da fase 5 vai ler este mesmo JSON). Ramificação existe só por botão: cada botão
// pode pular pra um passo; sem pulo, segue pro próximo da lista.
import { z } from "zod";

export const CANAIS_AUTOMACAO = ["instagram", "whatsapp", "ambos"] as const;
export type CanalAutomacao = (typeof CANAIS_AUTOMACAO)[number];

const id = z.string().trim().min(1).max(40);
const textoMsg = z.string().trim().min(1, "Mensagem vazia.").max(1000);
const listaPalavras = z.array(z.string().trim().min(1).max(60)).max(30);

export const gatilhoSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("comentario"),
    // Vazio = qualquer post. Senão, IDs de mídia do Instagram.
    posts: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    // "Próxima publicação ou Reel" do ManyChat: o 1º post publicado depois de salvar vira o
    // post da automação (o motor grava o ID dele em `posts` no primeiro comentário).
    proximo_post: z.boolean().default(false),
    proximo_desde: z.string().nullable().default(null),
    // Vazio = qualquer comentário.
    palavras: listaPalavras.default([]),
    // Uma é sorteada pra responder em público ("Te mandei no Direct"). Vazio = não responde.
    respostas_publicas: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
    // true = editada pela tela guiada "Comentário → Direct", igual ao construtor do ManyChat.
    guiado: z.boolean().default(false),
  }),
  z.object({
    tipo: z.literal("palavra_chave"),
    palavras: listaPalavras.min(1, "Coloque ao menos uma palavra-chave."),
    modo: z.enum(["contem", "exata"]).default("contem"),
  }),
  z.object({ tipo: z.literal("resposta_padrao") }),
]);
export type Gatilho = z.infer<typeof gatilhoSchema>;

export const botaoSchema = z.object({
  id,
  titulo: z.string().trim().min(1, "Botão sem texto.").max(20, "Botão com mais de 20 letras."),
  // ID do passo pra onde pula. null = segue pro próximo da lista.
  ir_para: id.nullable().default(null),
  // Botão de link ("Abrir o WhatsApp"): abre o endereço e não espera resposta.
  url: z.string().trim().url("Link do botão inválido.").max(1000).nullable().default(null),
});
export type Botao = z.infer<typeof botaoSchema>;

export const passoSchema = z.discriminatedUnion("tipo", [
  z.object({
    id,
    tipo: z.literal("mensagem"),
    texto: textoMsg,
    botoes: z.array(botaoSchema).max(10).default([]),
    // Com botões, guarda o título do botão tocado (ou o que a pessoa digitou) neste campo.
    salvar_em: z.string().trim().max(40).nullable().default(null),
  }),
  z.object({
    id,
    tipo: z.literal("pergunta"),
    texto: textoMsg,
    salvar_em: z.string().trim().min(1, "Diga em qual campo a resposta fica guardada.").max(40),
    validacao: z.enum(["texto", "email", "telefone", "numero"]).default("texto"),
  }),
  z.object({
    id,
    tipo: z.literal("midia"),
    midia: z.enum(["imagem", "arquivo", "video", "audio"]),
    url: z.string().trim().url("Link do arquivo inválido.").max(1000).or(z.literal("")),
    nome: z.string().trim().max(120).default(""),
    legenda: z.string().trim().max(1000).default(""),
  }),
  z.object({
    id,
    tipo: z.literal("tag"),
    adicionar: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
    remover: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  }),
  z.object({
    id,
    tipo: z.literal("crm"),
    negocio: z
      .object({ titulo: z.string().trim().min(1).max(160), produto: z.string().trim().max(160) })
      .nullable()
      .default(null),
    lembrete: z
      .object({ titulo: z.string().trim().min(1).max(160), dias: z.number().int().min(0).max(60) })
      .nullable()
      .default(null),
    status: z
      .enum(["lead", "conversando", "cliente", "inativa", "perdida"])
      .nullable()
      .default(null),
  }),
  z.object({
    id,
    tipo: z.literal("notificar"),
    texto: z.string().trim().min(1).max(500),
  }),
  // "DM solicitando que sigam seu perfil antes de receberem o link" (só Instagram): manda o
  // pedido com um botão; no toque, confere se a pessoa segue e só então segue em frente.
  z.object({
    id,
    tipo: z.literal("seguir"),
    texto: textoMsg,
    botao: z.string().trim().min(1, "Botão sem texto.").max(20, "Botão com mais de 20 letras."),
    texto_nao_segue: textoMsg,
  }),
]);
export type Passo = z.infer<typeof passoSchema>;
export type TipoPasso = Passo["tipo"];

export const automacaoSchema = z
  .object({
    nome: z.string().trim().min(1, "Dê um nome pra automação.").max(120),
    canal: z.enum(CANAIS_AUTOMACAO),
    ativa: z.boolean(),
    gatilho: gatilhoSchema,
    passos: z.array(passoSchema).min(1, "A automação precisa de ao menos um passo.").max(40),
  })
  .superRefine((a, ctx) => {
    if (a.gatilho.tipo === "comentario" && a.canal !== "instagram") {
      ctx.addIssue({ code: "custom", message: "Gatilho de comentário só existe no Instagram." });
    }
    const ids = new Set(a.passos.map((p) => p.id));
    if (ids.size !== a.passos.length) {
      ctx.addIssue({ code: "custom", message: "Dois passos com o mesmo ID." });
    }
    for (const p of a.passos) {
      if (p.tipo !== "mensagem") continue;
      for (const b of p.botoes) {
        if (b.ir_para && !ids.has(b.ir_para)) {
          ctx.addIssue({
            code: "custom",
            message: `O botão "${b.titulo}" pula pra um passo que não existe.`,
          });
        }
      }
    }
  });
export type AutomacaoEntrada = z.infer<typeof automacaoSchema>;

// ---------------------------------------------------------------- texto

export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

function contemPalavra(texto: string, palavras: string[], modo: "contem" | "exata"): boolean {
  const t = normalizar(texto);
  return palavras.some((p) => {
    const alvo = normalizar(p);
    return alvo.length > 0 && (modo === "exata" ? t === alvo : t.includes(alvo));
  });
}

export function canalCasa(automacao: CanalAutomacao, canal: "instagram" | "whatsapp"): boolean {
  return automacao === "ambos" || automacao === canal;
}

// ---------------------------------------------------------------- gatilhos

export interface EntradaGatilho {
  canal: "instagram" | "whatsapp";
  tipo: string; // tipo da mensagem recebida (texto, botao, comentario...)
  texto: string | null;
  mediaId: string | null; // post do comentário
}

export function gatilhoCasa(g: Gatilho, e: EntradaGatilho): boolean {
  if (g.tipo === "comentario") {
    if (e.tipo !== "comentario" || e.canal !== "instagram") return false;
    // "Próxima publicação" ainda sem post definido: quem decide é o servidor (olha a data do post).
    if (g.proximo_post && g.posts.length === 0) return false;
    if (g.posts.length > 0 && (!e.mediaId || !g.posts.includes(e.mediaId))) return false;
    return g.palavras.length === 0 || contemPalavra(e.texto ?? "", g.palavras, "contem");
  }
  // Comentário só dispara automação de comentário; story e reação não disparam nada.
  if (!["texto", "botao"].includes(e.tipo) || !e.texto) return false;
  if (g.tipo === "palavra_chave") return contemPalavra(e.texto, g.palavras, g.modo);
  return false; // resposta padrão é decidida fora, quando nenhuma outra casou
}

// ---------------------------------------------------------------- botões e respostas

// Payload que vai no botão e volta no webhook: "p:<idDoPasso>:<idDoBotao>".
export function payloadBotao(passoId: string, botaoId: string): string {
  return `p:${passoId}:${botaoId}`;
}

export function botaoEscolhido(
  passo: Extract<Passo, { tipo: "mensagem" }>,
  resposta: { texto: string | null; payload: string | null },
): Botao | null {
  if (resposta.payload) {
    const b = passo.botoes.find((x) => payloadBotao(passo.id, x.id) === resposta.payload);
    if (b) return b;
  }
  // A pessoa pode digitar o texto do botão em vez de tocar.
  if (resposta.texto) {
    const t = normalizar(resposta.texto);
    return passo.botoes.find((x) => normalizar(x.titulo) === t) ?? null;
  }
  return null;
}

export function respostaValida(validacao: string, texto: string): boolean {
  const t = texto.trim();
  if (!t) return false;
  if (validacao === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
  if (validacao === "telefone") return t.replace(/\D/g, "").length >= 10;
  // Aceita "1500", "1.500", "R$ 1.500,00": só não pode ter letra.
  if (validacao === "numero") return /\d/.test(t) && /^[R$\s\d.,-]+$/.test(t);
  return true;
}

export const MSG_RESPOSTA_INVALIDA: Record<string, string> = {
  email: "Não reconheci esse e-mail. Pode mandar de novo?",
  telefone: "Não reconheci esse número. Pode mandar de novo, com DDD?",
  numero: "Pode mandar só o número?",
  texto: "Pode responder com uma mensagem de texto?",
};

// Próximo índice depois do passo atual: o pulo do botão, ou o seguinte da lista.
export function proximoIndice(passos: Passo[], atual: number, irPara: string | null): number {
  if (irPara) {
    const i = passos.findIndex((p) => p.id === irPara);
    if (i >= 0) return i;
  }
  return atual + 1;
}

// ---------------------------------------------------------------- variáveis

// {primeiro_nome}, {nome} e qualquer campo guardado ({marca_instagram}). Variável sem valor some.
export function interpolar(
  texto: string,
  contato: { nome: string; campos: Record<string, unknown> },
): string {
  const primeiro = contato.nome.replace(/^@/, "").trim().split(/\s+/)[0] ?? "";
  // Contato sem nome de verdade não vira "Oi, Contato".
  const semNome = /^(contato do instagram|\+?\d+)$/i.test(contato.nome.trim());
  return (
    texto
      .replace(/\{(\w+)\}/g, (_, chave: string) => {
        if (chave === "primeiro_nome") return semNome ? "" : primeiro;
        if (chave === "nome") return semNome ? "" : contato.nome;
        const v = contato.campos[chave];
        return typeof v === "string" || typeof v === "number" ? String(v) : "";
      })
      .replace(/ +([,.!?])/g, "$1")
      // "Oi, {primeiro_nome}." sem nome vira "Oi.", não "Oi,."
      .replace(/,([.!?])/g, "$1")
      .replace(/ {2,}/g, " ")
      .trim()
  );
}

// ---------------------------------------------------------------- modelos prontos

export function novoId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// O FALA de hoje no ManyChat, recriado (lido na conta em 26/10/2026). Dois pedaços, como lá:
// o comentário no Instagram leva pro WhatsApp, e a palavra-chave no WhatsApp faz o briefing.
// Diferença de propósito: aqui as respostas de botão também ficam salvas, e o fim cria
// negócio e lembrete no CRM em vez de só mandar e-mail.
export const LINK_WHATSAPP_FALA = "https://wa.me/5511996963296?text=Comentei%20FALA";

// ---------------------------------------------------------------- comentário → Direct (guiado)

// Os 4 blocos do construtor de comentário do ManyChat ("Automação instantânea"), na mesma
// ordem: quando alguém comenta → e o comentário tem → eles receberão → e então receberão.
// Vira uma lista de passos com IDs fixos, então o motor é o mesmo das outras automações.
export interface ComentarioGuiado {
  boasVindas: { ativo: boolean; texto: string; botao: string };
  seguir: { ativo: boolean; texto: string; botao: string; textoNaoSegue: string };
  email: { ativo: boolean; texto: string };
  link: { texto: string; botoes: { titulo: string; url: string }[] };
  tags: string[];
}

export const PASSOS_GUIADOS = ["boas_vindas", "seguir", "email", "link", "tags"] as const;

export function guiadoParaPassos(g: ComentarioGuiado): Passo[] {
  const passos: Passo[] = [];
  if (g.boasVindas.ativo) {
    passos.push({
      id: "boas_vindas",
      tipo: "mensagem",
      texto: g.boasVindas.texto,
      botoes: [{ id: "continuar", titulo: g.boasVindas.botao, ir_para: null, url: null }],
      salvar_em: null,
    });
  }
  if (g.seguir.ativo) {
    passos.push({
      id: "seguir",
      tipo: "seguir",
      texto: g.seguir.texto,
      botao: g.seguir.botao,
      texto_nao_segue: g.seguir.textoNaoSegue,
    });
  }
  if (g.email.ativo) {
    passos.push({
      id: "email",
      tipo: "pergunta",
      texto: g.email.texto,
      salvar_em: "email",
      validacao: "email",
    });
  }
  passos.push({
    id: "link",
    tipo: "mensagem",
    texto: g.link.texto,
    botoes: g.link.botoes.map((b, i) => ({
      id: `link${i + 1}`,
      titulo: b.titulo,
      ir_para: null,
      url: b.url,
    })),
    salvar_em: null,
  });
  if (g.tags.length > 0) {
    passos.push({ id: "tags", tipo: "tag", adicionar: g.tags, remover: [] });
  }
  return passos;
}

export function passosParaGuiado(passos: Passo[]): ComentarioGuiado {
  const achar = <T extends Passo["tipo"]>(id: string, tipo: T) =>
    passos.find((p): p is Extract<Passo, { tipo: T }> => p.id === id && p.tipo === tipo);
  const bv = achar("boas_vindas", "mensagem");
  const sg = achar("seguir", "seguir");
  const em = achar("email", "pergunta");
  const lk = achar("link", "mensagem");
  const tg = achar("tags", "tag");
  const padrao = guiadoEmBranco();
  return {
    boasVindas: bv
      ? { ativo: true, texto: bv.texto, botao: bv.botoes[0]?.titulo ?? padrao.boasVindas.botao }
      : { ...padrao.boasVindas, ativo: false },
    seguir: sg
      ? { ativo: true, texto: sg.texto, botao: sg.botao, textoNaoSegue: sg.texto_nao_segue }
      : { ...padrao.seguir, ativo: false },
    email: em ? { ativo: true, texto: em.texto } : { ...padrao.email, ativo: false },
    link: lk
      ? {
          texto: lk.texto,
          // Botão recém-adicionado ainda sem link continua na tela (o zod cobra o link ao salvar).
          botoes: lk.botoes.map((b) => ({ titulo: b.titulo, url: b.url ?? "" })),
        }
      : padrao.link,
    tags: tg?.adicionar ?? [],
  };
}

// Ponto de partida de uma automação nova, no espírito dos padrões do ManyChat.
export function guiadoEmBranco(): ComentarioGuiado {
  return {
    boasVindas: {
      ativo: true,
      texto: "Oi. Que bom que você comentou. Toca no botão aqui embaixo que eu te mando o link.",
      botao: "Quero o link",
    },
    seguir: {
      ativo: false,
      texto: "Antes de mandar o link: você já segue a Pólia? Segue e depois toca no botão.",
      botao: "Já segui",
      textoNaoSegue: "Ainda não apareceu aqui que você segue. Segue o perfil e toca de novo.",
    },
    email: { ativo: false, texto: "Qual é o seu melhor e-mail? Mando tudo por lá também." },
    link: {
      texto: "Aqui está o link.",
      botoes: [{ titulo: "Abrir", url: "https://usepolia.com.br" }],
    },
    tags: [],
  };
}

export function automacaoComentarioEmBranco(): AutomacaoEntrada {
  return {
    nome: "Comentário vira Direct",
    canal: "instagram",
    ativa: false,
    gatilho: {
      tipo: "comentario",
      posts: [],
      proximo_post: false,
      proximo_desde: null,
      palavras: [],
      respostas_publicas: ["Te mandei no Direct.", "Olha o Direct.", "Mandei no seu Direct."],
      guiado: true,
    },
    passos: guiadoParaPassos(guiadoEmBranco()),
  };
}

// O "Auto-DM de links dos comentários" do ManyChat, com o texto que está lá hoje (lido em
// 26/10/2026, inclusive as 3 respostas públicas e o botão "Quero continuar").
export function modeloFalaInstagram(): AutomacaoEntrada {
  return {
    nome: "FALA: comentário vira Direct",
    canal: "instagram",
    ativa: false,
    gatilho: {
      tipo: "comentario",
      posts: [],
      proximo_post: false,
      proximo_desde: null,
      palavras: [],
      respostas_publicas: [
        "Oiee! Por favor, veja DM!!",
        "Olá!! Te enviei uma mensagem! Dá uma olhada!",
        "Oiee! Verifica as sua DM!",
      ],
      guiado: true,
    },
    passos: guiadoParaPassos({
      boasVindas: {
        ativo: true,
        texto:
          "Oi. Vi seu comentário.\n\nQuando uma cliente fala que está caro, o que você costuma responder?\n\nToca no botão aqui embaixo que eu te mostro onde a conversa continua.",
        botao: "Quero continuar",
      },
      seguir: { ...guiadoEmBranco().seguir, ativo: false },
      email: { ...guiadoEmBranco().email, ativo: false },
      link: {
        texto:
          "Me conta a sua resposta no WhatsApp da Pólia Lab. É lá que a conversa sobre a sua marca continua.",
        botoes: [{ titulo: "Abrir o WhatsApp", url: LINK_WHATSAPP_FALA }],
      },
      tags: ["FALA comentou"],
    }),
  };
}

export function modeloFalaWhatsapp(): AutomacaoEntrada {
  const botoes = (titulos: string[]) =>
    titulos.map((titulo, i) => ({ id: `b${i + 1}`, titulo, ir_para: null, url: null }));
  return {
    nome: "FALA no WhatsApp: briefing",
    canal: "whatsapp",
    ativa: false,
    gatilho: { tipo: "palavra_chave", palavras: ["Comentei FALA"], modo: "contem" },
    passos: [
      {
        id: "p1",
        tipo: "pergunta",
        texto:
          "Oi, {primeiro_nome}. Que bom que você veio do carrossel.\n\nAntes de qualquer coisa, me conta: quando uma cliente fala que está caro, o que você costuma responder?",
        salvar_em: "resposta_ta_caro",
        validacao: "texto",
      },
      {
        id: "p2",
        tipo: "pergunta",
        texto:
          "Obrigada por contar. Essa cena acontece em muita marca boa.\n\nPra eu entender a sua: qual é o nome da marca e o @ dela no Instagram?",
        salvar_em: "marca_instagram",
        validacao: "texto",
      },
      {
        id: "p3",
        tipo: "pergunta",
        texto: "E o que a marca vende?",
        salvar_em: "produto_marca",
        validacao: "texto",
      },
      {
        id: "p4",
        tipo: "mensagem",
        texto: "Onde ela mais vende?",
        botoes: botoes(["Instagram", "WhatsApp", "Loja ou site"]),
        salvar_em: "onde_vende",
      },
      {
        id: "p5",
        tipo: "mensagem",
        texto: "Quanto a marca fatura por mês, mais ou menos?",
        botoes: botoes(["Até R$ 3 mil", "R$ 3 a 10 mil", "Mais de R$ 10 mil"]),
        salvar_em: "faturamento",
      },
      {
        id: "p6",
        tipo: "mensagem",
        texto: "Pra quando a marca precisa estar pronta?",
        botoes: botoes(["Este mês", "Em até 3 meses", "Sem data ainda"]),
        salvar_em: "prazo",
      },
      {
        id: "p7",
        tipo: "mensagem",
        texto:
          "Obrigada. Separei a apresentação do Sua Marca Fala Primeiro pra você ler com calma, aqui mesmo.",
        botoes: [],
        salvar_em: null,
      },
      {
        id: "p8",
        tipo: "midia",
        midia: "arquivo",
        url: "",
        nome: "Sua-Marca-Fala-Primeiro.pdf",
        legenda: "",
      },
      {
        id: "p9",
        tipo: "mensagem",
        texto: "A Sil vai olhar o seu briefing e te responder pessoalmente aqui, com a proposta.",
        botoes: [],
        salvar_em: null,
      },
      { id: "p10", tipo: "tag", adicionar: ["FALA briefing"], remover: [] },
      {
        id: "p11",
        tipo: "crm",
        negocio: { titulo: "Sua Marca Fala Primeiro", produto: "Sua Marca Fala Primeiro" },
        lembrete: { titulo: "Responder o briefing do FALA", dias: 1 },
        status: "conversando",
      },
      {
        id: "p12",
        tipo: "notificar",
        texto: "Novo briefing do FALA no WhatsApp. As respostas estão na conversa e na ficha.",
      },
    ],
  };
}

// Resumo de uma linha pra lista de automações.
export function resumoGatilho(g: Gatilho): string {
  if (g.tipo === "comentario") {
    const onde =
      g.proximo_post && g.posts.length === 0
        ? "na próxima publicação"
        : g.posts.length === 0
          ? "em qualquer post"
          : g.posts.length === 1
            ? "em 1 post"
            : `em ${g.posts.length} posts`;
    const quais =
      g.palavras.length === 0 ? "qualquer comentário" : `com "${g.palavras.join('", "')}"`;
    return `Comentário ${onde}, ${quais}`;
  }
  if (g.tipo === "palavra_chave") {
    return `Mensagem ${g.modo === "exata" ? "igual a" : "com"} "${g.palavras.join('", "')}"`;
  }
  return "Resposta padrão (quando nada mais casa)";
}
