import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/founder-auth.server";
import { dataBRT, periodoSearchSchema, resolverPeriodo, variacaoPct } from "@/lib/founder-periodo";
import type { Json } from "@/integrations/supabase/types";

// Operação (seção 6): erros do app, eventos de sistema, jobs do pg_cron e
// integrações. Diagnóstico, não decoração: cada lista tem o link pro contexto.

const DIA_MS = 86400000;

function serie(ini: string, fim: string, datas: string[]): { dia: string; valor: number }[] {
  const contagem = new Map<string, number>();
  for (const d of datas) {
    const dia = dataBRT(d);
    contagem.set(dia, (contagem.get(dia) ?? 0) + 1);
  }
  const pontos: { dia: string; valor: number }[] = [];
  const fimDia = dataBRT(fim);
  for (let t = Date.parse(ini); ; t += DIA_MS) {
    const dia = dataBRT(t);
    if (dia > fimDia) break;
    if (pontos.length && pontos[pontos.length - 1].dia === dia) continue;
    pontos.push({ dia, valor: contagem.get(dia) ?? 0 });
    if (pontos.length > 400) break;
  }
  return pontos;
}

export const getOperacaoErros = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [{ data: atual }, { count: anterior }] = await Promise.all([
      supabaseAdmin
        .from("erros_app")
        .select("id, origem, mensagem, pagina, user_id, criado_em")
        .gte("criado_em", p.ini)
        .lt("criado_em", p.fim)
        .order("criado_em", { ascending: false })
        .limit(2000),
      supabaseAdmin
        .from("erros_app")
        .select("id", { head: true, count: "exact" })
        .gte("criado_em", p.iniAnterior)
        .lt("criado_em", p.fimAnterior),
    ]);
    const erros = (atual ?? []) as {
      id: string;
      origem: string;
      mensagem: string;
      pagina: string | null;
      user_id: string | null;
      criado_em: string;
    }[];
    const agrupar = (chave: (e: (typeof erros)[number]) => string) => {
      const m = new Map<string, number>();
      for (const e of erros) m.set(chave(e), (m.get(chave(e)) ?? 0) + 1);
      return [...m.entries()]
        .map(([rotulo, valor]) => ({ rotulo, valor }))
        .sort((a, b) => b.valor - a.valor);
    };
    return {
      periodo: p,
      total: erros.length,
      variacao: variacaoPct(erros.length, anterior ?? 0),
      usuariasAfetadas: new Set(erros.filter((e) => e.user_id).map((e) => e.user_id)).size,
      porOrigem: agrupar((e) => e.origem),
      porPagina: agrupar((e) => e.pagina ?? "sem página").slice(0, 12),
      porMensagem: agrupar((e) => e.mensagem.slice(0, 90)).slice(0, 12),
      serie: serie(
        p.ini,
        p.fim,
        erros.map((e) => e.criado_em),
      ),
      recentes: erros.slice(0, 40).map((e) => ({
        id: e.id,
        origem: e.origem,
        mensagem: e.mensagem.slice(0, 200),
        pagina: e.pagina,
        userId: e.user_id,
        quando: e.criado_em,
      })),
    };
  });

export const getOperacaoLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const { data: linhas } = await supabaseAdmin
      .from("founder_eventos_sistema")
      .select("id, tipo, origem, servico, detalhes, latencia_ms, criado_em")
      .gte("criado_em", p.ini)
      .lt("criado_em", p.fim)
      .order("criado_em", { ascending: false })
      .limit(1000);
    const eventos = (linhas ?? []) as {
      id: string;
      tipo: string;
      origem: string;
      servico: string | null;
      detalhes: Json;
      latencia_ms: number | null;
      criado_em: string;
    }[];
    const porTipo = new Map<string, number>();
    for (const e of eventos) porTipo.set(e.tipo, (porTipo.get(e.tipo) ?? 0) + 1);
    return {
      periodo: p,
      total: eventos.length,
      porTipo: [...porTipo.entries()]
        .map(([rotulo, valor]) => ({ rotulo, valor }))
        .sort((a, b) => b.valor - a.valor),
      falhas: eventos.filter((e) => e.tipo !== "ia_call").length,
      serie: serie(
        p.ini,
        p.fim,
        eventos.filter((e) => e.tipo !== "ia_call").map((e) => e.criado_em),
      ),
      recentes: eventos.slice(0, 80).map((e) => ({
        id: e.id,
        tipo: e.tipo,
        origem: e.origem,
        servico: e.servico,
        detalhes: JSON.stringify(e.detalhes ?? {}).slice(0, 220),
        latenciaMs: e.latencia_ms,
        quando: e.criado_em,
      })),
    };
  });

export const getOperacaoJobs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ data: h24, error }, { data: h168 }] = await Promise.all([
      supabaseAdmin.rpc("founder_jobs_status", { p_horas: 24 }),
      supabaseAdmin.rpc("founder_jobs_status", { p_horas: 168 }),
    ]);
    if (error) throw error;
    type Job = {
      jobid: number;
      jobname: string;
      schedule: string;
      active: boolean;
      executados: number;
      falhos: number;
      pendentes: number;
      duracao_media_s: number | null;
      duracao_max_s: number | null;
      ultima_execucao: string | null;
      ultimo_status: string | null;
      ultimo_erro: string | null;
    };
    const semana = new Map(((h168 ?? []) as Job[]).map((j) => [j.jobid, j]));
    const jobs = ((h24 ?? []) as Job[]).map((j) => ({
      jobid: j.jobid,
      nome: j.jobname,
      agenda: j.schedule,
      ativo: j.active,
      executados24h: j.executados,
      falhos24h: j.falhos,
      pendentes: j.pendentes,
      falhos7d: semana.get(j.jobid)?.falhos ?? 0,
      duracaoMediaS: j.duracao_media_s === null ? null : Number(j.duracao_media_s),
      duracaoMaxS: j.duracao_max_s === null ? null : Number(j.duracao_max_s),
      ultimaExecucao: j.ultima_execucao,
      ultimoStatus: j.ultimo_status,
      ultimoErro: j.ultimo_erro,
    }));
    return {
      jobs,
      totalExecutados24h: jobs.reduce((s, j) => s + j.executados24h, 0),
      totalFalhos24h: jobs.reduce((s, j) => s + j.falhos24h, 0),
      totalPendentes: jobs.reduce((s, j) => s + j.pendentes, 0),
    };
  });

export const getOperacaoIntegracoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const dia7 = new Date(Date.now() - 7 * DIA_MS).toISOString();
    const [
      { data: checks },
      { data: webhooks },
      { count: webhooks7d },
      { data: gcal },
      { data: falhas },
    ] = await Promise.all([
      supabaseAdmin
        .from("founder_service_checks")
        .select("service, status, detalhe, checado_em")
        .order("checado_em", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("stripe_webhook_events")
        .select("id, type, processed_at")
        .order("processed_at", { ascending: false })
        .limit(1),
      supabaseAdmin
        .from("stripe_webhook_events")
        .select("id", { head: true, count: "exact" })
        .gte("processed_at", dia7),
      supabaseAdmin
        .from("google_calendar_conexoes")
        .select("user_id, expires_at, email_conectado, updated_at"),
      supabaseAdmin
        .from("founder_eventos_sistema")
        .select("tipo, servico, origem, criado_em, detalhes")
        .in("tipo", ["integration_failure", "webhook_failure"])
        .gte("criado_em", dia7)
        .order("criado_em", { ascending: false })
        .limit(50),
    ]);
    type Check = { service: string; status: string; detalhe: string | null; checado_em: string };
    const ultimoCheck = new Map<string, Check>();
    for (const c of (checks ?? []) as Check[])
      if (!ultimoCheck.has(c.service)) ultimoCheck.set(c.service, c);
    const conexoes = (gcal ?? []) as {
      user_id: string;
      expires_at: string | null;
      email_conectado: string | null;
      updated_at: string;
    }[];
    const agora = Date.now();
    const gcalExpiradas = conexoes.filter(
      (c) => c.expires_at && Date.parse(c.expires_at) < agora,
    ).length;
    const falhasLista = (falhas ?? []) as {
      tipo: string;
      servico: string | null;
      origem: string;
      criado_em: string;
      detalhes: Json;
    }[];
    const falhasDe = (servico: string) =>
      falhasLista.filter((f) => f.servico === servico || f.origem.includes(servico)).length;
    const ultimoWebhook = (webhooks ?? [])[0] as
      { id: string; type: string; processed_at: string } | undefined;

    const integracoes = [
      {
        nome: "Stripe (webhook)",
        status: ultimoCheck.get("pagamentos")?.status ?? "sem_dados",
        detalhe: ultimoCheck.get("pagamentos")?.detalhe ?? null,
        ultimaSincronizacao: ultimoWebhook?.processed_at ?? null,
        extra: `${webhooks7d ?? 0} evento(s) de webhook em 7 dias${ultimoWebhook ? ` · último: ${ultimoWebhook.type}` : ""}`,
        falhas7d: falhasDe("stripe"),
      },
      {
        nome: "Resend (e-mail)",
        status: ultimoCheck.get("emails")?.status ?? "sem_dados",
        detalhe: ultimoCheck.get("emails")?.detalhe ?? null,
        ultimaSincronizacao: ultimoCheck.get("emails")?.checado_em ?? null,
        extra: "checado pelo monitor a cada 10 min",
        falhas7d: falhasDe("resend"),
      },
      {
        nome: "Google Agenda",
        status: conexoes.length === 0 ? "sem_dados" : gcalExpiradas > 0 ? "atencao" : "operacional",
        detalhe: `${conexoes.length} conexão(ões)${gcalExpiradas ? `, ${gcalExpiradas} com token vencido` : ""}`,
        ultimaSincronizacao:
          conexoes
            .map((c) => c.updated_at)
            .sort()
            .reverse()[0] ?? null,
        extra:
          "token vencido renova sozinho no próximo uso; falha de refresh vira evento de sistema",
        falhas7d: falhasDe("google_calendar"),
      },
      {
        nome: "IA (Gemini)",
        status: ultimoCheck.get("ia")?.status ?? "sem_dados",
        detalhe: ultimoCheck.get("ia")?.detalhe ?? null,
        ultimaSincronizacao: ultimoCheck.get("ia")?.checado_em ?? null,
        extra: "detalhe em Infra → IA",
        falhas7d: falhasDe("gemini"),
      },
    ];
    return {
      integracoes,
      falhasRecentes: falhasLista.slice(0, 30).map((f) => ({
        tipo: f.tipo,
        servico: f.servico,
        origem: f.origem,
        quando: f.criado_em,
        detalhes: JSON.stringify(f.detalhes ?? {}).slice(0, 200),
      })),
    };
  });
