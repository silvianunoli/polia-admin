import { createServerFn } from "@tanstack/react-start";
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
}

interface CampanhaGraph {
  id: string;
  name: string;
  status: string;
  effective_status: string;
  objective: string;
  daily_budget?: string;
  lifetime_budget?: string;
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

export const listarCampanhasMeta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [campanhasResp, insightsResp] = await Promise.all([
      chamarGraph<{ data: CampanhaGraph[] }>(
        `/act_${AD_ACCOUNT_ID}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget&limit=100`,
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
      };
    });

    campanhas.sort((a, b) => b.gasto - a.gasto);

    return {
      campanhas,
      resumo: {
        gastoTotal: campanhas.reduce((soma, c) => soma + c.gasto, 0),
        leadsTotal: campanhas.reduce((soma, c) => soma + c.leads, 0),
        campanhasAtivas: campanhas.filter((c) => c.statusEfetivo === "ACTIVE").length,
      },
      atualizadoEm: new Date().toISOString(),
    };
  });
