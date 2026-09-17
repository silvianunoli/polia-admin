import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stripeClient } from "@/lib/stripe.functions";
import { assertAdmin } from "@/lib/founder-auth.server";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { dataBRT, periodoSearchSchema, resolverPeriodo, variacaoPct } from "@/lib/founder-periodo";

// Negócio (seção 7): receita realizada (faturas pagas no Stripe), MRR,
// assinaturas, conversão e churn. Assinatura = tabela assinaturas (espelho do
// webhook); receita vem direto do Stripe pra não inventar número.

const STATUS_ATIVOS = ["active", "trialing", "past_due"];
const DIA_MS = 86400000;

type Assinatura = {
  user_id: string;
  price_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

async function assinaturas(): Promise<Assinatura[]> {
  const { data } = await supabaseAdmin
    .from("assinaturas")
    .select(
      "user_id, price_id, status, created_at, updated_at, current_period_end, cancel_at_period_end",
    );
  return (data ?? []) as Assinatura[];
}

const cachePreco = new Map<string, { mensal: number; intervalo: string; nome: string }>();
async function infoPreco(priceId: string) {
  const c = cachePreco.get(priceId);
  if (c) return c;
  try {
    const price = await stripeClient().prices.retrieve(priceId, { expand: ["product"] });
    const valor = price.unit_amount ?? 0;
    const intervalo = price.recurring?.interval ?? "month";
    const nome =
      typeof price.product === "object" && price.product && "name" in price.product
        ? (price.product as { name: string }).name
        : (price.nickname ?? priceId);
    const info = { mensal: intervalo === "year" ? Math.round(valor / 12) : valor, intervalo, nome };
    cachePreco.set(priceId, info);
    return info;
  } catch {
    return { mensal: 0, intervalo: "desconhecido", nome: priceId };
  }
}

async function snapshots(ini: string, fim: string) {
  const { data } = await supabaseAdmin
    .from("founder_metricas_diarias")
    .select("dia, assinantes, mrr_centavos, novas_contas, usuarias_total")
    .gte("dia", dataBRT(ini))
    .lte("dia", dataBRT(fim))
    .order("dia");
  return (data ?? []) as {
    dia: string;
    assinantes: number;
    mrr_centavos: number;
    novas_contas: number;
    usuarias_total: number;
  }[];
}

export const getNegocioReceita = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const stripe = stripeClient();
    const buscarFaturas = async (ini: string, fim: string) => {
      const faturas: {
        valor: number;
        quando: string;
        cliente: string | null;
        numero: string | null;
      }[] = [];
      let startingAfter: string | undefined;
      for (let pagina = 0; pagina < 10; pagina++) {
        const lote = await stripe.invoices.list({
          status: "paid",
          created: {
            gte: Math.floor(Date.parse(ini) / 1000),
            lt: Math.floor(Date.parse(fim) / 1000),
          },
          limit: 100,
          starting_after: startingAfter,
        });
        for (const f of lote.data) {
          faturas.push({
            valor: f.amount_paid ?? 0,
            quando: new Date(f.created * 1000).toISOString(),
            cliente: typeof f.customer === "string" ? f.customer : (f.customer?.id ?? null),
            numero: f.number ?? null,
          });
        }
        if (!lote.has_more) break;
        startingAfter = lote.data[lote.data.length - 1]?.id;
      }
      return faturas;
    };
    let faturas: Awaited<ReturnType<typeof buscarFaturas>> = [];
    let faturasAnt: typeof faturas = [];
    let stripeOk = true;
    try {
      [faturas, faturasAnt] = await Promise.all([
        buscarFaturas(p.ini, p.fim),
        buscarFaturas(p.iniAnterior, p.fimAnterior),
      ]);
    } catch {
      stripeOk = false;
    }
    const receita = faturas.reduce((s, f) => s + f.valor, 0);
    const receitaAnt = faturasAnt.reduce((s, f) => s + f.valor, 0);

    const todas = await assinaturas();
    const ativas = todas.filter((a) => STATUS_ATIVOS.includes(a.status));
    let mrr = 0;
    const porPlano = new Map<
      string,
      { nome: string; intervalo: string; quantidade: number; mensal: number }
    >();
    for (const a of ativas) {
      const info = await infoPreco(a.price_id);
      mrr += info.mensal;
      const x = porPlano.get(a.price_id) ?? {
        nome: info.nome,
        intervalo: info.intervalo,
        quantidade: 0,
        mensal: info.mensal,
      };
      x.quantidade++;
      porPlano.set(a.price_id, x);
    }
    const serie = (await snapshots(p.ini, p.fim)).map((s) => ({
      dia: s.dia,
      valor: Number(s.mrr_centavos),
    }));
    const porDia = new Map<string, number>();
    for (const f of faturas)
      porDia.set(dataBRT(f.quando), (porDia.get(dataBRT(f.quando)) ?? 0) + f.valor);

    return {
      periodo: p,
      stripeOk,
      receitaCentavos: receita,
      receitaVariacao: variacaoPct(receita, receitaAnt),
      faturasPagas: faturas.length,
      ticketMedioCentavos: faturas.length ? receita / faturas.length : null,
      mrrCentavos: mrr,
      arrCentavos: mrr * 12,
      assinantesAtivas: ativas.length,
      porPlano: [...porPlano.values()].sort((a, b) => b.quantidade - a.quantidade),
      serieMrr: serie,
      serieReceita: [...porDia.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dia, valor]) => ({ dia, valor })),
      faturasRecentes: faturas.slice(0, 20),
    };
  });

export const getNegocioAssinaturas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [todas, { data: perfisData }, { data: eventos }] = await Promise.all([
      assinaturas(),
      supabaseAdmin.from("profiles").select("id, full_name, display_name, business_name, plano"),
      supabaseAdmin
        .from("founder_eventos")
        .select("user_id, evento, criado_em")
        .in("evento", ["subscription_started", "subscription_cancelled", "payment_failed"])
        .gte("criado_em", p.iniAnterior)
        .order("criado_em", { ascending: false })
        .limit(2000),
    ]);
    const perfis = new Map(
      (
        (perfisData ?? []) as {
          id: string;
          full_name: string | null;
          display_name: string | null;
          business_name: string | null;
          plano: string | null;
        }[]
      ).map((x) => [x.id, x]),
    );
    const nome = (id: string) => {
      const x = perfis.get(id);
      return x?.display_name || x?.full_name || x?.business_name || id.slice(0, 8);
    };
    const ev = (eventos ?? []) as { user_id: string; evento: string; criado_em: string }[];
    const noPeriodo = (evento: string, ini: string, fim: string) =>
      ev.filter((e) => e.evento === evento && e.criado_em >= ini && e.criado_em < fim).length;

    const ativas = todas.filter((a) => STATUS_ATIVOS.includes(a.status));
    const novasNoPeriodo = todas.filter((a) => a.created_at >= p.ini && a.created_at < p.fim);
    const novasAnt = todas.filter(
      (a) => a.created_at >= p.iniAnterior && a.created_at < p.fimAnterior,
    );
    const porStatus = new Map<string, number>();
    for (const a of todas) porStatus.set(a.status, (porStatus.get(a.status) ?? 0) + 1);
    const lista = [];
    for (const a of [...todas]
      .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
      .slice(0, 100)) {
      const info = await infoPreco(a.price_id);
      lista.push({
        userId: a.user_id,
        nome: nome(a.user_id),
        plano: info.nome,
        intervalo: info.intervalo,
        status: a.status,
        cancelaNoFim: a.cancel_at_period_end,
        fimPeriodo: a.current_period_end,
        desde: a.created_at,
      });
    }
    return {
      periodo: p,
      ativas: ativas.length,
      trialing: todas.filter((a) => a.status === "trialing").length,
      pendentes: todas.filter((a) => ["past_due", "unpaid"].includes(a.status)).length,
      cancelamAoFim: ativas.filter((a) => a.cancel_at_period_end).length,
      novas: novasNoPeriodo.length,
      novasVariacao: variacaoPct(novasNoPeriodo.length, novasAnt.length),
      eventos: {
        iniciadas: noPeriodo("subscription_started", p.ini, p.fim),
        canceladas: noPeriodo("subscription_cancelled", p.ini, p.fim),
        pagamentosFalhos: noPeriodo("payment_failed", p.ini, p.fim),
      },
      porStatus: [...porStatus.entries()]
        .map(([rotulo, valor]) => ({ rotulo, valor }))
        .sort((a, b) => b.valor - a.valor),
      serie: (await snapshots(p.ini, p.fim)).map((s) => ({ dia: s.dia, valor: s.assinantes })),
      lista,
    };
  });

export const getNegocioConversao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [todas, { data: perfisData }, { count: leads }, { count: leadsAnt }] = await Promise.all([
      assinaturas(),
      supabaseAdmin.from("profiles").select("id, created_at, plano, onboarding_completed"),
      supabaseAdmin
        .from("lista_espera")
        .select("id", { head: true, count: "exact" })
        .gte("criado_em", p.ini)
        .lt("criado_em", p.fim),
      supabaseAdmin
        .from("lista_espera")
        .select("id", { head: true, count: "exact" })
        .gte("criado_em", p.iniAnterior)
        .lt("criado_em", p.fimAnterior),
    ]);
    const perfis = (perfisData ?? []) as {
      id: string;
      created_at: string;
      plano: string | null;
      onboarding_completed: boolean;
    }[];
    const pagantesSet = new Set(
      todas.filter((a) => STATUS_ATIVOS.includes(a.status)).map((a) => a.user_id),
    );
    const jaTeveAssinatura = new Set(todas.map((a) => a.user_id));
    const trials = todas.filter(
      (a) => a.status === "trialing" || (a.created_at >= p.ini && a.created_at < p.fim),
    );
    const trialParaPaga = todas.filter(
      (a) => a.status === "active" && a.created_at >= p.ini && a.created_at < p.fim,
    ).length;

    const contasNoPeriodo = perfis.filter((x) => x.created_at >= p.ini && x.created_at < p.fim);
    const contasConverteram = contasNoPeriodo.filter((x) => pagantesSet.has(x.id)).length;
    const total = perfis.length;
    const tempoAteAssinar = todas
      .map((a) => {
        const perfil = perfis.find((x) => x.id === a.user_id);
        return perfil ? (Date.parse(a.created_at) - Date.parse(perfil.created_at)) / DIA_MS : null;
      })
      .filter((x): x is number => x !== null && x >= 0);
    const mediana = (v: number[]) => {
      if (!v.length) return null;
      const s = [...v].sort((a, b) => a - b);
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    };
    return {
      periodo: p,
      totalContas: total,
      pagantes: pagantesSet.size,
      taxaGeral: total ? (pagantesSet.size / total) * 100 : null,
      contasNoPeriodo: contasNoPeriodo.length,
      contasConverteram,
      taxaCoorte: contasNoPeriodo.length
        ? (contasConverteram / contasNoPeriodo.length) * 100
        : null,
      jaTiveramAssinatura: jaTeveAssinatura.size,
      trialsNoPeriodo: trials.length,
      trialParaPaga,
      leadsListaEspera: leads ?? 0,
      leadsVariacao: variacaoPct(leads ?? 0, leadsAnt ?? 0),
      diasAteAssinarMediana: mediana(tempoAteAssinar),
      funil: [
        { rotulo: "Contas criadas", total: total },
        {
          rotulo: "Onboarding concluído",
          total: perfis.filter((x) => x.onboarding_completed).length,
        },
        { rotulo: "Já tiveram assinatura", total: jaTeveAssinatura.size },
        { rotulo: "Assinantes ativas agora", total: pagantesSet.size },
      ],
    };
  });

export const getNegocioChurn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [todas, { data: perfisData }, snaps] = await Promise.all([
      assinaturas(),
      supabaseAdmin.from("profiles").select("id, full_name, display_name, business_name"),
      snapshots(new Date(Date.now() - 180 * DIA_MS).toISOString(), new Date().toISOString()),
    ]);
    const perfis = new Map(
      (
        (perfisData ?? []) as {
          id: string;
          full_name: string | null;
          display_name: string | null;
          business_name: string | null;
        }[]
      ).map((x) => [x.id, x]),
    );
    const nome = (id: string) => {
      const x = perfis.get(id);
      return x?.display_name || x?.full_name || x?.business_name || id.slice(0, 8);
    };
    const ativas = todas.filter((a) => STATUS_ATIVOS.includes(a.status));
    const canceladas = todas.filter(
      (a) => a.status === "canceled" && a.updated_at >= p.ini && a.updated_at < p.fim,
    );
    const canceladasAnt = todas.filter(
      (a) =>
        a.status === "canceled" && a.updated_at >= p.iniAnterior && a.updated_at < p.fimAnterior,
    );
    // Base do churn = assinantes no fim do período anterior (snapshot); sem snapshot, usa ativas + canceladas.
    const snapInicio = snaps
      .filter((s) => s.dia <= dataBRT(p.ini))
      .sort((a, b) => b.dia.localeCompare(a.dia))[0];
    const base = snapInicio ? snapInicio.assinantes : ativas.length + canceladas.length;
    const churn = base > 0 ? (canceladas.length / base) * 100 : null;
    const baseAnt = ativas.length + canceladasAnt.length;
    const churnAnt = baseAnt > 0 ? (canceladasAnt.length / baseAnt) * 100 : null;
    const mensal = new Map<string, { canceladas: number }>();
    for (const a of todas.filter((x) => x.status === "canceled")) {
      const mes = a.updated_at.slice(0, 7);
      const m = mensal.get(mes) ?? { canceladas: 0 };
      m.canceladas++;
      mensal.set(mes, m);
    }
    return {
      periodo: p,
      churnPct: churn,
      churnAnteriorPct: churnAnt,
      canceladas: canceladas.length,
      canceladasVariacao: variacaoPct(canceladas.length, canceladasAnt.length),
      base,
      baseOrigem: snapInicio
        ? `snapshot de ${snapInicio.dia}`
        : "ativas agora + canceladas no período",
      cancelamAoFim: ativas.filter((a) => a.cancel_at_period_end).length,
      lista: canceladas.map((a) => ({
        userId: a.user_id,
        nome: nome(a.user_id),
        quando: a.updated_at,
        fimAcesso: a.current_period_end,
      })),
      porMes: [...mensal.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-12)
        .map(([mes, m]) => ({ dia: mes, valor: m.canceladas })),
      serieAssinantes: snaps.map((s) => ({ dia: s.dia, valor: s.assinantes })),
    };
  });

// ---------- Releases ----------

const releaseInput = z.object({
  repositorio: z.enum([
    "polia-app",
    "polia-admin",
    "polia-servicos",
    "polia-comunidade",
    "supabase",
  ]),
  titulo: z.string().min(2).max(160),
  versao: z.string().max(40).optional(),
  descricao: z.string().max(2000).optional(),
  commitSha: z.string().max(64).optional(),
  deployadoEm: z.string().datetime().optional(),
});

export const getReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("founder_releases")
      .select("id, repositorio, versao, titulo, descricao, commit_sha, deployado_em")
      .order("deployado_em", { ascending: false })
      .limit(100);
    return (
      (data ?? []) as {
        id: string;
        repositorio: string;
        versao: string | null;
        titulo: string;
        descricao: string | null;
        commit_sha: string | null;
        deployado_em: string;
      }[]
    ).map((r) => ({
      id: r.id,
      repositorio: r.repositorio,
      versao: r.versao,
      titulo: r.titulo,
      descricao: r.descricao,
      commitSha: r.commit_sha,
      deployadoEm: r.deployado_em,
    }));
  });

export const criarRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => releaseInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("founder_releases").insert({
      repositorio: data.repositorio,
      titulo: data.titulo,
      versao: data.versao || null,
      descricao: data.descricao || null,
      commit_sha: data.commitSha || null,
      deployado_em: data.deployadoEm ?? new Date().toISOString(),
      criado_por: context.userId,
    });
    if (error) throw new Error(error.message);
    await logAcaoAdminServer(context.userId, "criar_founder_release", data.titulo, {
      repositorio: data.repositorio,
    });
    return { ok: true as const };
  });
