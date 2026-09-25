import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// "Conta de Anúncios Pólia", business meuinstavendedor — ver
// polia_meta_ads_business_set2026 na memória. Não é segredo, só um ID
// numérico; o token que autoriza a leitura fica em META_ADS_ACCESS_TOKEN
// (secret do Worker, gerado pelo "Conversions API System User").
const AD_ACCOUNT_ID = "248078714423030";
const GRAPH_VERSION = "v21.0";
const GRAPH_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

function metaAdsAccessToken(): string {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token) throw new Error("META_ADS_ACCESS_TOKEN não está configurado neste Worker.");
  return token;
}

async function chamarGraph<T>(caminho: string): Promise<T> {
  const resp = await fetch(`${GRAPH_URL}${caminho}`, {
    headers: { Authorization: `Bearer ${metaAdsAccessToken()}` },
  });
  const dados = (await resp.json()) as T & { error?: { message: string } };
  if (!resp.ok || dados.error) {
    throw new Error(
      `Meta Ads recusou a chamada: ${dados.error?.message ?? `status ${resp.status}`}`,
    );
  }
  return dados;
}

function contarLeads(actions: { action_type: string; value: string }[] | undefined): number {
  if (!actions) return 0;
  // "lead" cobre o evento padrão do Pixel; "offsite_conversion.fb_pixel_lead"
  // é como o mesmo evento às vezes aparece detalhado por fonte.
  return actions
    .filter((a) => a.action_type.toLowerCase().includes("lead"))
    .reduce((soma, a) => soma + (Number(a.value) || 0), 0);
}

export interface CampanhaMeta {
  id: string;
  nome: string;
  status: string;
  statusEfetivo: string;
  objetivo: string;
  orcamentoDiario: number | null;
  orcamentoTotal: number | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  ctr: number;
  cpc: number;
  leads: number;
  custoPorLead: number | null;
  atualizadoEm: string | null;
}

interface CampanhaGraph {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
  updated_time?: string;
}

interface InsightGraph {
  campaign_id: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  actions?: { action_type: string; value: string }[];
}

export type TipoAlerta = "sem_lead" | "cpl_alto" | "pausada_ha_tempo";

export interface Alerta {
  campanhaId: string;
  campanhaNome: string;
  tipo: TipoAlerta;
  gasto?: number;
  custoPorLead?: number;
  cplMedioConta?: number;
  diasParada?: number;
}

// Regras simples, direto dos dados que já vêm no fetch de 30 dias — sem
// chamada extra à Graph API. Limiares fixos de propósito (é 1 conta de
// anúncios pequena); se a Sil escalar tráfego, isso pode virar configurável.
const GASTO_MINIMO_PARA_ALERTA = 20; // R$20 gastos sem lead já é sinal de atenção
const MULTIPLICADOR_CPL_ALTO = 1.5;
const DIAS_PARADA_PARA_ALERTA = 30;

function calcularAlertas(campanhas: CampanhaMeta[], cplMedioConta: number | null): Alerta[] {
  const alertas: Alerta[] = [];
  const agora = Date.now();

  for (const c of campanhas) {
    if (c.statusEfetivo === "ACTIVE" && c.gasto >= GASTO_MINIMO_PARA_ALERTA && c.leads === 0) {
      alertas.push({ campanhaId: c.id, campanhaNome: c.nome, tipo: "sem_lead", gasto: c.gasto });
    }

    if (
      c.custoPorLead !== null &&
      cplMedioConta !== null &&
      cplMedioConta > 0 &&
      c.custoPorLead > cplMedioConta * MULTIPLICADOR_CPL_ALTO
    ) {
      alertas.push({
        campanhaId: c.id,
        campanhaNome: c.nome,
        tipo: "cpl_alto",
        custoPorLead: c.custoPorLead,
        cplMedioConta,
      });
    }

    if ((c.statusEfetivo === "PAUSED" || c.statusEfetivo === "CAMPAIGN_PAUSED") && c.atualizadoEm) {
      const dias = Math.floor((agora - new Date(c.atualizadoEm).getTime()) / 86_400_000);
      if (dias >= DIAS_PARADA_PARA_ALERTA) {
        alertas.push({
          campanhaId: c.id,
          campanhaNome: c.nome,
          tipo: "pausada_ha_tempo",
          diasParada: dias,
        });
      }
    }
  }

  return alertas;
}

export const listarCampanhasMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [campanhasResp, insightsResp] = await Promise.all([
      chamarGraph<{ data: CampanhaGraph[] }>(
        `/act_${AD_ACCOUNT_ID}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,updated_time&limit=100`,
      ),
      // date_preset=last_30d: mesma janela que os cards de resumo do
      // Gerenciador de Anúncios mostram por padrão.
      chamarGraph<{ data: InsightGraph[] }>(
        `/act_${AD_ACCOUNT_ID}/insights?level=campaign&fields=campaign_id,spend,impressions,clicks,ctr,cpc,actions&date_preset=last_30d&limit=100`,
      ),
    ]);

    const insightsPorCampanha = new Map(insightsResp.data.map((i) => [i.campaign_id, i]));

    const campanhas: CampanhaMeta[] = campanhasResp.data.map((c) => {
      const insight = insightsPorCampanha.get(c.id);
      const gasto = Number(insight?.spend ?? 0);
      const leads = contarLeads(insight?.actions);
      return {
        id: c.id,
        nome: c.name,
        status: c.status,
        statusEfetivo: c.effective_status,
        objetivo: c.objective,
        // Graph devolve orçamento em centavos.
        orcamentoDiario: c.daily_budget ? Number(c.daily_budget) / 100 : null,
        orcamentoTotal: c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        gasto,
        impressoes: Number(insight?.impressions ?? 0),
        cliques: Number(insight?.clicks ?? 0),
        ctr: Number(insight?.ctr ?? 0),
        cpc: Number(insight?.cpc ?? 0),
        leads,
        custoPorLead: leads > 0 ? gasto / leads : null,
        atualizadoEm: c.updated_time ?? null,
      };
    });

    campanhas.sort((a, b) => b.gasto - a.gasto);

    const gastoTotal = campanhas.reduce((soma, c) => soma + c.gasto, 0);
    const leadsTotal = campanhas.reduce((soma, c) => soma + c.leads, 0);
    const cplMedioConta = leadsTotal > 0 ? gastoTotal / leadsTotal : null;

    return {
      campanhas,
      resumo: {
        gastoTotal,
        leadsTotal,
        campanhasAtivas: campanhas.filter((c) => c.statusEfetivo === "ACTIVE").length,
        cplMedioConta,
      },
      alertas: calcularAlertas(campanhas, cplMedioConta),
      atualizadoEm: new Date().toISOString(),
    };
  });

export interface PontoDiario {
  dia: string;
  gasto: number;
  leads: number;
}

export interface ComparacaoPeriodo {
  gastoAtual: number;
  gastoAnterior: number;
  leadsAtual: number;
  leadsAnterior: number;
}

interface InsightDiarioGraph {
  date_start: string;
  spend?: string;
  actions?: { action_type: string; value: string }[];
}

function dataISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// 60 dias em UMA chamada (level=account, time_increment=1): os últimos 30 vão
// pro gráfico, os 30 anteriores só servem de referência pra comparação —
// nunca aparecem sozinhos na tela.
export const obterTendenciaMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setUTCDate(ontem.getUTCDate() - 1);
    const inicio = new Date(hoje);
    inicio.setUTCDate(inicio.getUTCDate() - 60);

    const timeRange = JSON.stringify({ since: dataISO(inicio), until: dataISO(ontem) });
    const resp = await chamarGraph<{ data: InsightDiarioGraph[] }>(
      `/act_${AD_ACCOUNT_ID}/insights?level=account&time_increment=1&fields=spend,actions&time_range=${encodeURIComponent(timeRange)}&limit=60`,
    );

    const porDia = new Map(
      resp.data.map((d) => [
        d.date_start,
        { gasto: Number(d.spend ?? 0), leads: contarLeads(d.actions) },
      ]),
    );

    // Preenche os 60 dias mesmo sem dado (dia sem gasto não aparece na
    // resposta da Graph, e um buraco no gráfico pareceria bug).
    const dias: PontoDiario[] = [];
    for (let i = 59; i >= 0; i -= 1) {
      const d = new Date(ontem);
      d.setUTCDate(d.getUTCDate() - i);
      const chave = dataISO(d);
      const v = porDia.get(chave);
      dias.push({ dia: chave, gasto: v?.gasto ?? 0, leads: v?.leads ?? 0 });
    }

    const ultimos30 = dias.slice(30);
    const anteriores30 = dias.slice(0, 30);
    const somar = (arr: PontoDiario[], campo: "gasto" | "leads") =>
      arr.reduce((soma, p) => soma + p[campo], 0);

    const comparacao: ComparacaoPeriodo = {
      gastoAtual: somar(ultimos30, "gasto"),
      gastoAnterior: somar(anteriores30, "gasto"),
      leadsAtual: somar(ultimos30, "leads"),
      leadsAnterior: somar(anteriores30, "leads"),
    };

    return { diario: ultimos30, comparacao };
  });

export interface AnuncioMeta {
  id: string;
  nome: string;
  status: string;
  thumbnailUrl: string | null;
  titulo: string | null;
  gasto: number;
  impressoes: number;
  cliques: number;
  leads: number;
  custoPorLead: number | null;
}

interface AnuncioGraph {
  id: string;
  name: string;
  status: string;
  creative?: { thumbnail_url?: string; title?: string };
}

interface InsightAdGraph {
  ad_id: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: { action_type: string; value: string }[];
}

export const listarAnunciosDaCampanha = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ campanhaId: z.string().min(1) }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const [anunciosResp, insightsResp] = await Promise.all([
      chamarGraph<{ data: AnuncioGraph[] }>(
        `/${data.campanhaId}/ads?fields=id,name,status,creative{thumbnail_url,title}&limit=100`,
      ),
      chamarGraph<{ data: InsightAdGraph[] }>(
        `/${data.campanhaId}/insights?level=ad&fields=ad_id,spend,impressions,clicks,actions&date_preset=last_30d&limit=100`,
      ),
    ]);

    const insightsPorAnuncio = new Map(insightsResp.data.map((i) => [i.ad_id, i]));

    const anuncios: AnuncioMeta[] = anunciosResp.data.map((a) => {
      const insight = insightsPorAnuncio.get(a.id);
      const gasto = Number(insight?.spend ?? 0);
      const leads = contarLeads(insight?.actions);
      return {
        id: a.id,
        nome: a.name,
        status: a.status,
        thumbnailUrl: a.creative?.thumbnail_url ?? null,
        titulo: a.creative?.title ?? null,
        gasto,
        impressoes: Number(insight?.impressions ?? 0),
        cliques: Number(insight?.clicks ?? 0),
        leads,
        custoPorLead: leads > 0 ? gasto / leads : null,
      };
    });

    anuncios.sort((a, b) => b.gasto - a.gasto);
    return { anuncios };
  });
