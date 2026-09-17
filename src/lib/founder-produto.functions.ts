import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/founder-auth.server";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { dataBRT, periodoSearchSchema, resolverPeriodo, variacaoPct } from "@/lib/founder-periodo";
import type { UsuariaLinha } from "@/components/founder/TabelaUsuarias";

// Produto (seção 5 do direcionamento): ativação, funil de onboarding, tempo
// até o primeiro valor, retorno por coorte, feedback e experimentos. Tudo
// sobre founder_eventos + profiles + feedback_responses/tickets.

const DIA_MS = 86400000;
const STATUS_PAGANTE = ["active", "trialing", "past_due"];
const EVENTOS_VALOR = ["feature_completed", "create_product", "create_goal"];

type Evento = { user_id: string | null; evento: string; feature: string | null; criado_em: string };
type Perfil = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  business_name: string | null;
  plano: string | null;
  created_at: string;
  onboarding_completed: boolean;
  onboarding_completed_at: string | null;
};

async function perfis(): Promise<Perfil[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select(
      "id, full_name, display_name, business_name, plano, created_at, onboarding_completed, onboarding_completed_at",
    )
    .limit(5000);
  return (data ?? []) as Perfil[];
}

async function eventosDesde(ini: string, eventos?: string[]): Promise<Evento[]> {
  let q = supabaseAdmin
    .from("founder_eventos")
    .select("user_id, evento, feature, criado_em")
    .gte("criado_em", ini)
    .not("user_id", "is", null)
    .order("criado_em", { ascending: true })
    .limit(40000);
  if (eventos) q = q.in("evento", eventos);
  const { data } = await q;
  return (data ?? []) as Evento[];
}

async function pagantes(): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("assinaturas")
    .select("user_id, status")
    .in("status", STATUS_PAGANTE);
  return new Set(((data ?? []) as { user_id: string }[]).map((a) => a.user_id));
}

function nomeDe(p: Perfil | undefined): string {
  return p?.display_name || p?.full_name || p?.business_name || "Sem nome";
}

function mediana(v: number[]): number | null {
  if (v.length === 0) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function linhas(
  ids: string[],
  perfisPorId: Map<string, Perfil>,
  pagantesSet: Set<string>,
  ultimo: Map<string, string>,
  dias: Map<string, Set<string>>,
): UsuariaLinha[] {
  return ids
    .map((id) => {
      const p = perfisPorId.get(id);
      return {
        id,
        nome: nomeDe(p),
        plano: p?.plano ?? null,
        pagante: pagantesSet.has(id),
        ultimoAcesso: ultimo.get(id) ?? null,
        diasAtivos: dias.get(id)?.size ?? 0,
        sessoes: 0,
      };
    })
    .sort((a, b) => (b.ultimoAcesso ?? "").localeCompare(a.ultimoAcesso ?? ""));
}

// Ativação = onboarding concluído + primeira ação de valor em até 7 dias
// depois do cadastro. Usa profiles.onboarding_completed_at como fonte do
// onboarding (vale pra contas de antes da instrumentação) e founder_eventos
// pra ação de valor.
function calcularAtivacao(coorte: Perfil[], eventos: Evento[]) {
  const primeiroValor = new Map<string, string>();
  for (const e of eventos) {
    if (!e.user_id || !EVENTOS_VALOR.includes(e.evento)) continue;
    if (!primeiroValor.has(e.user_id)) primeiroValor.set(e.user_id, e.criado_em);
  }
  const ativadas: string[] = [];
  const ttfvS: number[] = [];
  for (const p of coorte) {
    const t0 = Date.parse(p.created_at);
    const valor = primeiroValor.get(p.id);
    if (valor) ttfvS.push((Date.parse(valor) - t0) / 1000);
    const onboardingOk = p.onboarding_completed_at
      ? Date.parse(p.onboarding_completed_at) - t0 <= 7 * DIA_MS
      : p.onboarding_completed;
    if (onboardingOk && valor && Date.parse(valor) - t0 <= 7 * DIA_MS) ativadas.push(p.id);
  }
  return {
    ativadas,
    taxa: coorte.length ? (ativadas.length / coorte.length) * 100 : null,
    ttfvMedianaS: mediana(ttfvS),
    comValor: primeiroValor.size,
  };
}

export const getProdutoAtivacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [todos, pagantesSet, { data: coortesData, error }] = await Promise.all([
      perfis(),
      pagantes(),
      supabaseAdmin.rpc("founder_retencao_coortes", { p_semanas: 12 }),
    ]);
    if (error) throw error;
    const desde = new Date(
      Math.min(Date.parse(p.iniAnterior), Date.now() - 90 * DIA_MS),
    ).toISOString();
    const eventos = await eventosDesde(desde);

    const noPeriodo = todos.filter((x) => x.created_at >= p.ini && x.created_at < p.fim);
    const anterior = todos.filter(
      (x) => x.created_at >= p.iniAnterior && x.created_at < p.fimAnterior,
    );
    const atual = calcularAtivacao(noPeriodo, eventos);
    const ant = calcularAtivacao(anterior, eventos);

    // Coortes semanais das últimas 12 semanas com taxa de ativação cada.
    const semanas = new Map<string, Perfil[]>();
    for (const x of todos) {
      if (Date.parse(x.created_at) < Date.now() - 84 * DIA_MS) continue;
      const semana = dataBRT(Math.floor(Date.parse(x.created_at) / (7 * DIA_MS)) * 7 * DIA_MS);
      if (!semanas.has(semana)) semanas.set(semana, []);
      semanas.get(semana)!.push(x);
    }
    const coortesAtivacao = [...semanas.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([semana, membros]) => {
        const a = calcularAtivacao(membros, eventos);
        return {
          semana,
          tamanho: membros.length,
          ativadas: a.ativadas.length,
          taxa: a.taxa,
          ttfvMedianaS: a.ttfvMedianaS,
        };
      });

    const retencao = (coortesData ?? []) as {
      coorte: string;
      tamanho: number;
      d1: number;
      d7: number;
      d30: number;
    }[];
    const soma = (k: "tamanho" | "d1" | "d7" | "d30") => retencao.reduce((s, c) => s + c[k], 0);
    const total = soma("tamanho");

    const perfisPorId = new Map(todos.map((x) => [x.id, x]));
    const ultimo = new Map<string, string>();
    const dias = new Map<string, Set<string>>();
    for (const e of eventos) {
      if (!e.user_id) continue;
      ultimo.set(e.user_id, e.criado_em);
      if (!dias.has(e.user_id)) dias.set(e.user_id, new Set());
      dias.get(e.user_id)!.add(dataBRT(e.criado_em));
    }
    const naoAtivadas = noPeriodo.filter((x) => !atual.ativadas.includes(x.id)).map((x) => x.id);

    return {
      periodo: p,
      contasNoPeriodo: noPeriodo.length,
      taxaAtivacao: atual.taxa,
      taxaAtivacaoAnterior: ant.taxa,
      ativadas: atual.ativadas.length,
      ttfvMedianaS: atual.ttfvMedianaS,
      comValor: atual.comValor,
      retorno: {
        d1: total ? (soma("d1") / total) * 100 : null,
        d7: total ? (soma("d7") / total) * 100 : null,
        d30: total ? (soma("d30") / total) * 100 : null,
        base: total,
      },
      coortesAtivacao,
      naoAtivadas: linhas(naoAtivadas, perfisPorId, pagantesSet, ultimo, dias),
    };
  });

export const getProdutoFunil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [todos, pagantesSet] = await Promise.all([perfis(), pagantes()]);
    const coorte = todos.filter((x) => x.created_at >= p.ini && x.created_at < p.fim);
    const ids = new Set(coorte.map((x) => x.id));
    const eventos = (await eventosDesde(p.ini)).filter((e) => e.user_id && ids.has(e.user_id));
    const tem = (id: string, evento: string, feature?: string) =>
      eventos.some(
        (e) => e.user_id === id && e.evento === evento && (!feature || e.feature === feature),
      );

    const passos: { rotulo: string; cumpre: (x: Perfil) => boolean }[] = [
      { rotulo: "Criou conta", cumpre: () => true },
      {
        rotulo: "Começou o onboarding",
        cumpre: (x) => tem(x.id, "onboarding_started") || x.onboarding_completed,
      },
      {
        rotulo: "Concluiu o onboarding",
        cumpre: (x) => x.onboarding_completed || tem(x.id, "onboarding_completed"),
      },
      { rotulo: "Cadastrou o primeiro produto", cumpre: (x) => tem(x.id, "create_product") },
      { rotulo: "Primeira ação de valor", cumpre: (x) => tem(x.id, "feature_completed") },
      {
        rotulo: "Voltou depois do 1º dia",
        cumpre: (x) =>
          eventos.some(
            (e) =>
              e.user_id === x.id && Date.parse(e.criado_em) > Date.parse(x.created_at) + DIA_MS,
          ),
      },
    ];

    const perfisPorId = new Map(todos.map((x) => [x.id, x]));
    const ultimo = new Map<string, string>();
    const dias = new Map<string, Set<string>>();
    for (const e of eventos) {
      const id = e.user_id as string;
      ultimo.set(id, e.criado_em);
      if (!dias.has(id)) dias.set(id, new Set());
      dias.get(id)!.add(dataBRT(e.criado_em));
    }

    let restantes = coorte;
    const resultado = passos.map((passo) => {
      const passaram = restantes.filter(passo.cumpre);
      const cairam = restantes.filter((x) => !passaram.includes(x));
      restantes = passaram;
      return {
        rotulo: passo.rotulo,
        total: passaram.length,
        cairam: linhas(
          cairam.map((x) => x.id),
          perfisPorId,
          pagantesSet,
          ultimo,
          dias,
        ),
      };
    });
    return { periodo: p, tamanhoCoorte: coorte.length, passos: resultado };
  });

// ---------- Feedback ----------

export const getProdutoFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [{ data: fb }, { data: fbAnt }, { data: tk }, todos] = await Promise.all([
      supabaseAdmin
        .from("feedback_responses")
        .select("user_id, trigger_type, context_ref, score, comment, created_at")
        .gte("created_at", p.ini)
        .lt("created_at", p.fim)
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("feedback_responses")
        .select("score")
        .gte("created_at", p.iniAnterior)
        .lt("created_at", p.fimAnterior)
        .limit(500),
      supabaseAdmin
        .from("tickets")
        .select("id, user_id, title, status, priority, module_ref, created_at, resolved_at")
        .gte("created_at", new Date(Date.now() - 90 * DIA_MS).toISOString())
        .order("created_at", { ascending: false })
        .limit(300),
      perfis(),
    ]);
    const perfisPorId = new Map(todos.map((x) => [x.id, x]));
    const feedbacks = (fb ?? []) as {
      user_id: string | null;
      trigger_type: string;
      context_ref: string | null;
      score: number;
      comment: string | null;
      created_at: string;
    }[];
    const anteriores = (fbAnt ?? []) as { score: number }[];
    const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
    const porGatilho = new Map<string, number[]>();
    for (const f of feedbacks) {
      if (!porGatilho.has(f.trigger_type)) porGatilho.set(f.trigger_type, []);
      porGatilho.get(f.trigger_type)!.push(f.score);
    }
    const distribuicao = [1, 2, 3].map((s) => ({
      score: s,
      total: feedbacks.filter((f) => f.score === s).length,
    }));

    const tickets = (tk ?? []) as {
      id: string;
      user_id: string;
      title: string;
      status: string;
      priority: string | null;
      module_ref: string | null;
      created_at: string;
      resolved_at: string | null;
    }[];
    const noPeriodo = tickets.filter((t) => t.created_at >= p.ini && t.created_at < p.fim);
    const resolvidos = tickets.filter((t) => t.resolved_at);
    const tempoResolucaoS = resolvidos.map(
      (t) => (Date.parse(t.resolved_at as string) - Date.parse(t.created_at)) / 1000,
    );

    return {
      periodo: p,
      totalFeedbacks: feedbacks.length,
      mediaScore: media(feedbacks.map((f) => f.score)),
      mediaScoreVariacao: variacaoPct(
        media(feedbacks.map((f) => f.score)) ?? 0,
        media(anteriores.map((f) => f.score)) ?? 0,
      ),
      distribuicao,
      porGatilho: [...porGatilho.entries()].map(([gatilho, scores]) => ({
        gatilho,
        total: scores.length,
        media: media(scores),
      })),
      comentarios: feedbacks
        .filter((f) => f.comment && f.comment.trim())
        .slice(0, 50)
        .map((f) => ({
          quando: f.created_at,
          usuaria: nomeDe(f.user_id ? perfisPorId.get(f.user_id) : undefined),
          userId: f.user_id,
          gatilho: f.trigger_type,
          score: f.score,
          comentario: f.comment as string,
        })),
      chamados: {
        abertos: tickets.filter(
          (t) => t.status !== "resolvido" && t.status !== "fechado" && !t.resolved_at,
        ).length,
        noPeriodo: noPeriodo.length,
        resolvidos90d: resolvidos.length,
        tempoMedioResolucaoS: media(tempoResolucaoS),
        recentes: tickets.slice(0, 20).map((t) => ({
          id: t.id,
          titulo: t.title,
          status: t.status,
          prioridade: t.priority,
          modulo: t.module_ref,
          usuaria: nomeDe(perfisPorId.get(t.user_id)),
          quando: t.created_at,
        })),
      },
    };
  });

// ---------- Experimentos ----------

export interface Experimento {
  id: string;
  nome: string;
  hipotese: string | null;
  flagKey: string;
  metricaEvento: string;
  metricaFeature: string | null;
  inicio: string;
  fim: string | null;
  status: "ativo" | "pausado" | "concluido";
  resultado: string | null;
}

type ExperimentoDb = {
  id: string;
  nome: string;
  hipotese: string | null;
  flag_key: string;
  metrica_evento: string;
  metrica_feature: string | null;
  inicio: string;
  fim: string | null;
  status: "ativo" | "pausado" | "concluido";
  resultado: string | null;
};

function mapearExp(e: ExperimentoDb): Experimento {
  return {
    id: e.id,
    nome: e.nome,
    hipotese: e.hipotese,
    flagKey: e.flag_key,
    metricaEvento: e.metrica_evento,
    metricaFeature: e.metrica_feature,
    inicio: e.inicio,
    fim: e.fim,
    status: e.status,
    resultado: e.resultado,
  };
}

async function bucket(userId: string, key: string): Promise<number> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${userId}:${key}`),
  );
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return parseInt(hex.slice(0, 8), 16) % 100;
}

export const getProdutoExperimentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ data: expData }, { data: flagsData }, todos] = await Promise.all([
      supabaseAdmin
        .from("founder_experimentos")
        .select("*")
        .order("criado_em", { ascending: false }),
      supabaseAdmin
        .from("founder_flags")
        .select("key, estado, rollout_pct, beta_user_ids")
        .eq("ambiente", "prod"),
      perfis(),
    ]);
    const experimentos = ((expData ?? []) as ExperimentoDb[]).map(mapearExp);
    const flags = new Map(
      (
        (flagsData ?? []) as {
          key: string;
          estado: string;
          rollout_pct: number;
          beta_user_ids: string[];
        }[]
      ).map((f) => [f.key, f]),
    );
    const inicioMaisAntigo = experimentos.reduce(
      (min, e) => (e.inicio < min ? e.inicio : min),
      new Date().toISOString(),
    );
    const eventos = experimentos.length ? await eventosDesde(inicioMaisAntigo) : [];

    const resultados = [];
    for (const exp of experimentos) {
      const flag = flags.get(exp.flagKey);
      const fim = exp.fim ?? new Date().toISOString();
      const expostas = new Set(
        eventos
          .filter((e) => e.criado_em >= exp.inicio && e.criado_em < fim)
          .map((e) => e.user_id as string),
      );
      const converteu = new Set(
        eventos
          .filter(
            (e) =>
              e.criado_em >= exp.inicio &&
              e.criado_em < fim &&
              e.evento === exp.metricaEvento &&
              (!exp.metricaFeature || e.feature === exp.metricaFeature),
          )
          .map((e) => e.user_id as string),
      );
      let comTotal = 0;
      let comConv = 0;
      let semTotal = 0;
      let semConv = 0;
      for (const id of expostas) {
        let dentro = false;
        if (flag) {
          if (flag.estado === "off") dentro = false;
          else if (flag.estado === "beta" && flag.beta_user_ids.includes(id)) dentro = true;
          else if (flag.rollout_pct >= 100 && flag.estado === "on") dentro = true;
          else dentro = (await bucket(id, exp.flagKey)) < flag.rollout_pct;
        }
        if (dentro) {
          comTotal++;
          if (converteu.has(id)) comConv++;
        } else {
          semTotal++;
          if (converteu.has(id)) semConv++;
        }
      }
      resultados.push({
        ...exp,
        flagExiste: Boolean(flag),
        flagEstado: flag?.estado ?? null,
        flagRollout: flag?.rollout_pct ?? null,
        com: {
          total: comTotal,
          converteram: comConv,
          taxa: comTotal ? (comConv / comTotal) * 100 : null,
        },
        sem: {
          total: semTotal,
          converteram: semConv,
          taxa: semTotal ? (semConv / semTotal) * 100 : null,
        },
      });
    }
    return {
      experimentos: resultados,
      totalUsuarias: todos.length,
      flagsDisponiveis: [...flags.keys()],
    };
  });

const experimentoInput = z.object({
  nome: z.string().min(2).max(120),
  hipotese: z.string().max(1000).optional(),
  flagKey: z.string().min(1).max(80),
  metricaEvento: z.string().min(1).max(60),
  metricaFeature: z.string().max(60).optional(),
});

export const criarExperimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => experimentoInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("founder_experimentos").insert({
      nome: data.nome,
      hipotese: data.hipotese ?? null,
      flag_key: data.flagKey,
      metrica_evento: data.metricaEvento,
      metrica_feature: data.metricaFeature || null,
      criado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    await logAcaoAdminServer(context.userId, "criar_founder_experimento", data.nome, {
      flag: data.flagKey,
    });
    return { ok: true as const };
  });

const statusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["ativo", "pausado", "concluido"]),
  resultado: z.string().max(2000).optional(),
});

export const alterarStatusExperimento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = { status: data.status };
    if (data.status === "concluido") patch.fim = new Date().toISOString();
    if (data.resultado !== undefined) patch.resultado = data.resultado;
    const { error } = await supabaseAdmin
      .from("founder_experimentos")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAcaoAdminServer(context.userId, "alterar_founder_experimento", data.id, {
      status: data.status,
    });
    return { ok: true as const };
  });
