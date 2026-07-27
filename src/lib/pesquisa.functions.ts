import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verificarTurnstileServer } from "@/lib/turnstile.server";
import { pesquisaPorSlug, totalPerguntas, type PesquisaConfig } from "@/lib/pesquisas/registro";
import type { Json } from "@/integrations/supabase/types";

function db() {
  return supabaseAdmin;
}

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

// Recorte mínimo dos campos usados aqui — este app não tem o generic
// Database completo (mesmo padrão pragmático do restante do admin).
interface PesquisaRow {
  id: string;
  slug: string;
  titulo: string;
  subtitulo: string | null;
  ativa: boolean;
  abre_em: string | null;
  fecha_em: string | null;
  criado_em: string;
}

function estaAberta(p: Pick<PesquisaRow, "ativa" | "abre_em" | "fecha_em">): boolean {
  const agora = Date.now();
  if (!p.ativa) return false;
  if (p.abre_em && Date.parse(p.abre_em) > agora) return false;
  if (p.fecha_em && Date.parse(p.fecha_em) < agora) return false;
  return true;
}

// Qual pesquisa está pública agora: a mais recente com ativa=true. Só uma
// fica pública por vez (ver alternarPesquisaAtiva); isso blinda contra um
// estado inconsistente no banco escolhendo a mais recente em vez de estourar.
async function buscarPesquisaAtiva(): Promise<PesquisaRow | null> {
  const { data } = await db()
    .from("pesquisas")
    .select("*")
    .eq("ativa", true)
    .order("criado_em", { ascending: false })
    .limit(1);
  return (data as PesquisaRow[] | null)?.[0] ?? null;
}

// GET: a página pública usa isto pra saber se renderiza o formulário ou uma tela
// de "pesquisa encerrada", pegar título/subtítulo e saber QUAL pesquisa (slug)
// resolver a config no cliente. Não expõe a tabela: lê pelo service role.
export const getPesquisaAberta = createServerFn({ method: "GET" }).handler(async () => {
  const row = await buscarPesquisaAtiva();
  if (!row || !pesquisaPorSlug(row.slug)) {
    return { aberta: false, titulo: "", subtitulo: "", slug: "" };
  }
  return {
    aberta: estaAberta(row),
    titulo: row.titulo,
    subtitulo: row.subtitulo ?? "",
    slug: row.slug,
  };
});

// Limpa as respostas contra a config: só entram perguntas e opções que existem,
// texto aberto é aparado. Blinda contra payload inflado ou forjado.
function sanitizarRespostas(config: PesquisaConfig, brutas: Record<string, unknown>): Json {
  const limpo: Record<string, unknown> = {};
  for (const p of config.perguntas) {
    const v = brutas[p.id];
    if (v === undefined || v === null) continue;

    if (p.tipo === "aberta") {
      if (typeof v === "string" && v.trim()) limpo[p.id] = v.trim().slice(0, 2000);
      continue;
    }

    const idsValidos = new Set((p.opcoes ?? []).map((o) => o.id));

    if (p.tipo === "multipla") {
      if (Array.isArray(v)) {
        const filtrado = Array.from(
          new Set(v.filter((x): x is string => typeof x === "string" && idsValidos.has(x))),
        ).slice(0, p.maxSelecoes ?? 8);
        if (filtrado.length) limpo[p.id] = filtrado;
      }
      continue;
    }

    // unica
    if (typeof v === "string" && idsValidos.has(v)) limpo[p.id] = v;
  }
  return limpo as Json;
}

const salvarSchema = z.object({
  sessaoId: z.string().trim().min(8).max(64),
  progresso: z.number().int().min(0).max(500),
  concluida: z.boolean(),
  respostas: z.record(z.unknown()).default({}),
  turnstileToken: z.string().optional(),
  // Honeypot: campo invisível que só bot preenche. Veio preenchido, fingimos
  // sucesso e não gravamos nada.
  hp: z.string().optional(),
});

// POST: cria/atualiza a resposta da sessão (upsert por sessao_id), sempre na
// pesquisa ativa no momento da chamada.
// - Criar a linha exige Turnstile válido (gate anti-abuso, uma vez por sessão).
// - Atualizações seguintes da MESMA sessão não repetem o Turnstile (o token é de
//   uso único); a linha já existe e é só avançar progresso / mesclar respostas.
// Escrita só aqui, via service role: a RLS não dá insert/update pra anon.
export const salvarPesquisa = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => salvarSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.hp) return { ok: true as const };

    const pesquisa = await buscarPesquisaAtiva();
    const config = pesquisa ? pesquisaPorSlug(pesquisa.slug) : undefined;
    if (!pesquisa || !config) return { ok: false as const, motivo: "nao_encontrada" as const };
    if (!estaAberta(pesquisa)) return { ok: false as const, motivo: "fechada" as const };

    const respostas = sanitizarRespostas(config, data.respostas);

    const { data: existenteData } = await db()
      .from("pesquisa_respostas")
      .select("id, progresso")
      .eq("pesquisa_id", pesquisa.id)
      .eq("sessao_id", data.sessaoId)
      .maybeSingle();

    const existente = existenteData as { id: string; progresso: number } | null;

    if (!existente) {
      // Criar a linha: exige Turnstile válido.
      if (!(await verificarTurnstileServer(data.turnstileToken))) {
        return { ok: false as const, motivo: "turnstile" as const };
      }
      const { error } = await db().from("pesquisa_respostas").insert({
        pesquisa_id: pesquisa.id,
        sessao_id: data.sessaoId,
        progresso: data.progresso,
        concluida: data.concluida,
        respostas,
      });
      if (error) {
        // 23505 = corrida: a linha foi criada entre o select e o insert. Trata
        // como sucesso; o próximo save atualiza.
        if ((error as { code?: string }).code === "23505") return { ok: true as const };
        console.error("[Pesquisa] Falha ao inserir:", error);
        return { ok: false as const, motivo: "erro" as const };
      }
      return { ok: true as const };
    }

    // Atualizar: progresso nunca anda pra trás; respostas vêm completas do cliente.
    // Se vier vazio (ex.: recarregou na intro e o estado do cliente zerou), NÃO
    // apaga o parcial já gravado — só mexe em progresso/concluída.
    const novoProgresso = Math.max(existente.progresso ?? 0, data.progresso);
    const patch: {
      progresso: number;
      concluida: boolean;
      atualizado_em: string;
      respostas?: Json;
    } = {
      progresso: novoProgresso,
      concluida: data.concluida,
      atualizado_em: new Date().toISOString(),
    };
    if (Object.keys(respostas as Record<string, unknown>).length > 0) patch.respostas = respostas;
    const { error } = await db().from("pesquisa_respostas").update(patch).eq("id", existente.id);
    if (error) {
      console.error("[Pesquisa] Falha ao atualizar:", error);
      return { ok: false as const, motivo: "erro" as const };
    }
    return { ok: true as const };
  });

const importarSchema = z.object({
  slug: z.string().trim().min(1),
  linhas: z.array(z.record(z.unknown())).min(1).max(2000),
});

// POST admin-only: importa respostas coletadas fora da pesquisa própria (ex.:
// Google Forms, Typeform) pro mesmo funil de análise, pra UMA pesquisa
// específica (slug). O cliente já mapeou cada coluna do arquivo pra um id de
// pergunta e cada valor pro id da opção (ou texto, se aberta); aqui só valida
// a sessão de admin e reaplica o mesmo sanitizador da pesquisa pública, então
// uma linha malformada não corrompe as agregações. Cada linha vira uma
// resposta concluída, sessão sintética.
export const importarRespostasPesquisa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => importarSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const config = pesquisaPorSlug(data.slug);
    if (!config) return { ok: false as const, motivo: "nao_encontrada" as const, inseridas: 0 };

    const { data: pesquisaData } = await db()
      .from("pesquisas")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    const pesquisa = pesquisaData as Pick<PesquisaRow, "id"> | null;
    if (!pesquisa) return { ok: false as const, motivo: "nao_encontrada" as const, inseridas: 0 };

    const linhas = data.linhas.map((brutas) => ({
      pesquisa_id: pesquisa.id,
      sessao_id: `externo-${crypto.randomUUID()}`,
      progresso: totalPerguntas(config),
      concluida: true,
      respostas: sanitizarRespostas(config, brutas),
    }));

    const { error } = await db().from("pesquisa_respostas").insert(linhas);
    if (error) {
      console.error("[Pesquisa] Falha ao importar:", error);
      return { ok: false as const, motivo: "erro" as const, inseridas: 0 };
    }
    return { ok: true as const, inseridas: linhas.length };
  });

const alternarSchema = z.object({
  slug: z.string().trim().min(1),
  ativa: z.boolean(),
});

// POST admin-only: liga/desliga uma pesquisa. Só uma fica pública por vez —
// ao ativar, desativa todas as outras (a página pública em /pesquisa resolve
// "a ativa" sem slug na URL, então duas ativas ao mesmo tempo seria ambíguo).
export const alternarPesquisaAtiva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alternarSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    if (data.ativa) {
      const { error: erroDesativar } = await db()
        .from("pesquisas")
        .update({ ativa: false })
        .neq("slug", data.slug);
      if (erroDesativar) {
        console.error("[Pesquisa] Falha ao desativar as demais:", erroDesativar);
        return { ok: false as const };
      }
    }

    const { error } = await db()
      .from("pesquisas")
      .update({ ativa: data.ativa })
      .eq("slug", data.slug);
    if (error) {
      console.error("[Pesquisa] Falha ao alternar:", error);
      return { ok: false as const };
    }
    return { ok: true as const };
  });
