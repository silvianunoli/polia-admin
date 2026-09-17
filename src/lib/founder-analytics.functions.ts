import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/founder-auth.server";
import {
  dataBRT,
  periodoSearchSchema,
  resolverPeriodo,
  variacaoPct,
  type PeriodoResolvido,
} from "@/lib/founder-periodo";
import type { UsuariaLinha } from "@/components/founder/TabelaUsuarias";

// Analytics de uso do Founder Dashboard (seção 4 do direcionamento), tudo
// sobre founder_eventos + as funções SQL de agregação (founder_sessoes_calc,
// founder_tempo_por_feature, founder_heatmap, founder_retencao_coortes).
// "Ativa" = ação real (nunca feature_opened/heartbeat). Datas em BRT.

export const EVENTOS_ATIVOS = [
  "feature_completed",
  "create_product",
  "edit_product",
  "create_goal",
  "edit_goal",
  "onboarding_completed",
  "business_created",
];
const STATUS_PAGANTE = ["active", "trialing", "past_due"];
const DIA_MS = 86400000;

type EventoLinha = {
  user_id: string | null;
  sessao_id: string;
  evento: string;
  feature: string | null;
  pagina: string | null;
  criado_em: string;
  propriedades: Record<string, unknown> | null;
};

type SessaoLinha = {
  sessao_id: string;
  user_id: string | null;
  inicio: string;
  fim: string;
  duracao_s: number;
  telas: number;
  eventos_ativos: number;
};

type PerfilLinha = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  business_name: string | null;
  plano: string | null;
  created_at: string;
  onboarding_completed: boolean;
};

async function eventosNoPeriodo(
  ini: string,
  fim: string,
  eventos?: string[],
  limite = 20000,
): Promise<EventoLinha[]> {
  let q = supabaseAdmin
    .from("founder_eventos")
    .select("user_id, sessao_id, evento, feature, pagina, criado_em, propriedades")
    .gte("criado_em", ini)
    .lt("criado_em", fim)
    .eq("origem", "client")
    .order("criado_em", { ascending: true })
    .limit(limite);
  if (eventos) q = q.in("evento", eventos);
  const { data } = await q;
  return (data ?? []) as EventoLinha[];
}

async function sessoesNoPeriodo(ini: string, fim: string): Promise<SessaoLinha[]> {
  const { data, error } = await supabaseAdmin.rpc("founder_sessoes_calc", {
    p_ini: ini,
    p_fim: fim,
  });
  if (error) throw error;
  return (data ?? []) as SessaoLinha[];
}

async function perfis(): Promise<PerfilLinha[]> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, display_name, business_name, plano, created_at, onboarding_completed")
    .limit(5000);
  return (data ?? []) as PerfilLinha[];
}

async function pagantes(): Promise<Set<string>> {
  const { data } = await supabaseAdmin
    .from("assinaturas")
    .select("user_id, status")
    .in("status", STATUS_PAGANTE);
  return new Set(((data ?? []) as { user_id: string }[]).map((a) => a.user_id));
}

function nomeDe(p: PerfilLinha | undefined): string {
  return p?.display_name || p?.full_name || p?.business_name || "Sem nome";
}

function usuariasAtivas(eventos: EventoLinha[]): Set<string> {
  const s = new Set<string>();
  for (const e of eventos) if (e.user_id && EVENTOS_ATIVOS.includes(e.evento)) s.add(e.user_id);
  return s;
}

function diasAtivosPorUsuaria(eventos: EventoLinha[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const e of eventos) {
    if (!e.user_id || !EVENTOS_ATIVOS.includes(e.evento)) continue;
    if (!m.has(e.user_id)) m.set(e.user_id, new Set());
    m.get(e.user_id)!.add(dataBRT(e.criado_em));
  }
  return m;
}

function montarLinhas(
  ids: Iterable<string>,
  perfisPorId: Map<string, PerfilLinha>,
  pagantesSet: Set<string>,
  ultimoAcesso: Map<string, string>,
  diasAtivos: Map<string, Set<string>>,
  sessoesPorUsuaria: Map<string, number>,
): UsuariaLinha[] {
  const linhas: UsuariaLinha[] = [];
  for (const id of ids) {
    const p = perfisPorId.get(id);
    linhas.push({
      id,
      nome: nomeDe(p),
      plano: p?.plano ?? null,
      pagante: pagantesSet.has(id),
      ultimoAcesso: ultimoAcesso.get(id) ?? null,
      diasAtivos: diasAtivos.get(id)?.size ?? 0,
      sessoes: sessoesPorUsuaria.get(id) ?? 0,
    });
  }
  return linhas.sort((a, b) => (b.ultimoAcesso ?? "").localeCompare(a.ultimoAcesso ?? ""));
}

function serieDiaria(
  p: PeriodoResolvido,
  contar: (dia: string) => number,
): { dia: string; valor: number }[] {
  const pontos: { dia: string; valor: number }[] = [];
  const iniMs = Date.parse(p.ini);
  const fimMs = Date.parse(p.fim);
  for (let t = iniMs; t < fimMs + DIA_MS; t += DIA_MS) {
    const dia = dataBRT(t);
    if (pontos.length && pontos[pontos.length - 1].dia === dia) continue;
    if (dia > dataBRT(fimMs)) break;
    pontos.push({ dia, valor: contar(dia) });
  }
  return pontos;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

// ---------- Visão geral ----------

export const getAnalyticsVisaoGeral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const agora = Date.now();
    const hojeIni = new Date(Date.parse(`${dataBRT(agora)}T03:00:00.000Z`)).toISOString();
    const dia1 = new Date(agora - DIA_MS).toISOString();
    const dia7 = new Date(agora - 7 * DIA_MS).toISOString();
    const dia30 = new Date(agora - 30 * DIA_MS).toISOString();
    const dia60 = new Date(agora - 60 * DIA_MS).toISOString();
    const agoraIso = new Date(agora).toISOString();

    const [todos, { count: totalUsuarias }, novasAtual, novasAnterior, sessoes, sessoesAnt] =
      await Promise.all([
        eventosNoPeriodo(dia60, agoraIso, undefined, 40000),
        supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" }),
        supabaseAdmin
          .from("profiles")
          .select("id", { head: true, count: "exact" })
          .gte("created_at", p.ini)
          .lt("created_at", p.fim),
        supabaseAdmin
          .from("profiles")
          .select("id", { head: true, count: "exact" })
          .gte("created_at", p.iniAnterior)
          .lt("created_at", p.fimAnterior),
        sessoesNoPeriodo(p.ini, p.fim),
        sessoesNoPeriodo(p.iniAnterior, p.fimAnterior),
      ]);

    const ativosEm = (desde: string, ate: string) =>
      usuariasAtivas(todos.filter((e) => e.criado_em >= desde && e.criado_em < ate)).size;
    const acessaramHoje = new Set(
      todos.filter((e) => e.criado_em >= hojeIni && e.user_id).map((e) => e.user_id),
    ).size;
    const dau = ativosEm(dia1, agoraIso);
    const wau = ativosEm(dia7, agoraIso);
    const mau = ativosEm(dia30, agoraIso);
    const dauAnterior = ativosEm(new Date(agora - 2 * DIA_MS).toISOString(), dia1);
    const wauAnterior = ativosEm(new Date(agora - 14 * DIA_MS).toISOString(), dia7);
    const mauAnterior = ativosEm(dia60, dia30);
    const ativasPeriodo = ativosEm(p.ini, p.fim);
    const ativasPeriodoAnterior = ativosEm(p.iniAnterior, p.fimAnterior);

    const eventosPeriodo = todos.filter((e) => e.criado_em >= p.ini && e.criado_em < p.fim);
    const ativasPorDia = new Map<string, Set<string>>();
    for (const e of eventosPeriodo) {
      if (!e.user_id || !EVENTOS_ATIVOS.includes(e.evento)) continue;
      const d = dataBRT(e.criado_em);
      if (!ativasPorDia.has(d)) ativasPorDia.set(d, new Set());
      ativasPorDia.get(d)!.add(e.user_id);
    }
    const sessoesPorDia = new Map<string, number>();
    for (const s of sessoes) {
      const d = dataBRT(s.inicio);
      sessoesPorDia.set(d, (sessoesPorDia.get(d) ?? 0) + 1);
    }

    return {
      periodo: p,
      totalUsuarias: totalUsuarias ?? 0,
      acessaramHoje,
      dau,
      wau,
      mau,
      dauAnterior,
      wauAnterior,
      mauAnterior,
      dauSobreMau: mau > 0 ? (dau / mau) * 100 : null,
      wauSobreMau: mau > 0 ? (wau / mau) * 100 : null,
      novasContas: novasAtual.count ?? 0,
      novasContasVariacao: variacaoPct(novasAtual.count ?? 0, novasAnterior.count ?? 0),
      ativasPeriodo,
      ativasPeriodoVariacao: variacaoPct(ativasPeriodo, ativasPeriodoAnterior),
      sessoesPeriodo: sessoes.length,
      sessoesVariacao: variacaoPct(sessoes.length, sessoesAnt.length),
      serieAtivas: serieDiaria(p, (dia) => ativasPorDia.get(dia)?.size ?? 0),
      serieSessoes: serieDiaria(p, (dia) => sessoesPorDia.get(dia) ?? 0),
      temEventos: todos.length > 0,
    };
  });

// ---------- Usuárias ----------

export const getAnalyticsUsuarias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [todosPerfis, pagantesSet, eventos, sessoes] = await Promise.all([
      perfis(),
      pagantes(),
      eventosNoPeriodo(p.ini, p.fim, undefined, 40000),
      sessoesNoPeriodo(p.ini, p.fim),
    ]);
    const perfisPorId = new Map(todosPerfis.map((x) => [x.id, x]));
    const ultimoAcesso = new Map<string, string>();
    for (const e of eventos) {
      if (!e.user_id) continue;
      const atual = ultimoAcesso.get(e.user_id);
      if (!atual || e.criado_em > atual) ultimoAcesso.set(e.user_id, e.criado_em);
    }
    const diasAtivos = diasAtivosPorUsuaria(eventos);
    const sessoesPorUsuaria = new Map<string, number>();
    for (const s of sessoes) {
      if (!s.user_id) continue;
      sessoesPorUsuaria.set(s.user_id, (sessoesPorUsuaria.get(s.user_id) ?? 0) + 1);
    }
    const linhas = montarLinhas(
      todosPerfis.map((x) => x.id),
      perfisPorId,
      pagantesSet,
      ultimoAcesso,
      diasAtivos,
      sessoesPorUsuaria,
    );
    return {
      periodo: p,
      usuarias: linhas,
      comAtividade: linhas.filter((l) => l.ultimoAcesso).length,
      semAtividade: linhas.filter((l) => !l.ultimoAcesso).length,
    };
  });

// ---------- Perfil individual ----------

const idInput = z.object({ id: z.string().uuid() });

export const getAnalyticsUsuaria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const agora = Date.now();
    const dia30 = new Date(agora - 30 * DIA_MS).toISOString();
    const agoraIso = new Date(agora).toISOString();

    const [
      { data: perfil },
      { data: assinatura },
      { data: eventosData },
      sessoes30,
      { data: erros },
      { data: ia },
    ] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select(
          "id, full_name, display_name, business_name, plano, created_at, onboarding_completed, onboarding_completed_at",
        )
        .eq("id", data.id)
        .maybeSingle(),
      supabaseAdmin
        .from("assinaturas")
        .select("status, price_id, current_period_end, cancel_at_period_end, created_at")
        .eq("user_id", data.id)
        .maybeSingle(),
      supabaseAdmin
        .from("founder_eventos")
        .select("user_id, sessao_id, evento, feature, pagina, criado_em, propriedades")
        .eq("user_id", data.id)
        .order("criado_em", { ascending: false })
        .limit(400),
      sessoesNoPeriodo(dia30, agoraIso),
      supabaseAdmin
        .from("erros_app")
        .select("mensagem, pagina, origem, criado_em")
        .eq("user_id", data.id)
        .order("criado_em", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("ia_geracoes")
        .select("feature, modelo, sucesso, criado_em")
        .eq("user_id", data.id)
        .order("criado_em", { ascending: false })
        .limit(30),
    ]);

    if (!perfil) return { encontrada: false as const };

    const eventos = (eventosData ?? []) as EventoLinha[];
    const eventosAtivos = eventos.filter((e) => EVENTOS_ATIVOS.includes(e.evento));
    const diasAtivos = new Set(eventosAtivos.map((e) => dataBRT(e.criado_em)));
    const ultimoAcesso = eventos[0]?.criado_em ?? null;
    const primeiroValor = [...eventos]
      .reverse()
      .find((e) => e.evento === "feature_completed")?.criado_em;
    const minhasSessoes = sessoes30.filter((s) => s.user_id === data.id);
    const tempoTotal30 = minhasSessoes.reduce((s, x) => s + x.duracao_s, 0);

    const featuresUsadas = new Map<string, number>();
    for (const e of eventos)
      if (e.feature) featuresUsadas.set(e.feature, (featuresUsadas.get(e.feature) ?? 0) + 1);

    type ItemTimeline = { quando: string; tipo: string; titulo: string; detalhe: string | null };
    const timeline: ItemTimeline[] = [
      ...eventos
        .filter((e) => e.evento !== "heartbeat")
        .map((e) => ({
          quando: e.criado_em,
          tipo: "evento",
          titulo: e.evento,
          detalhe: [e.feature, e.pagina].filter(Boolean).join(" · ") || null,
        })),
      ...(
        (erros ?? []) as {
          mensagem: string;
          pagina: string | null;
          origem: string;
          criado_em: string;
        }[]
      ).map((x) => ({
        quando: x.criado_em,
        tipo: "erro",
        titulo: `erro (${x.origem})`,
        detalhe: `${x.pagina ?? ""} ${x.mensagem.slice(0, 120)}`.trim(),
      })),
      ...(
        (ia ?? []) as { feature: string; modelo: string; sucesso: boolean; criado_em: string }[]
      ).map((x) => ({
        quando: x.criado_em,
        tipo: "ia",
        titulo: `ia ${x.sucesso ? "ok" : "falhou"}`,
        detalhe: `${x.feature} · ${x.modelo}`,
      })),
    ]
      .sort((a, b) => b.quando.localeCompare(a.quando))
      .slice(0, 150);

    const pf = perfil as PerfilLinha & { onboarding_completed_at: string | null };
    return {
      encontrada: true as const,
      perfil: {
        id: pf.id,
        nome: nomeDe(pf),
        negocio: pf.business_name,
        plano: pf.plano,
        criadaEm: pf.created_at,
        onboardingConcluido: pf.onboarding_completed,
        onboardingEm: pf.onboarding_completed_at,
      },
      assinatura:
        (assinatura as {
          status: string;
          price_id: string;
          current_period_end: string | null;
          cancel_at_period_end: boolean;
          created_at: string;
        } | null) ?? null,
      ultimoAcesso,
      diasAtivos: diasAtivos.size,
      sessoes30: minhasSessoes.length,
      tempoTotal30s: tempoTotal30,
      tempoAtePrimeiroValorS: primeiroValor
        ? Math.round((Date.parse(primeiroValor) - Date.parse(pf.created_at)) / 1000)
        : null,
      featuresUsadas: [...featuresUsadas.entries()]
        .map(([feature, n]) => ({ feature, eventos: n }))
        .sort((a, b) => b.eventos - a.eventos),
      timeline,
      totalEventos: eventos.length,
    };
  });

// ---------- Sessões ----------

export const getAnalyticsSessoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [sessoes, sessoesAnt] = await Promise.all([
      sessoesNoPeriodo(p.ini, p.fim),
      sessoesNoPeriodo(p.iniAnterior, p.fimAnterior),
    ]);
    const comUsuaria = sessoes.filter((s) => s.user_id);
    const usuarias = new Set(comUsuaria.map((s) => s.user_id as string));
    const duracoes = sessoes.map((s) => s.duracao_s);
    const porUsuaria = new Map<string, SessaoLinha[]>();
    for (const s of comUsuaria) {
      const id = s.user_id as string;
      if (!porUsuaria.has(id)) porUsuaria.set(id, []);
      porUsuaria.get(id)!.push(s);
    }
    let voltaramMesmoDia = 0;
    let voltaramEm7Dias = 0;
    for (const lista of porUsuaria.values()) {
      const ordenada = [...lista].sort((a, b) => a.inicio.localeCompare(b.inicio));
      const dias = new Map<string, number>();
      for (const s of ordenada) {
        const d = dataBRT(s.inicio);
        dias.set(d, (dias.get(d) ?? 0) + 1);
      }
      if ([...dias.values()].some((n) => n >= 2)) voltaramMesmoDia++;
      const primeira = Date.parse(ordenada[0].inicio);
      if (
        ordenada.some((s) => {
          const t = Date.parse(s.inicio);
          return t > primeira && t <= primeira + 7 * DIA_MS;
        })
      ) {
        voltaramEm7Dias++;
      }
    }
    const sessoesPorDia = new Map<string, number>();
    for (const s of sessoes) {
      const d = dataBRT(s.inicio);
      sessoesPorDia.set(d, (sessoesPorDia.get(d) ?? 0) + 1);
    }
    const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

    return {
      periodo: p,
      total: sessoes.length,
      totalVariacao: variacaoPct(sessoes.length, sessoesAnt.length),
      usuarias: usuarias.size,
      porUsuaria: usuarias.size ? comUsuaria.length / usuarias.size : null,
      duracaoMediaS: media(duracoes),
      duracaoMedianaS: mediana(duracoes),
      telasPorSessao: media(sessoes.map((s) => s.telas)),
      voltaramMesmoDia,
      voltaramEm7Dias,
      serie: serieDiaria(p, (dia) => sessoesPorDia.get(dia) ?? 0),
    };
  });

// ---------- Retenção ----------

export const getAnalyticsRetencao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.rpc("founder_retencao_coortes", { p_semanas: 12 });
    if (error) throw error;
    const coortes = (data ?? []) as {
      coorte: string;
      tamanho: number;
      d1: number;
      d7: number;
      d30: number;
      ate_d7: number;
    }[];
    const soma = (k: "tamanho" | "d1" | "d7" | "d30" | "ate_d7") =>
      coortes.reduce((s, c) => s + c[k], 0);
    const total = soma("tamanho");
    return {
      coortes,
      geral: {
        tamanho: total,
        d1Pct: total ? (soma("d1") / total) * 100 : null,
        d7Pct: total ? (soma("d7") / total) * 100 : null,
        d30Pct: total ? (soma("d30") / total) * 100 : null,
        ateD7Pct: total ? (soma("ate_d7") / total) * 100 : null,
      },
    };
  });

// ---------- Comportamento (heatmap) ----------

export const getAnalyticsComportamento = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const { data: celulas, error } = await supabaseAdmin.rpc("founder_heatmap", {
      p_ini: p.ini,
      p_fim: p.fim,
    });
    if (error) throw error;
    const linhas = (celulas ?? []) as {
      dow: number;
      hora: number;
      eventos: number;
      usuarias: number;
    }[];
    const porHora = new Map<number, number>();
    const porDia = new Map<number, number>();
    for (const c of linhas) {
      porHora.set(c.hora, (porHora.get(c.hora) ?? 0) + c.eventos);
      porDia.set(c.dow, (porDia.get(c.dow) ?? 0) + c.eventos);
    }
    const pico = (m: Map<number, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      periodo: p,
      celulas: linhas.map((c) => ({ dow: c.dow, hora: c.hora, valor: c.eventos })),
      totalEventos: linhas.reduce((s, c) => s + c.eventos, 0),
      horaPico: pico(porHora),
      diaPico: pico(porDia),
    };
  });

// ---------- Funcionalidades ----------

const funcionalidadesInput = periodoSearchSchema.extend({
  limiarPct: z.number().min(0).max(100).default(10),
});

export const getAnalyticsFuncionalidades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => funcionalidadesInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [{ data: uso, error }, { data: catalogo }, eventos] = await Promise.all([
      supabaseAdmin.rpc("founder_tempo_por_feature", { p_ini: p.ini, p_fim: p.fim }),
      supabaseAdmin.from("founder_features").select("key, nome, grupo, ativa").eq("ativa", true),
      eventosNoPeriodo(p.ini, p.fim, EVENTOS_ATIVOS),
    ]);
    if (error) throw error;
    const linhas = (uso ?? []) as {
      feature: string;
      usuarias: number;
      acessos: number;
      concluidos: number;
      tempo_s: number;
    }[];
    const nomes = new Map(
      ((catalogo ?? []) as { key: string; nome: string; grupo: string }[]).map((c) => [c.key, c]),
    );
    const ativas = usuariasAtivas(eventos).size;
    const porFeature = new Map(linhas.map((l) => [l.feature, l]));
    const features = linhas.map((l) => ({
      feature: l.feature,
      nome: nomes.get(l.feature)?.nome ?? l.feature,
      usuarias: l.usuarias,
      acessos: l.acessos,
      concluidos: l.concluidos,
      tempoS: Number(l.tempo_s),
      pctDasAtivas: ativas ? (l.usuarias / ativas) * 100 : null,
    }));
    const quaseSemUso = [...nomes.values()]
      .map((c) => {
        const l = porFeature.get(c.key);
        const usuarias = l?.usuarias ?? 0;
        return {
          feature: c.key,
          nome: c.nome,
          usuarias,
          pctDasAtivas: ativas ? (usuarias / ativas) * 100 : null,
        };
      })
      .filter((f) => ativas === 0 || (f.pctDasAtivas ?? 0) < data.limiarPct)
      .sort((a, b) => a.usuarias - b.usuarias);
    return { periodo: p, usuariasAtivas: ativas, features, quaseSemUso, limiarPct: data.limiarPct };
  });

// ---------- Jornadas (funil configurável) ----------

type PassoConfig = {
  rotulo: string;
  tipo: "conta" | "evento" | "voltou_7d" | "recorrente";
  evento?: string;
};

export const getAnalyticsJornadas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const agoraIso = new Date().toISOString();
    const [{ data: config }, todosPerfis, pagantesSet] = await Promise.all([
      supabaseAdmin
        .from("founder_funil_config")
        .select("nome, passos")
        .eq("ativo", true)
        .order("atualizado_em", { ascending: false })
        .limit(1)
        .maybeSingle(),
      perfis(),
      pagantes(),
    ]);
    const passos = ((config as { nome: string; passos: PassoConfig[] } | null)?.passos ??
      []) as PassoConfig[];

    // Coorte = quem criou conta no período; os eventos dela podem vir depois.
    const coorte = todosPerfis.filter((x) => x.created_at >= p.ini && x.created_at < p.fim);
    const ids = new Set(coorte.map((x) => x.id));
    const [eventos, sessoes] = await Promise.all([
      eventosNoPeriodo(p.ini, agoraIso, undefined, 40000),
      sessoesNoPeriodo(p.ini, agoraIso),
    ]);
    const eventosDaCoorte = eventos.filter((e) => e.user_id && ids.has(e.user_id));
    const sessoesDaCoorte = sessoes.filter((s) => s.user_id && ids.has(s.user_id));
    const criadaEm = new Map(coorte.map((x) => [x.id, Date.parse(x.created_at)]));

    const cumpre = (passo: PassoConfig, id: string): boolean => {
      if (passo.tipo === "conta") return true;
      if (passo.tipo === "evento") {
        return eventosDaCoorte.some((e) => e.user_id === id && e.evento === passo.evento);
      }
      const t0 = criadaEm.get(id) ?? 0;
      if (passo.tipo === "voltou_7d") {
        return sessoesDaCoorte.some((s) => {
          const t = Date.parse(s.inicio);
          return s.user_id === id && t >= t0 + DIA_MS && t < t0 + 8 * DIA_MS;
        });
      }
      // recorrente: 3+ semanas distintas com ação real
      const semanas = new Set(
        eventosDaCoorte
          .filter((e) => e.user_id === id && EVENTOS_ATIVOS.includes(e.evento))
          .map((e) => Math.floor((Date.parse(e.criado_em) - t0) / (7 * DIA_MS))),
      );
      return semanas.size >= 3;
    };

    const perfisPorId = new Map(todosPerfis.map((x) => [x.id, x]));
    const ultimoAcesso = new Map<string, string>();
    for (const e of eventosDaCoorte) {
      const atual = ultimoAcesso.get(e.user_id as string);
      if (!atual || e.criado_em > atual) ultimoAcesso.set(e.user_id as string, e.criado_em);
    }
    const diasAtivos = diasAtivosPorUsuaria(eventosDaCoorte);
    const sessoesPorUsuaria = new Map<string, number>();
    for (const s of sessoesDaCoorte) {
      const id = s.user_id as string;
      sessoesPorUsuaria.set(id, (sessoesPorUsuaria.get(id) ?? 0) + 1);
    }

    let restantes = [...ids];
    const resultado = passos.map((passo) => {
      const passaram = restantes.filter((id) => cumpre(passo, id));
      const cairam = restantes.filter((id) => !passaram.includes(id));
      restantes = passaram;
      return {
        rotulo: passo.rotulo,
        total: passaram.length,
        cairam: montarLinhas(
          cairam,
          perfisPorId,
          pagantesSet,
          ultimoAcesso,
          diasAtivos,
          sessoesPorUsuaria,
        ),
      };
    });

    return {
      periodo: p,
      nomeFunil: (config as { nome: string } | null)?.nome ?? "Padrão",
      passos: resultado,
      tamanhoCoorte: ids.size,
    };
  });

// ---------- Segmentos + uso x assinatura ----------

export const getAnalyticsSegmentos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const agora = Date.now();
    const agoraIso = new Date(agora).toISOString();
    const dia7 = new Date(agora - 7 * DIA_MS).toISOString();
    const dia14 = new Date(agora - 14 * DIA_MS).toISOString();
    const dia30 = new Date(agora - 30 * DIA_MS).toISOString();
    const dia90 = new Date(agora - 90 * DIA_MS).toISOString();

    const [todosPerfis, pagantesSet, eventos90, sessoes90] = await Promise.all([
      perfis(),
      pagantes(),
      eventosNoPeriodo(dia90, agoraIso, EVENTOS_ATIVOS, 40000),
      sessoesNoPeriodo(dia90, agoraIso),
    ]);
    const perfisPorId = new Map(todosPerfis.map((x) => [x.id, x]));
    const ultimoAcesso = new Map<string, string>();
    for (const s of sessoes90) {
      if (!s.user_id) continue;
      const atual = ultimoAcesso.get(s.user_id);
      if (!atual || s.fim > atual) ultimoAcesso.set(s.user_id, s.fim);
    }
    const sessoesPorUsuaria = new Map<string, number>();
    const ultimaSessao = new Map<string, string>();
    const semanasComSessao = new Map<string, Set<number>>();
    for (const s of sessoes90) {
      if (!s.user_id) continue;
      if (s.inicio >= p.ini && s.inicio < p.fim) {
        sessoesPorUsuaria.set(s.user_id, (sessoesPorUsuaria.get(s.user_id) ?? 0) + 1);
      }
      const u = ultimaSessao.get(s.user_id);
      if (!u || s.inicio > u) ultimaSessao.set(s.user_id, s.inicio);
      const semana = Math.floor((agora - Date.parse(s.inicio)) / (7 * DIA_MS));
      if (!semanasComSessao.has(s.user_id)) semanasComSessao.set(s.user_id, new Set());
      semanasComSessao.get(s.user_id)!.add(semana);
    }
    const diasAtivos30 = diasAtivosPorUsuaria(eventos90.filter((e) => e.criado_em >= dia30));
    const diasAtivosPeriodo = diasAtivosPorUsuaria(
      eventos90.filter((e) => e.criado_em >= p.ini && e.criado_em < p.fim),
    );
    const diasAtivosSemana = (id: string, semanaIdx: number) =>
      new Set(
        eventos90
          .filter((e) => {
            if (e.user_id !== id) return false;
            const idade = agora - Date.parse(e.criado_em);
            return idade >= semanaIdx * 7 * DIA_MS && idade < (semanaIdx + 1) * 7 * DIA_MS;
          })
          .map((e) => dataBRT(e.criado_em)),
      ).size;

    const ids = todosPerfis.map((x) => x.id);
    const ativas = ids.filter((id) => (diasAtivosPeriodo.get(id)?.size ?? 0) > 0);
    const pagantesSemUso = ids.filter(
      (id) =>
        pagantesSet.has(id) && !(ultimaSessao.get(id) && (ultimaSessao.get(id) as string) >= dia14),
    );
    const abandonaram = ids.filter((id) => {
      const u = ultimaSessao.get(id);
      return u !== undefined && u < dia30;
    });
    const altamenteEngajadas = ids.filter(
      (id) => diasAtivosSemana(id, 0) >= 3 && diasAtivosSemana(id, 1) >= 3,
    );
    const emRisco = ids.filter((id) => {
      const semanas = semanasComSessao.get(id);
      if (!semanas) return false;
      const u = ultimaSessao.get(id);
      if (u && u >= dia7) return false;
      return [...semanas].some((w) => semanas.has(w + 1));
    });

    const faixa = (id: string): "0" | "1-3" | "4+" => {
      const d = diasAtivos30.get(id)?.size ?? 0;
      return d === 0 ? "0" : d <= 3 ? "1-3" : "4+";
    };
    const matriz = {
      pagantesMuito: ids.filter((id) => pagantesSet.has(id) && faixa(id) === "4+"),
      pagantesPouco: ids.filter((id) => pagantesSet.has(id) && faixa(id) === "1-3"),
      pagantesSemUso: ids.filter((id) => pagantesSet.has(id) && faixa(id) === "0"),
      gratuitasEngajadas: ids.filter((id) => !pagantesSet.has(id) && faixa(id) === "4+"),
      gratuitasPouco: ids.filter((id) => !pagantesSet.has(id) && faixa(id) === "1-3"),
      gratuitasSemUso: ids.filter((id) => !pagantesSet.has(id) && faixa(id) === "0"),
    };

    const linhas = (lista: string[]) =>
      montarLinhas(lista, perfisPorId, pagantesSet, ultimoAcesso, diasAtivos30, sessoesPorUsuaria);

    return {
      periodo: p,
      totalUsuarias: ids.length,
      totalPagantes: pagantesSet.size,
      segmentos: [
        {
          chave: "ativas",
          rotulo: "Ativas",
          definicao: "ação real no período selecionado",
          usuarias: linhas(ativas),
        },
        {
          chave: "pagantes_sem_uso",
          rotulo: "Pagantes sem uso",
          definicao: "assinatura ativa e nenhuma sessão nos últimos 14 dias",
          usuarias: linhas(pagantesSemUso),
        },
        {
          chave: "abandonaram",
          rotulo: "Abandonaram",
          definicao: "tiveram sessão nos últimos 90 dias, mas nenhuma nos últimos 30",
          usuarias: linhas(abandonaram),
        },
        {
          chave: "engajadas",
          rotulo: "Altamente engajadas",
          definicao: "3 ou mais dias com ação real em cada uma das 2 últimas semanas",
          usuarias: linhas(altamenteEngajadas),
        },
        {
          chave: "em_risco",
          rotulo: "Em risco",
          definicao: "tinham sessões em semanas seguidas e não entram há 7 dias ou mais",
          usuarias: linhas(emRisco),
        },
      ],
      matriz: {
        pagantesMuito: linhas(matriz.pagantesMuito),
        pagantesPouco: linhas(matriz.pagantesPouco),
        pagantesSemUso: linhas(matriz.pagantesSemUso),
        gratuitasEngajadas: linhas(matriz.gratuitasEngajadas),
        gratuitasPouco: linhas(matriz.gratuitasPouco),
        gratuitasSemUso: linhas(matriz.gratuitasSemUso),
      },
    };
  });
