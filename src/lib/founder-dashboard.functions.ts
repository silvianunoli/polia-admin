import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stripeClient } from "@/lib/stripe.functions";
import type { Json } from "@/integrations/supabase/types";

// Founder Dashboard — cockpit da fundadora (direcionamento em
// polia_founder_dashboard_direcionamento.pdf, fase 1: Founder Pulse, saúde
// do sistema, números principais e alertas). Construído do zero: schema
// próprio (founder_service_checks / founder_alertas / founder_metricas_diarias,
// migration founder_dashboard_schema) e queries próprias, sem importar nada
// de admin-negocio.functions.ts nem do motor de alertas antigo
// (alerta_regras/alertas_abertos). Lê direto de profiles/assinaturas/erros_app
// porque são a fonte real dos números — não tem outro lugar de onde tirar
// "quantas usuárias existem" ou "qual o MRR real".
//
// Sem cron ainda: os health-checks e a avaliação de alertas rodam ao vivo
// quando a página carrega ou no "Verificar agora". Enquanto ninguém abre o
// dashboard, nada roda em background — próximo passo natural se ela quiser
// alerta mesmo sem a página aberta.

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

const STATUS_ATIVOS = ["active", "trialing", "past_due"];

type StatusServico = "operacional" | "atencao" | "critico" | "sem_dados";

export interface ServicoChecado {
  service: string;
  label: string;
  status: StatusServico;
  detalhe: string | null;
  latenciaMs: number | null;
}

const LABEL_SERVICO: Record<string, string> = {
  banco_dados: "Banco de dados",
  autenticacao: "Autenticação",
  storage: "Storage",
  pagamentos: "Pagamentos",
  api: "API (usepolia.com.br)",
  emails: "E-mails",
  ia: "IA",
};

async function medir<T>(
  fn: () => PromiseLike<T>,
): Promise<{ ms: number; valor?: T; erro?: unknown }> {
  const t0 = Date.now();
  try {
    const valor = await fn();
    return { ms: Date.now() - t0, valor };
  } catch (erro) {
    return { ms: Date.now() - t0, erro };
  }
}

async function checarBancoDados(): Promise<ServicoChecado> {
  const r = await medir(() =>
    supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" }).limit(1),
  );
  const falhou = Boolean(r.erro) || Boolean((r.valor as { error?: unknown })?.error);
  return {
    service: "banco_dados",
    label: LABEL_SERVICO.banco_dados,
    status: falhou ? "critico" : r.ms > 1500 ? "atencao" : "operacional",
    detalhe: falhou ? "Consulta de teste em profiles falhou." : `Consulta de teste em ${r.ms}ms.`,
    latenciaMs: r.ms,
  };
}

async function checarAutenticacao(): Promise<ServicoChecado> {
  const r = await medir(() => supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }));
  const falhou = Boolean(r.erro) || Boolean((r.valor as { error?: unknown })?.error);
  return {
    service: "autenticacao",
    label: LABEL_SERVICO.autenticacao,
    status: falhou ? "critico" : r.ms > 1500 ? "atencao" : "operacional",
    detalhe: falhou ? "Listagem de teste no Auth falhou." : `Resposta do Auth em ${r.ms}ms.`,
    latenciaMs: r.ms,
  };
}

async function checarStorage(): Promise<ServicoChecado> {
  const r = await medir(() => supabaseAdmin.storage.listBuckets());
  const falhou = Boolean(r.erro) || Boolean((r.valor as { error?: unknown })?.error);
  return {
    service: "storage",
    label: LABEL_SERVICO.storage,
    status: falhou ? "critico" : r.ms > 1500 ? "atencao" : "operacional",
    detalhe: falhou ? "Listagem de buckets falhou." : `Storage respondeu em ${r.ms}ms.`,
    latenciaMs: r.ms,
  };
}

async function checarPagamentos(): Promise<ServicoChecado> {
  const r = await medir(() => stripeClient().balance.retrieve());
  const falhou = Boolean(r.erro);
  return {
    service: "pagamentos",
    label: LABEL_SERVICO.pagamentos,
    status: falhou ? "critico" : r.ms > 2000 ? "atencao" : "operacional",
    detalhe: falhou
      ? "Chamada de teste ao Stripe (balance) falhou."
      : `Stripe respondeu em ${r.ms}ms.`,
    latenciaMs: r.ms,
  };
}

async function checarApiPublica(): Promise<ServicoChecado> {
  const r = await medir(async () => {
    const resp = await fetch("https://usepolia.com.br/", {
      method: "GET",
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) throw new Error(`status ${resp.status}`);
    return resp.status;
  });
  const falhou = Boolean(r.erro);
  return {
    service: "api",
    label: LABEL_SERVICO.api,
    status: falhou ? "critico" : r.ms > 3000 ? "atencao" : "operacional",
    detalhe: falhou ? "usepolia.com.br não respondeu 200 a tempo." : `Respondeu em ${r.ms}ms.`,
    latenciaMs: r.ms,
  };
}

// E-mails (Resend) e IA rodam no polia-app, não no polia-admin — sem a chave
// configurada aqui, checar de verdade exigiria duplicar credencial noutro
// projeto. Melhor mostrar "sem dados" (estado previsto no direcionamento) do
// que fingir um ping que não existe.
function semVerificacao(service: "emails" | "ia"): ServicoChecado {
  return {
    service,
    label: LABEL_SERVICO[service],
    status: "sem_dados",
    detalhe: "Sem verificação automática ainda — a chave desse serviço vive no polia-app.",
    latenciaMs: null,
  };
}

async function rodarHealthChecks(): Promise<ServicoChecado[]> {
  const [banco, auth, storage, pagamentos, api] = await Promise.all([
    checarBancoDados(),
    checarAutenticacao(),
    checarStorage(),
    checarPagamentos(),
    checarApiPublica(),
  ]);
  return [api, banco, auth, pagamentos, storage, semVerificacao("emails"), semVerificacao("ia")];
}

function inicioDoDiaBR(offsetDias = 0): string {
  // America/Sao_Paulo é UTC-3 o ano inteiro (sem horário de verão desde 2019).
  const agora = new Date(Date.now() - offsetDias * 86400000);
  const dataBR = new Date(agora.getTime() - 3 * 3600000);
  return dataBR.toISOString().slice(0, 10);
}

interface NumerosPeriodo {
  novasContas: number;
  usuariasAtivas: number;
  errosNoPeriodo: number;
  churnPct: number | null;
}

async function calcularNumeros(diasPeriodo: number): Promise<{
  usuariasTotal: number;
  assinantes: number;
  mrrCentavos: number;
  periodo: NumerosPeriodo;
}> {
  const cutoff = new Date(Date.now() - Math.max(diasPeriodo, 1) * 86400000).toISOString();

  const [
    { count: usuariasTotal },
    { count: novasContas },
    { count: usuariasAtivas },
    { count: errosNoPeriodo },
    { data: assinaturas },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { head: true, count: "exact" }),
    supabaseAdmin
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .gte("created_at", cutoff),
    supabaseAdmin
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .gte("updated_at", cutoff),
    supabaseAdmin
      .from("erros_app")
      .select("id", { head: true, count: "exact" })
      .gte("criado_em", cutoff),
    supabaseAdmin.from("assinaturas").select("price_id, status, updated_at"),
  ]);

  const linhas = (assinaturas ?? []) as { price_id: string; status: string; updated_at: string }[];
  const ativas = linhas.filter((a) => STATUS_ATIVOS.includes(a.status));
  const canceladasNoPeriodo = linhas.filter(
    (a) => a.status === "canceled" && a.updated_at >= cutoff,
  );

  const porPriceId = new Map<string, number>();
  ativas.forEach((a) => porPriceId.set(a.price_id, (porPriceId.get(a.price_id) ?? 0) + 1));

  let mrrCentavos = 0;
  if (porPriceId.size > 0) {
    const stripe = stripeClient();
    for (const [priceId, quantidade] of porPriceId.entries()) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        mrrCentavos += (price.unit_amount ?? 0) * quantidade;
      } catch (err) {
        console.error(`[Founder] Falha ao buscar price ${priceId} no Stripe:`, err);
      }
    }
  }

  const baseChurn = ativas.length + canceladasNoPeriodo.length;
  const churnPct = baseChurn > 0 ? (canceladasNoPeriodo.length / baseChurn) * 100 : null;

  return {
    usuariasTotal: usuariasTotal ?? 0,
    assinantes: ativas.length,
    mrrCentavos,
    periodo: {
      novasContas: novasContas ?? 0,
      usuariasAtivas: usuariasAtivas ?? 0,
      errosNoPeriodo: errosNoPeriodo ?? 0,
      churnPct,
    },
  };
}

export interface FounderAlerta {
  id: string;
  tipo: string;
  severidade: "atencao" | "critico";
  titulo: string;
  mensagem: string | null;
  detalhes: Json;
  link: string | null;
  criadoEm: string;
}

interface SnapshotDiario {
  dia: string;
  usuarias_total: number;
  novas_contas: number;
  usuarias_ativas: number;
  assinantes: number;
  mrr_centavos: number;
  churn_pct: number | null;
  erros_dia: number;
}

async function avaliarEPersistirAlertas(
  servicos: ServicoChecado[],
  numerosHoje: Awaited<ReturnType<typeof calcularNumeros>>,
  mediaErros7d: number | null,
): Promise<void> {
  const { data: abertosData } = await supabaseAdmin
    .from("founder_alertas")
    .select("id, tipo")
    .eq("status", "aberto");
  const abertos = (abertosData ?? []) as { id: string; tipo: string }[];
  const tipoAberto = (tipo: string) => abertos.find((a) => a.tipo === tipo);

  const novos: {
    tipo: string;
    severidade: "atencao" | "critico";
    titulo: string;
    mensagem: string;
    detalhes: Json;
    link: string | null;
  }[] = [];
  const resolverTipos: string[] = [];

  for (const s of servicos) {
    const tipo = `servico_indisponivel:${s.service}`;
    if (s.status === "critico" && !tipoAberto(tipo)) {
      novos.push({
        tipo,
        severidade: "critico",
        titulo: `Serviço indisponível: ${s.label}`,
        mensagem: s.detalhe ?? "",
        detalhes: { service: s.service, latenciaMs: s.latenciaMs } satisfies Json,
        link: null,
      });
    } else if (s.status !== "critico" && tipoAberto(tipo)) {
      resolverTipos.push(tipo);
    }
  }

  if (mediaErros7d !== null && mediaErros7d >= 1) {
    const tipo = "erro_taxa_alta";
    const limite = Math.max(10, mediaErros7d * 3);
    if (numerosHoje.periodo.errosNoPeriodo > limite && !tipoAberto(tipo)) {
      novos.push({
        tipo,
        severidade: numerosHoje.periodo.errosNoPeriodo > mediaErros7d * 5 ? "critico" : "atencao",
        titulo: "Taxa de erro acima do normal",
        mensagem: `${numerosHoje.periodo.errosNoPeriodo} erro(s) nas últimas 24h, média dos últimos 7 dias era ${mediaErros7d.toFixed(1)}.`,
        detalhes: { erros24h: numerosHoje.periodo.errosNoPeriodo, mediaErros7d } satisfies Json,
        link: null,
      });
    } else if (numerosHoje.periodo.errosNoPeriodo <= limite && tipoAberto(tipo)) {
      resolverTipos.push(tipo);
    }
  }

  const { count: pagamentosFalhos } = await supabaseAdmin
    .from("assinaturas")
    .select("id", { head: true, count: "exact" })
    .in("status", ["past_due", "unpaid"]);
  const tipoPagamento = "falha_pagamento";
  if ((pagamentosFalhos ?? 0) > 0 && !tipoAberto(tipoPagamento)) {
    novos.push({
      tipo: tipoPagamento,
      severidade: "atencao",
      titulo: "Assinatura(s) com pagamento pendente",
      mensagem: `${pagamentosFalhos} assinatura(s) com status past_due/unpaid.`,
      detalhes: { quantidade: pagamentosFalhos ?? 0 } satisfies Json,
      link: "/negocio",
    });
  } else if ((pagamentosFalhos ?? 0) === 0 && tipoAberto(tipoPagamento)) {
    resolverTipos.push(tipoPagamento);
  }

  if (novos.length > 0) {
    await supabaseAdmin.from("founder_alertas").insert(novos);
  }
  if (resolverTipos.length > 0) {
    await supabaseAdmin
      .from("founder_alertas")
      .update({ status: "resolvido", resolvido_em: new Date().toISOString() })
      .eq("status", "aberto")
      .in("tipo", resolverTipos);
  }
}

export interface FounderOverview {
  atualizadoEm: string;
  servicos: ServicoChecado[];
  numeros: {
    usuariasTotal: number;
    assinantes: number;
    mrrCentavos: number;
  };
  periodos: Record<"1" | "7" | "30" | "90", NumerosPeriodo>;
  alertas: FounderAlerta[];
  pulso: string;
}

export const getFounderOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FounderOverview> => {
    await assertAdmin(context.userId);

    const servicos = await rodarHealthChecks();
    await supabaseAdmin.from("founder_service_checks").insert(
      servicos.map((s) => ({
        service: s.service,
        status: s.status,
        detalhe: s.detalhe,
        latencia_ms: s.latenciaMs,
      })),
    );

    const [num1, num7, num30, num90] = await Promise.all([
      calcularNumeros(1),
      calcularNumeros(7),
      calcularNumeros(30),
      calcularNumeros(90),
    ]);

    const hojeBR = inicioDoDiaBR(0);
    const seteDiasAtrasBR = inicioDoDiaBR(7);

    const [{ data: snapshotAnterior }, { data: historico7d }] = await Promise.all([
      supabaseAdmin
        .from("founder_metricas_diarias")
        .select("*")
        .eq("dia", seteDiasAtrasBR)
        .maybeSingle(),
      supabaseAdmin
        .from("founder_metricas_diarias")
        .select("erros_dia")
        .gte("dia", inicioDoDiaBR(7))
        .lt("dia", hojeBR),
    ]);

    const historicoErros = ((historico7d ?? []) as { erros_dia: number }[]).map((h) => h.erros_dia);
    const mediaErros7d =
      historicoErros.length >= 3
        ? historicoErros.reduce((s, v) => s + v, 0) / historicoErros.length
        : null;

    await avaliarEPersistirAlertas(servicos, num1, mediaErros7d);

    const snapshotHoje: SnapshotDiario = {
      dia: hojeBR,
      usuarias_total: num1.usuariasTotal,
      novas_contas: num1.periodo.novasContas,
      usuarias_ativas: num1.periodo.usuariasAtivas,
      assinantes: num1.assinantes,
      mrr_centavos: num1.mrrCentavos,
      churn_pct: num1.periodo.churnPct,
      erros_dia: num1.periodo.errosNoPeriodo,
    };
    await supabaseAdmin
      .from("founder_metricas_diarias")
      .upsert(snapshotHoje, { onConflict: "dia" });

    const { data: alertasAbertosData } = await supabaseAdmin
      .from("founder_alertas")
      .select("*")
      .eq("status", "aberto")
      .order("criado_em", { ascending: false });
    const alertas: FounderAlerta[] = (
      (alertasAbertosData ?? []) as {
        id: string;
        tipo: string;
        severidade: "atencao" | "critico";
        titulo: string;
        mensagem: string | null;
        detalhes: Json;
        link: string | null;
        criado_em: string;
      }[]
    ).map((a) => ({
      id: a.id,
      tipo: a.tipo,
      severidade: a.severidade,
      titulo: a.titulo,
      mensagem: a.mensagem,
      detalhes: a.detalhes,
      link: a.link,
      criadoEm: a.criado_em,
    }));

    const servicosCriticos = servicos.filter((s) => s.status === "critico");
    const servicosAtencao = servicos.filter((s) => s.status === "atencao");

    const partesPulso: string[] = [];
    if (servicosCriticos.length === 0 && servicosAtencao.length === 0 && alertas.length === 0) {
      partesPulso.push("Tudo funcionando.");
    } else {
      if (servicosCriticos.length > 0) {
        partesPulso.push(
          `${servicosCriticos.length} serviço(s) indisponível(is): ${servicosCriticos.map((s) => s.label).join(", ")}.`,
        );
      }
      if (servicosAtencao.length > 0) {
        partesPulso.push(`${servicosAtencao.length} serviço(s) merecendo atenção.`);
      }
    }
    partesPulso.push(
      snapshotAnterior
        ? `${num1.usuariasTotal} usuárias no total (${
            num1.usuariasTotal - (snapshotAnterior as { usuarias_total: number }).usuarias_total >=
            0
              ? "+"
              : ""
          }${num1.usuariasTotal - (snapshotAnterior as { usuarias_total: number }).usuarias_total} nos últimos 7 dias).`
        : `${num1.usuariasTotal} usuárias no total (ainda sem histórico de 7 dias pra comparar).`,
    );
    if (alertas.length > 0) {
      partesPulso.push(`${alertas.length} coisa(s) precisam da sua atenção.`);
    } else {
      partesPulso.push("Nenhum alerta aberto.");
    }

    return {
      atualizadoEm: new Date().toISOString(),
      servicos,
      numeros: {
        usuariasTotal: num1.usuariasTotal,
        assinantes: num1.assinantes,
        mrrCentavos: num1.mrrCentavos,
      },
      periodos: {
        "1": num1.periodo,
        "7": num7.periodo,
        "30": num30.periodo,
        "90": num90.periodo,
      },
      alertas,
      pulso: partesPulso.join(" "),
    };
  });
