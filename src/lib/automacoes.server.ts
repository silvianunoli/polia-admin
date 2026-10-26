// Motor das automações (CRM-27). Só servidor. Roda dentro do processamento do webhook, logo
// depois de a mensagem da pessoa ser gravada (conversas-meta.server.ts → aoReceberMensagem).
//
// Ordem de decisão a cada mensagem que chega:
//   1. conversa com automação pausada (a Sil assumiu) → nada roda.
//   2. existe execução esperando essa pessoa → a mensagem é a resposta dela.
//   3. comentário → automação de comentário que case com o post e a palavra.
//   4. texto ou botão → automação de palavra-chave.
//   5. nada casou → resposta padrão, no máximo uma vez a cada 24h por conversa.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { emailPolia, enviarEmailResend, escapeHtml } from "@/lib/email-template";
import { resumoMensagem, type Canal, type MensagemRecebida } from "@/lib/conversas-meta";
import {
  dataDoPost,
  enviarPeloCanal,
  responderComentarioEmPublico,
  seguePerfil,
  type Envio,
} from "@/lib/conversas-meta.server";
import {
  MSG_RESPOSTA_INVALIDA,
  botaoEscolhido,
  canalCasa,
  gatilhoCasa,
  interpolar,
  passoSchema,
  gatilhoSchema,
  payloadBotao,
  proximoIndice,
  respostaValida,
  type Gatilho,
  type Passo,
} from "@/lib/automacoes";

const JANELA_RESPOSTA_PADRAO_MS = 24 * 60 * 60 * 1000;
const MAX_TENTATIVAS_SEGUIR = 3;
const BASE_OFFICE = "https://office.usepolia.com.br";

// Link do botão passa por /api/link: conta o clique e redireciona pro endereço que está na
// automação (nunca pra um endereço que veio na URL, então não vira redirecionamento aberto).
export function linkRastreado(execucaoId: string, passoId: string, botaoId: string): string {
  const q = new URLSearchParams({ e: execucaoId, p: passoId, b: botaoId });
  return `${BASE_OFFICE}/api/link?${q.toString()}`;
}

async function preencherEmail(contatoId: string, email: string) {
  const { data } = await supabaseAdmin
    .from("crm_contatos")
    .select("email")
    .eq("id", contatoId)
    .maybeSingle();
  if ((data as { email: string | null } | null)?.email) return;
  // E-mail que já é de outro contato (índice único) fica só no campo guardado.
  await supabaseAdmin
    .from("crm_contatos")
    .update({ email, atualizado_em: new Date().toISOString() })
    .eq("id", contatoId);
}
// Execução esperando há mais que isso não prende mais a pessoa: a próxima mensagem é nova.
const VALIDADE_ESPERA_MS = 24 * 60 * 60 * 1000;
const MAX_TENTATIVAS = 2;
const EMAIL_AVISO = "oi@usepolia.com.br";

interface AutomacaoLinha {
  id: string;
  nome: string;
  canal: "instagram" | "whatsapp" | "ambos";
  gatilho: Gatilho;
  passos: Passo[];
  execucoes: number;
}

interface ExecucaoLinha {
  id: string;
  automacao_id: string;
  conversa_id: string;
  contato_id: string;
  estado: string;
  passo_idx: number;
  aguardando: "resposta" | "janela" | null;
  tentativas: number;
  dados: { comentario_id?: string; comentario_usado?: boolean };
  atualizado_em: string;
}

interface Contexto {
  canal: Canal;
  externoId: string;
  contatoId: string;
  conversaId: string;
}

export interface ChegadaMensagem extends Contexto {
  mensagem: MensagemRecebida;
}

// ---------------------------------------------------------------- leitura

async function carregarAutomacao(id: string): Promise<AutomacaoLinha | null> {
  const { data } = await supabaseAdmin
    .from("auto_automacoes")
    .select("id, nome, canal, gatilho, passos, execucoes")
    .eq("id", id)
    .maybeSingle();
  return data ? lerAutomacao(data as Record<string, unknown>) : null;
}

// O JSON do banco passa de novo pelo zod: um passo quebrado não derruba o motor inteiro.
function lerAutomacao(linha: Record<string, unknown>): AutomacaoLinha | null {
  const gatilho = gatilhoSchema.safeParse(linha.gatilho);
  if (!gatilho.success) return null;
  const passos = (Array.isArray(linha.passos) ? linha.passos : [])
    .map((p) => passoSchema.safeParse(p))
    .filter((r) => r.success)
    .map((r) => r.data as Passo);
  return {
    id: String(linha.id),
    nome: String(linha.nome),
    canal: linha.canal as AutomacaoLinha["canal"],
    gatilho: gatilho.data,
    passos,
    execucoes: Number(linha.execucoes ?? 0),
  };
}

async function automacoesAtivas(canal: Canal): Promise<AutomacaoLinha[]> {
  const { data } = await supabaseAdmin
    .from("auto_automacoes")
    .select("id, nome, canal, gatilho, passos, execucoes")
    .eq("ativa", true)
    .in("canal", [canal, "ambos"])
    .order("criado_em", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[])
    .map(lerAutomacao)
    .filter((a): a is AutomacaoLinha => a !== null && canalCasa(a.canal, canal));
}

async function contatoParaTexto(
  contatoId: string,
): Promise<{ nome: string; campos: Record<string, unknown>; tags: string[] }> {
  const { data } = await supabaseAdmin
    .from("crm_contatos")
    .select("nome, campos, tags")
    .eq("id", contatoId)
    .maybeSingle();
  const c = (data ?? {}) as { nome?: string; campos?: Record<string, unknown>; tags?: string[] };
  return { nome: c.nome ?? "", campos: c.campos ?? {}, tags: c.tags ?? [] };
}

// ---------------------------------------------------------------- escrita

async function gravarSaida(
  ctx: Contexto,
  exec: ExecucaoLinha,
  linha: { tipo: string; texto: string | null; dados?: Record<string, unknown> },
  resultado: { metaId: string } | { erro: string },
) {
  const agora = new Date().toISOString();
  const base = {
    conversa_id: ctx.conversaId,
    direcao: "saida",
    tipo: linha.tipo,
    texto: linha.texto,
    dados: { ...(linha.dados ?? {}), automacao_id: exec.automacao_id, execucao_id: exec.id },
    criado_em: agora,
  };
  if ("erro" in resultado) {
    await supabaseAdmin
      .from("conv_mensagens")
      .insert({ ...base, status: "falhou", erro: resultado.erro });
    return;
  }
  const { error } = await supabaseAdmin
    .from("conv_mensagens")
    .insert({ ...base, status: "enviada", meta_id: resultado.metaId });
  // O eco da Meta pode ter chegado antes desta linha: só marca que foi a automação.
  if (error?.code === "23505") {
    await supabaseAdmin
      .from("conv_mensagens")
      .update({ dados: base.dados })
      .eq("meta_id", resultado.metaId);
  }
  await supabaseAdmin
    .from("conv_conversas")
    .update({
      ultima_mensagem_em: agora,
      ultima_mensagem_resumo: resumoMensagem(linha.tipo as "texto", linha.texto),
      atualizado_em: agora,
    })
    .eq("id", ctx.conversaId);
}

async function atualizarExecucao(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin
    .from("auto_execucoes")
    .update({ ...patch, atualizado_em: new Date().toISOString() })
    .eq("id", id);
}

class FalhaEnvio extends Error {}

// Envia uma mensagem da automação. A 1ª de uma execução que nasceu de comentário vai como
// resposta privada ao comentário; as seguintes precisam da janela aberta pela pessoa.
async function enviar(
  ctx: Contexto,
  exec: ExecucaoLinha,
  envio: Envio,
  registro: { tipo: string; texto: string | null; dados?: Record<string, unknown> },
): Promise<void> {
  const viaComentario = exec.dados.comentario_id && !exec.dados.comentario_usado;
  try {
    const metaId = await enviarPeloCanal(
      ctx.canal,
      ctx.externoId,
      envio,
      viaComentario ? exec.dados.comentario_id : undefined,
    );
    await gravarSaida(ctx, exec, registro, { metaId });
    if (viaComentario) {
      exec.dados = { ...exec.dados, comentario_usado: true };
      await atualizarExecucao(exec.id, { dados: exec.dados });
    }
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    await gravarSaida(ctx, exec, registro, { erro });
    throw new FalhaEnvio(erro);
  }
}

async function salvarCampo(contatoId: string, campo: string, valor: string) {
  const { campos } = await contatoParaTexto(contatoId);
  await supabaseAdmin
    .from("crm_contatos")
    .update({ campos: { ...campos, [campo]: valor }, atualizado_em: new Date().toISOString() })
    .eq("id", contatoId);
}

function dataDaqui(dias: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  // Lembrete é por dia, no fuso de Brasília (UTC-3 o ano todo).
  const br = new Date(d.getTime() - 3 * 3_600_000);
  return br.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- execução

// Roda a partir de exec.passo_idx até precisar esperar a pessoa ou acabar a lista.
async function executar(ctx: Contexto, automacao: AutomacaoLinha, exec: ExecucaoLinha) {
  const passos = automacao.passos;
  let idx = exec.passo_idx;

  try {
    while (idx < passos.length) {
      const passo = passos[idx];
      const contato = await contatoParaTexto(ctx.contatoId);

      // Depois da resposta privada ao comentário, o Instagram só deixa mandar outra mensagem
      // quando a pessoa escrever. A execução espera, sem gastar o passo.
      const precisaJanela =
        exec.dados.comentario_usado &&
        (passo.tipo === "mensagem" ||
          passo.tipo === "pergunta" ||
          passo.tipo === "midia" ||
          passo.tipo === "seguir");
      if (precisaJanela && !(await janelaAberta(ctx.conversaId))) {
        await atualizarExecucao(exec.id, {
          estado: "aguardando",
          aguardando: "janela",
          passo_idx: idx,
        });
        return;
      }

      if (passo.tipo === "seguir") {
        // Seguir só existe no Instagram: no WhatsApp o passo é pulado.
        if (ctx.canal === "instagram") {
          const texto = interpolar(passo.texto, contato);
          const botoes = [{ payload: payloadBotao(passo.id, "seguir"), titulo: passo.botao }];
          await enviar(
            ctx,
            exec,
            { tipo: "texto", texto, botoes },
            {
              tipo: "texto",
              texto,
              dados: { botoes: [passo.botao] },
            },
          );
          await atualizarExecucao(exec.id, {
            estado: "aguardando",
            aguardando: "resposta",
            passo_idx: idx,
            tentativas: 0,
          });
          return;
        }
      } else if (passo.tipo === "mensagem" || passo.tipo === "pergunta") {
        const texto = interpolar(passo.texto, contato);
        const botoesPasso = passo.tipo === "mensagem" ? passo.botoes : [];
        const botoes = botoesPasso
          .filter((b) => !b.url)
          .map((b) => ({ payload: payloadBotao(passo.id, b.id), titulo: b.titulo }));
        // Botão de link passa pelo office antes de abrir: é assim que o clique é contado.
        const links = botoesPasso
          .filter((b) => b.url)
          .map((b) => ({ titulo: b.titulo, url: linkRastreado(exec.id, passo.id, b.id) }));
        await enviar(
          ctx,
          exec,
          { tipo: "texto", texto, botoes, links },
          {
            tipo: "texto",
            texto,
            dados: botoesPasso.length ? { botoes: botoesPasso.map((b) => b.titulo) } : {},
          },
        );
        const espera = passo.tipo === "pergunta" || botoes.length > 0;
        if (espera) {
          await atualizarExecucao(exec.id, {
            estado: "aguardando",
            aguardando: "resposta",
            passo_idx: idx,
            tentativas: 0,
          });
          return;
        }
      } else if (passo.tipo === "midia") {
        // Arquivo ainda sem link (o PDF do FALA vem assim no modelo): pula sem travar.
        if (passo.url) {
          await enviar(
            ctx,
            exec,
            {
              tipo: passo.midia,
              url: passo.url,
              nome: passo.nome || undefined,
              legenda: passo.legenda || undefined,
            },
            { tipo: passo.midia, texto: passo.legenda || passo.nome || null },
          );
        }
      } else if (passo.tipo === "tag") {
        const tags = new Set(contato.tags);
        passo.adicionar.forEach((t) => tags.add(t));
        passo.remover.forEach((t) => tags.delete(t));
        await supabaseAdmin
          .from("crm_contatos")
          .update({ tags: [...tags].slice(0, 20), atualizado_em: new Date().toISOString() })
          .eq("id", ctx.contatoId);
      } else if (passo.tipo === "crm") {
        if (passo.negocio) {
          await supabaseAdmin.from("crm_negocios").insert({
            contato_id: ctx.contatoId,
            titulo: interpolar(passo.negocio.titulo, contato),
            produto: passo.negocio.produto || null,
            fase: "novo",
            valor: 0,
          });
        }
        if (passo.lembrete) {
          await supabaseAdmin.from("crm_tarefas").insert({
            contato_id: ctx.contatoId,
            titulo: interpolar(passo.lembrete.titulo, contato),
            tipo: "followup",
            prazo: dataDaqui(passo.lembrete.dias),
          });
        }
        if (passo.status) {
          await supabaseAdmin
            .from("crm_contatos")
            .update({ status: passo.status, atualizado_em: new Date().toISOString() })
            .eq("id", ctx.contatoId);
        }
      } else if (passo.tipo === "notificar") {
        await avisarEquipe(automacao, contato, interpolar(passo.texto, contato), ctx);
      }

      idx += 1;
      await atualizarExecucao(exec.id, { passo_idx: idx });
    }
    await atualizarExecucao(exec.id, { estado: "concluida", aguardando: null, passo_idx: idx });
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error("[automacoes] execução parou", exec.id, erro);
    await atualizarExecucao(exec.id, { estado: "erro", erro, passo_idx: idx });
  }
}

async function janelaAberta(conversaId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("conv_conversas")
    .select("ultima_entrada_em")
    .eq("id", conversaId)
    .maybeSingle();
  const ultima = (data as { ultima_entrada_em: string | null } | null)?.ultima_entrada_em;
  return Boolean(ultima && Date.now() - new Date(ultima).getTime() < JANELA_RESPOSTA_PADRAO_MS);
}

async function avisarEquipe(
  automacao: AutomacaoLinha,
  contato: { nome: string; campos: Record<string, unknown> },
  texto: string,
  ctx: Contexto,
) {
  const respostas = Object.entries(contato.campos)
    .filter(([, v]) => typeof v === "string" && v)
    .map(([k, v]) => `${escapeHtml(k)}: ${escapeHtml(String(v))}`);
  await enviarEmailResend({
    to: [EMAIL_AVISO],
    subject: `${automacao.nome}: ${contato.nome}`,
    text: [texto, ...respostas].join("\n"),
    html: emailPolia({
      preheader: texto,
      headline: escapeHtml(automacao.nome),
      paragrafos: [escapeHtml(texto), `Contato: ${escapeHtml(contato.nome)}`, ...respostas],
      ctaLabel: "Abrir a conversa",
      ctaUrl: `https://office.usepolia.com.br/crm/conversas?c=${ctx.conversaId}`,
    }),
    contexto: "[automacoes]",
  });
}

// ---------------------------------------------------------------- respostas

async function responder(ctx: Contexto, exec: ExecucaoLinha, m: MensagemRecebida) {
  const automacao = await carregarAutomacao(exec.automacao_id);
  if (!automacao) {
    await atualizarExecucao(exec.id, { estado: "cancelada", erro: "Automação apagada." });
    return;
  }

  // Esperando só a janela abrir: a mensagem não é resposta de nada, só destrava a fila.
  if (exec.aguardando === "janela") {
    await atualizarExecucao(exec.id, { estado: "rodando", aguardando: null });
    await executar(ctx, automacao, { ...exec, estado: "rodando", aguardando: null });
    return;
  }

  const passo = automacao.passos[exec.passo_idx];
  if (!passo) {
    await atualizarExecucao(exec.id, { estado: "concluida", aguardando: null });
    return;
  }

  const texto = (m.texto ?? "").trim();
  const payload = typeof m.dados.payload === "string" ? m.dados.payload : null;
  let proximo = exec.passo_idx + 1;

  if (passo.tipo === "mensagem") {
    const botao = botaoEscolhido(passo, { texto, payload });
    const valor = botao?.titulo ?? texto;
    if (passo.salvar_em && valor) await salvarCampo(ctx.contatoId, passo.salvar_em, valor);
    proximo = proximoIndice(automacao.passos, exec.passo_idx, botao?.ir_para ?? null);
  } else if (passo.tipo === "pergunta") {
    if (!respostaValida(passo.validacao, texto)) {
      if (exec.tentativas < MAX_TENTATIVAS) {
        const aviso = MSG_RESPOSTA_INVALIDA[passo.validacao] ?? MSG_RESPOSTA_INVALIDA.texto;
        try {
          await enviar(ctx, exec, { tipo: "texto", texto: aviso }, { tipo: "texto", texto: aviso });
        } catch {
          // A falha já ficou gravada na conversa.
        }
        await atualizarExecucao(exec.id, { tentativas: exec.tentativas + 1 });
        return;
      }
      // Duas tentativas sem formato certo: guarda o que veio e segue, sem prender a pessoa.
    }
    if (texto) await salvarCampo(ctx.contatoId, passo.salvar_em, texto);
    // "DM solicitando o endereço de e-mail": o e-mail certo também vira o e-mail do contato,
    // que é o que as listas e campanhas do CRM usam.
    if (passo.validacao === "email" && respostaValida("email", texto)) {
      await preencherEmail(ctx.contatoId, texto.toLowerCase());
    }
  } else if (passo.tipo === "seguir") {
    const segue = await seguePerfil(ctx.externoId);
    if (!segue && exec.tentativas < MAX_TENTATIVAS_SEGUIR) {
      const aviso = passo.texto_nao_segue;
      const botoes = [{ payload: payloadBotao(passo.id, "seguir"), titulo: passo.botao }];
      try {
        await enviar(
          ctx,
          exec,
          { tipo: "texto", texto: aviso, botoes },
          {
            tipo: "texto",
            texto: aviso,
            dados: { botoes: [passo.botao] },
          },
        );
      } catch {
        // A falha já ficou gravada na conversa.
      }
      await atualizarExecucao(exec.id, { tentativas: exec.tentativas + 1 });
      return;
    }
    // Seguiu, ou já pediu 3 vezes: segue em frente sem prender a pessoa.
  }

  const seguinte = {
    ...exec,
    estado: "rodando",
    aguardando: null,
    passo_idx: proximo,
    tentativas: 0,
  };
  await atualizarExecucao(exec.id, {
    estado: "rodando",
    aguardando: null,
    passo_idx: proximo,
    tentativas: 0,
  });
  await executar(ctx, automacao, seguinte);
}

// ---------------------------------------------------------------- início

async function iniciar(
  ctx: Contexto,
  automacao: AutomacaoLinha,
  dados: ExecucaoLinha["dados"],
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("auto_execucoes")
    .insert({
      automacao_id: automacao.id,
      conversa_id: ctx.conversaId,
      contato_id: ctx.contatoId,
      estado: "rodando",
      passo_idx: 0,
      dados,
    })
    .select("*")
    .single();
  // Outra execução viva nessa conversa (índice único): não começa uma segunda.
  if (error || !data) return;
  await supabaseAdmin
    .from("auto_automacoes")
    .update({ execucoes: automacao.execucoes + 1 })
    .eq("id", automacao.id);
  await executar(ctx, automacao, data as ExecucaoLinha);
}

async function execucaoViva(conversaId: string): Promise<ExecucaoLinha | null> {
  const { data } = await supabaseAdmin
    .from("auto_execucoes")
    .select("*")
    .eq("conversa_id", conversaId)
    .in("estado", ["rodando", "aguardando"])
    .maybeSingle();
  return (data as ExecucaoLinha | null) ?? null;
}

async function respostaPadraoRecente(conversaId: string, automacaoId: string): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_RESPOSTA_PADRAO_MS).toISOString();
  const { data } = await supabaseAdmin
    .from("auto_execucoes")
    .select("id")
    .eq("conversa_id", conversaId)
    .eq("automacao_id", automacaoId)
    .gte("iniciado_em", desde)
    .limit(1);
  return (data ?? []).length > 0;
}

async function fixarProximoPost(ativas: AutomacaoLinha[], mediaId: string) {
  const esperando = ativas.filter(
    (a) =>
      a.gatilho.tipo === "comentario" && a.gatilho.proximo_post && a.gatilho.posts.length === 0,
  );
  if (esperando.length === 0) return;
  const publicado = await dataDoPost(mediaId);
  if (!publicado) return;
  for (const a of esperando) {
    const g = a.gatilho as Extract<Gatilho, { tipo: "comentario" }>;
    if (g.proximo_desde && publicado < g.proximo_desde) continue;
    const novo = { ...g, posts: [mediaId], proximo_post: false };
    await supabaseAdmin
      .from("auto_automacoes")
      .update({ gatilho: novo, atualizado_em: new Date().toISOString() })
      .eq("id", a.id);
    // Atualiza na memória também, pra este mesmo comentário já casar.
    a.gatilho = novo;
  }
}

// Clique num botão de link (/api/link?e=&p=&b=): conta e manda pro endereço da automação.
export async function tratarCliqueLink(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const e = url.searchParams.get("e") ?? "";
  const p = url.searchParams.get("p") ?? "";
  const b = url.searchParams.get("b") ?? "";
  const naoAchou = () => Response.redirect("https://usepolia.com.br", 302);
  if (!/^[0-9a-f-]{36}$/i.test(e) || !p || !b) return naoAchou();

  const { data: exec } = await supabaseAdmin
    .from("auto_execucoes")
    .select("id, automacao_id, dados")
    .eq("id", e)
    .maybeSingle();
  if (!exec) return naoAchou();
  const linha = exec as { id: string; automacao_id: string; dados: Record<string, unknown> };
  const automacao = await carregarAutomacao(linha.automacao_id);
  const passo = automacao?.passos.find((x) => x.id === p);
  const destino = passo?.tipo === "mensagem" ? passo.botoes.find((x) => x.id === b)?.url : null;
  if (!destino) return naoAchou();

  const cliques = Number(linha.dados.cliques ?? 0) + 1;
  await supabaseAdmin
    .from("auto_execucoes")
    .update({
      dados: {
        ...linha.dados,
        cliques,
        clicou_em: linha.dados.clicou_em ?? new Date().toISOString(),
      },
    })
    .eq("id", linha.id);
  return Response.redirect(destino, 302);
}

export async function aoReceberMensagem(chegada: ChegadaMensagem): Promise<void> {
  const { mensagem: m, ...ctx } = chegada;
  if (m.direcao !== "entrada") return;

  const { data: conversa } = await supabaseAdmin
    .from("conv_conversas")
    .select("automacao_pausada")
    .eq("id", ctx.conversaId)
    .maybeSingle();
  if ((conversa as { automacao_pausada?: boolean } | null)?.automacao_pausada) return;

  // 2. Alguém esperando essa pessoa?
  let viva = await execucaoViva(ctx.conversaId);
  if (viva) {
    const parada = Date.now() - new Date(viva.atualizado_em).getTime() > VALIDADE_ESPERA_MS;
    if (parada) {
      await atualizarExecucao(viva.id, { estado: "expirada", aguardando: null });
      viva = null;
    } else if (viva.estado === "rodando") {
      // Outra mensagem dessa pessoa está sendo processada agora: não começa nada por cima.
      return;
    } else if (m.tipo !== "comentario") {
      // Comentário novo não é resposta de pergunta feita no Direct.
      await responder(ctx, viva, m);
      return;
    }
  }

  const ativas = await automacoesAtivas(ctx.canal);
  const entrada = {
    canal: ctx.canal,
    tipo: m.tipo,
    texto: m.texto,
    mediaId: typeof m.dados.media_id === "string" ? m.dados.media_id : null,
  };

  // "Próxima publicação": o 1º comentário num post publicado depois de salvar fixa o post.
  if (m.tipo === "comentario" && entrada.mediaId) {
    await fixarProximoPost(ativas, entrada.mediaId);
  }

  // 3 e 4. Comentário ou palavra-chave: a primeira automação que casar (mais antiga primeiro).
  const casou = ativas.find(
    (a) => a.gatilho.tipo !== "resposta_padrao" && gatilhoCasa(a.gatilho, entrada),
  );
  if (casou) {
    const comentarioId =
      m.tipo === "comentario" && typeof m.dados.comment_id === "string"
        ? m.dados.comment_id
        : undefined;
    if (
      comentarioId &&
      casou.gatilho.tipo === "comentario" &&
      casou.gatilho.respostas_publicas.length
    ) {
      const opcoes = casou.gatilho.respostas_publicas;
      const resposta = opcoes[Math.floor(Math.random() * opcoes.length)];
      await responderComentarioEmPublico(comentarioId, resposta).catch((e) =>
        console.warn("[automacoes] resposta pública falhou", e),
      );
    }
    // Se a execução viva ainda estava esperando, a nova automação toma o lugar dela.
    if (viva) await atualizarExecucao(viva.id, { estado: "cancelada", aguardando: null });
    await iniciar(ctx, casou, comentarioId ? { comentario_id: comentarioId } : {});
    return;
  }

  // 5. Resposta padrão: só pra mensagem (não comentário), sem execução viva, uma vez a cada 24h.
  if (m.tipo === "comentario" || viva || !["texto", "botao"].includes(m.tipo)) return;
  const padrao = ativas.find((a) => a.gatilho.tipo === "resposta_padrao");
  if (padrao && !(await respostaPadraoRecente(ctx.conversaId, padrao.id))) {
    await iniciar(ctx, padrao, {});
  }
}

// Usado pela caixa de entrada: "Parar automação" e pausar a conversa.
export async function cancelarExecucoesDaConversa(conversaId: string): Promise<void> {
  await supabaseAdmin
    .from("auto_execucoes")
    .update({ estado: "cancelada", aguardando: null, atualizado_em: new Date().toISOString() })
    .eq("conversa_id", conversaId)
    .in("estado", ["rodando", "aguardando"]);
}
