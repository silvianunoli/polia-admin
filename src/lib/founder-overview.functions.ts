import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stripeClient } from "@/lib/stripe.functions";
import { assertAdmin } from "@/lib/founder-auth.server";
import {
  periodoSearchSchema,
  resolverPeriodo,
  variacaoPct,
  dataBRT,
  type PeriodoResolvido,
} from "@/lib/founder-periodo";
import type { Json } from "@/integrations/supabase/types";

// Overview do Founder Dashboard: só LEITURA. Quem roda os health-checks,
// grava o snapshot diário e avalia alertas é a Edge Function founder-monitor
// (polia-app/supabase/functions/founder-monitor), a cada 10 min pelo pg_cron
// ou sob demanda pelo botão "Verificar agora".

const STATUS_ATIVOS = ["active", "trialing", "past_due"];

export type StatusServico = "operacional" | "atencao" | "critico" | "sem_dados";

export interface ServicoStatus {
  service: string;
  label: string;
  status: StatusServico;
  detalhe: string | null;
  latenciaMs: number | null;
  checadoEm: string | null;
}

const SERVICOS: { service: string; label: string }[] = [
  { service: "api", label: "API (one.usepolia.com.br)" },
  { service: "banco_dados", label: "Banco de dados" },
  { service: "autenticacao", label: "Autenticação" },
  { service: "pagamentos", label: "Pagamentos" },
  { service: "emails", label: "E-mails" },
  { service: "ia", label: "IA" },
  { service: "storage", label: "Storage" },
];

export interface FounderAlerta {
  id: string;
  tipo: string;
  severidade: "atencao" | "critico";
  titulo: string;
  mensagem: string | null;
  detalhes: Json;
  link: string | null;
  status: "aberto" | "resolvido";
  criadoEm: string;
  resolvidoEm: string | null;
}

export interface Metrica {
  atual: number | null;
  anterior: number | null;
  variacaoPct: number | null;
}

export interface NumerosPrincipais {
  usuariasTotal: Metrica;
  novasContas: Metrica;
  usuariasAtivas: Metrica;
  assinantes: Metrica;
  mrrCentavos: Metrica;
  churnPct: Metrica;
  erros: Metrica;
}

export interface FounderOverview {
  periodo: PeriodoResolvido;
  atualizadoEm: string | null;
  servicos: ServicoStatus[];
  alertas: FounderAlerta[];
  numeros: NumerosPrincipais;
  pulso: string;
  baselineDias: number;
}

type LinhaCheck = {
  service: string;
  status: StatusServico;
  detalhe: string | null;
  latencia_ms: number | null;
  checado_em: string;
};

export async function carregarServicos(): Promise<{
  servicos: ServicoStatus[];
  atualizadoEm: string | null;
}> {
  const { data } = await supabaseAdmin
    .from("founder_service_checks")
    .select("service, status, detalhe, latencia_ms, checado_em")
    .order("checado_em", { ascending: false })
    .limit(SERVICOS.length * 3);
  const linhas = (data ?? []) as LinhaCheck[];
  const ultimoPorServico = new Map<string, LinhaCheck>();
  for (const l of linhas) if (!ultimoPorServico.has(l.service)) ultimoPorServico.set(l.service, l);

  const servicos: ServicoStatus[] = SERVICOS.map((s) => {
    const u = ultimoPorServico.get(s.service);
    return {
      service: s.service,
      label: s.label,
      status: u?.status ?? "sem_dados",
      detalhe: u?.detalhe ?? "O monitor ainda não rodou pra este serviço.",
      latenciaMs: u?.latencia_ms ?? null,
      checadoEm: u?.checado_em ?? null,
    };
  });
  const atualizadoEm = linhas[0]?.checado_em ?? null;
  return { servicos, atualizadoEm };
}

type LinhaAlerta = {
  id: string;
  tipo: string;
  severidade: "atencao" | "critico";
  titulo: string;
  mensagem: string | null;
  detalhes: Json;
  link: string | null;
  status: "aberto" | "resolvido";
  criado_em: string;
  resolvido_em: string | null;
};

function mapearAlerta(a: LinhaAlerta): FounderAlerta {
  return {
    id: a.id,
    tipo: a.tipo,
    severidade: a.severidade,
    titulo: a.titulo,
    mensagem: a.mensagem,
    detalhes: a.detalhes,
    link: a.link,
    status: a.status,
    criadoEm: a.criado_em,
    resolvidoEm: a.resolvido_em,
  };
}

export async function carregarAlertas(incluirResolvidos: boolean): Promise<FounderAlerta[]> {
  let q = supabaseAdmin
    .from("founder_alertas")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(incluirResolvidos ? 60 : 30);
  if (!incluirResolvidos) q = q.eq("status", "aberto");
  const { data } = await q;
  return ((data ?? []) as LinhaAlerta[]).map(mapearAlerta);
}

async function contar(
  tabela: "profiles" | "erros_app",
  coluna: string,
  ini: string,
  fim: string,
): Promise<number> {
  const { count } = await supabaseAdmin
    .from(tabela)
    .select("id", { head: true, count: "exact" })
    .gte(coluna, ini)
    .lt(coluna, fim);
  return count ?? 0;
}

async function contarAte(tabela: "profiles", coluna: string, fim: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from(tabela)
    .select("id", { head: true, count: "exact" })
    .lt(coluna, fim);
  return count ?? 0;
}

// "Ativa" = ação real registrada em founder_eventos (nunca feature_opened /
// heartbeat) — a mesma definição do founder-monitor e das telas de analytics.
const EVENTOS_ATIVOS = [
  "feature_completed",
  "create_product",
  "edit_product",
  "create_goal",
  "edit_goal",
  "onboarding_completed",
  "business_created",
];

async function ativasPorEventos(ini: string, fim: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("founder_eventos")
    .select("user_id")
    .in("evento", EVENTOS_ATIVOS)
    .not("user_id", "is", null)
    .gte("criado_em", ini)
    .lt("criado_em", fim)
    .limit(20000);
  return new Set(((data ?? []) as { user_id: string }[]).map((l) => l.user_id)).size;
}

function metrica(atual: number | null, anterior: number | null): Metrica {
  return {
    atual,
    anterior,
    variacaoPct: atual === null || anterior === null ? null : variacaoPct(atual, anterior),
  };
}

async function calcularNumeros(p: PeriodoResolvido): Promise<NumerosPrincipais> {
  const [
    usuariasTotalAtual,
    usuariasTotalAnterior,
    novasAtual,
    novasAnterior,
    ativasAtual,
    ativasAnterior,
    errosAtual,
    errosAnterior,
    { data: assinaturasData },
  ] = await Promise.all([
    contarAte("profiles", "created_at", p.fim),
    contarAte("profiles", "created_at", p.fimAnterior),
    contar("profiles", "created_at", p.ini, p.fim),
    contar("profiles", "created_at", p.iniAnterior, p.fimAnterior),
    ativasPorEventos(p.ini, p.fim),
    ativasPorEventos(p.iniAnterior, p.fimAnterior),
    contar("erros_app", "criado_em", p.ini, p.fim),
    contar("erros_app", "criado_em", p.iniAnterior, p.fimAnterior),
    supabaseAdmin.from("assinaturas").select("price_id, status, updated_at"),
  ]);

  const assinaturas = (assinaturasData ?? []) as {
    price_id: string;
    status: string;
    updated_at: string;
  }[];
  const ativas = assinaturas.filter((a) => STATUS_ATIVOS.includes(a.status));
  const canceladasNoPeriodo = assinaturas.filter(
    (a) => a.status === "canceled" && a.updated_at >= p.ini && a.updated_at < p.fim,
  );

  const porPrice = new Map<string, number>();
  ativas.forEach((a) => porPrice.set(a.price_id, (porPrice.get(a.price_id) ?? 0) + 1));
  let mrr = 0;
  if (porPrice.size > 0) {
    const stripe = stripeClient();
    for (const [priceId, quantidade] of porPrice.entries()) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        const valor = price.unit_amount ?? 0;
        const mensal = price.recurring?.interval === "year" ? Math.round(valor / 12) : valor;
        mrr += mensal * quantidade;
      } catch (err) {
        console.error(`[Founder] Falha ao buscar price ${priceId} no Stripe:`, err);
      }
    }
  }

  // Assinantes/MRR do período anterior vêm do snapshot diário mais próximo do
  // fim do período anterior — é o único registro histórico desses dois números.
  const { data: snapAnterior } = await supabaseAdmin
    .from("founder_metricas_diarias")
    .select("assinantes, mrr_centavos")
    .lte("dia", dataBRT(p.fimAnterior))
    .order("dia", { ascending: false })
    .limit(1)
    .maybeSingle();
  const snap = snapAnterior as { assinantes: number; mrr_centavos: number } | null;

  const baseChurn = ativas.length + canceladasNoPeriodo.length;
  const churn = baseChurn > 0 ? (canceladasNoPeriodo.length / baseChurn) * 100 : null;

  return {
    usuariasTotal: metrica(usuariasTotalAtual, usuariasTotalAnterior),
    novasContas: metrica(novasAtual, novasAnterior),
    usuariasAtivas: metrica(ativasAtual, ativasAnterior),
    assinantes: metrica(ativas.length, snap ? snap.assinantes : null),
    mrrCentavos: metrica(mrr, snap ? Number(snap.mrr_centavos) : null),
    churnPct: metrica(churn, null),
    erros: metrica(errosAtual, errosAnterior),
  };
}

function montarPulso(
  servicos: ServicoStatus[],
  alertas: FounderAlerta[],
  numeros: NumerosPrincipais,
  periodo: PeriodoResolvido,
  atualizadoEm: string | null,
): string {
  const partes: string[] = [];
  const criticos = servicos.filter((s) => s.status === "critico");
  const atencao = servicos.filter((s) => s.status === "atencao");

  if (!atualizadoEm) {
    partes.push(
      "O monitor ainda não rodou: a saúde do sistema aparece assim que a primeira verificação acontecer.",
    );
  } else if (criticos.length === 0 && atencao.length === 0) {
    partes.push("Tudo funcionando.");
  } else {
    if (criticos.length > 0) {
      partes.push(
        `${criticos.length} serviço(s) fora do ar: ${criticos.map((s) => s.label).join(", ")}.`,
      );
    }
    if (atencao.length > 0) {
      partes.push(
        `${atencao.length} serviço(s) lento(s): ${atencao.map((s) => s.label).join(", ")}.`,
      );
    }
  }

  const novas = numeros.novasContas;
  if (novas.atual !== null) {
    if (novas.variacaoPct === null || novas.anterior === 0) {
      partes.push(`${novas.atual} conta(s) nova(s) no período (${periodo.rotulo}).`);
    } else {
      const sinal = novas.variacaoPct >= 0 ? "+" : "";
      partes.push(
        `${novas.atual} conta(s) nova(s) no período, ${sinal}${novas.variacaoPct.toFixed(0)}% contra o período anterior.`,
      );
    }
  }

  const erros = numeros.erros;
  if (
    erros.atual !== null &&
    erros.anterior !== null &&
    erros.anterior > 0 &&
    erros.atual > erros.anterior * 2
  ) {
    partes.push(
      `Erros do app subiram: ${erros.atual} contra ${erros.anterior} no período anterior.`,
    );
  }

  if (numeros.assinantes.atual !== null && numeros.assinantes.atual > 0) {
    const mrr = (numeros.mrrCentavos.atual ?? 0) / 100;
    partes.push(
      `${numeros.assinantes.atual} assinante(s), MRR ${mrr.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`,
    );
  }

  partes.push(
    alertas.length > 0
      ? `${alertas.length} coisa(s) precisam da sua atenção.`
      : "Nenhum alerta aberto.",
  );
  return partes.join(" ");
}

export const getFounderOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }): Promise<FounderOverview> => {
    await assertAdmin(context.userId);
    const periodo = resolverPeriodo(data);

    const [{ servicos, atualizadoEm }, alertas, numeros, { count: baselineDias }] =
      await Promise.all([
        carregarServicos(),
        carregarAlertas(false),
        calcularNumeros(periodo),
        supabaseAdmin
          .from("founder_metricas_diarias")
          .select("dia", { head: true, count: "exact" }),
      ]);

    return {
      periodo,
      atualizadoEm,
      servicos,
      alertas,
      numeros,
      pulso: montarPulso(servicos, alertas, numeros, periodo, atualizadoEm),
      baselineDias: baselineDias ?? 0,
    };
  });

export const getFounderSaude = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { servicos, atualizadoEm } = await carregarServicos();
    const { data } = await supabaseAdmin
      .from("founder_service_checks")
      .select("service, status, detalhe, latencia_ms, checado_em")
      .order("checado_em", { ascending: false })
      .limit(140);
    const historico = ((data ?? []) as LinhaCheck[]).map((l) => ({
      service: l.service,
      label: SERVICOS.find((s) => s.service === l.service)?.label ?? l.service,
      status: l.status,
      detalhe: l.detalhe,
      latenciaMs: l.latencia_ms,
      checadoEm: l.checado_em,
    }));
    return { servicos, atualizadoEm, historico };
  });

export const getFounderAlertas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const alertas = await carregarAlertas(true);
    return { alertas };
  });

export const getFounderBarra = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ servicos, atualizadoEm }, { count: alertasAbertos }] = await Promise.all([
      carregarServicos(),
      supabaseAdmin
        .from("founder_alertas")
        .select("id", { head: true, count: "exact" })
        .eq("status", "aberto"),
    ]);
    const criticos = servicos.filter((s) => s.status === "critico").length;
    return { atualizadoEm, alertasAbertos: alertasAbertos ?? 0, servicosCriticos: criticos };
  });
