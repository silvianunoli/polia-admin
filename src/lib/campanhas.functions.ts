import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  campanhaPadrao,
  ehAssinante,
  extrairOrigem,
  filtrarCadastros,
  gastoDaCampanha,
  janelaDoPeriodo,
  listarCampanhas,
  montarLinhas,
  somarTotais,
  TODAS,
  type CadastroCampanha,
  type GastoMeta,
  type Janela,
  type OrigemAnuncio,
} from "@/lib/campanhas-funil";

// Painel /campanhas: funil dos anúncios (cadastro, onboarding, preço
// calculado, assinatura) por utm_content, com o gasto do Meta ao lado quando
// houver token. A conta de agregação mora em campanhas-funil.ts (pura, com
// teste); aqui só busca. Nada de e-mail ou nome sai deste arquivo: o
// listUsers devolve e-mail, mas só id, data e origem seguem adiante.

const AD_ACCOUNT_ID = "248078714423030"; // Conta de Anúncios Pólia, mesmo ID de meta-ads.functions.ts
const GRAPH_URL = "https://graph.facebook.com/v21.0";
const POR_PAGINA_USUARIAS = 1000;
const LOTE_IDS = 100; // .in() com mais que isso estoura o tamanho da URL do PostgREST

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

interface ContaComOrigem extends OrigemAnuncio {
  id: string;
  criadoEm: string;
}

async function contasDeCampanha(): Promise<ContaComOrigem[]> {
  const contas: ContaComOrigem[] = [];
  for (let pagina = 1; pagina <= 100; pagina += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: pagina,
      perPage: POR_PAGINA_USUARIAS,
    });
    if (error) throw new Error("Falha ao ler as contas.");
    const usuarias = data?.users ?? [];
    for (const u of usuarias) {
      const origem = extrairOrigem(u.user_metadata);
      if (origem) contas.push({ id: u.id, criadoEm: u.created_at, ...origem });
    }
    if (usuarias.length < POR_PAGINA_USUARIAS) break;
  }
  return contas;
}

function emLotes<T>(itens: T[], tamanho: number): T[][] {
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  return lotes;
}

async function perfisPorId(ids: string[]) {
  const mapa = new Map<string, { onboarding: boolean; plano: string | null }>();
  for (const lote of emLotes(ids, LOTE_IDS)) {
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .select("id, onboarding_completed, plano")
      .in("id", lote);
    if (error) throw new Error("Falha ao ler os perfis.");
    for (const p of (data ?? []) as {
      id: string;
      onboarding_completed: boolean | null;
      plano: string | null;
    }[]) {
      mapa.set(p.id, { onboarding: !!p.onboarding_completed, plano: p.plano });
    }
  }
  return mapa;
}

// Ativação real: produto salvo pela calculadora. Produto sem
// calculadora_breakdown é item que o planejamento cria sozinho e não conta.
async function quemCalculouPreco(ids: string[]): Promise<Set<string>> {
  const quem = new Set<string>();
  for (const lote of emLotes(ids, LOTE_IDS)) {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabaseAdmin
        .from("produtos")
        .select("user_id")
        .in("user_id", lote)
        .not("calculadora_breakdown", "is", null)
        .range(de, de + 999);
      if (error) throw new Error("Falha ao ler os produtos.");
      const linhas = (data ?? []) as { user_id: string }[];
      for (const r of linhas) quem.add(r.user_id);
      if (linhas.length < 1000) break;
    }
  }
  return quem;
}

export type EstadoMeta =
  { estado: "desconectado" } | { estado: "erro"; mensagem: string } | { estado: "ok" };

interface InsightAd {
  ad_name?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
}

// META_ADS_READ_TOKEN é o secret próprio deste painel (leitura de insights).
// Sem ele, tenta o META_ADS_ACCESS_TOKEN que o /trafego já usa, porque é a
// mesma conta de anúncios. Nenhum dos dois existindo, o painel segue sem
// gasto e avisa. O token nunca sai do servidor nem entra em mensagem.
function tokenMeta(): string | null {
  return process.env.META_ADS_READ_TOKEN || process.env.META_ADS_ACCESS_TOKEN || null;
}

async function gastoMeta(
  janela: Janela,
): Promise<{ gastos: GastoMeta[] | null; meta: EstadoMeta }> {
  const token = tokenMeta();
  if (!token) return { gastos: null, meta: { estado: "desconectado" } };

  const params = new URLSearchParams({
    level: "ad",
    fields: "ad_name,campaign_name,spend,impressions,clicks",
    limit: "500",
  });
  if (janela.since) {
    params.set("time_range", JSON.stringify({ since: janela.since, until: janela.until }));
  } else {
    params.set("date_preset", "maximum");
  }

  try {
    const gastos: GastoMeta[] = [];
    let url: string | null = `${GRAPH_URL}/act_${AD_ACCOUNT_ID}/insights?${params}`;
    for (let pagina = 0; url && pagina < 20; pagina += 1) {
      const resp: Response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      const corpo = (await resp.json()) as {
        data?: InsightAd[];
        paging?: { next?: string };
        error?: { message?: string };
      };
      if (!resp.ok || corpo.error) {
        console.error("[Campanhas] Meta recusou", resp.status, corpo.error?.message);
        return {
          gastos: null,
          meta: {
            estado: "erro",
            mensagem: `O Meta recusou a leitura do gasto (status ${resp.status}).`,
          },
        };
      }
      for (const i of corpo.data ?? []) {
        gastos.push({
          anuncio: i.ad_name ?? "",
          campanhaMeta: i.campaign_name ?? "",
          gasto: Number(i.spend ?? 0) || 0,
          impressoes: Number(i.impressions ?? 0) || 0,
          cliques: Number(i.clicks ?? 0) || 0,
        });
      }
      const proxima = corpo.paging?.next;
      url = proxima && proxima.startsWith("https://graph.facebook.com/") ? proxima : null;
    }
    return { gastos, meta: { estado: "ok" } };
  } catch (e) {
    console.error("[Campanhas] falha ao chamar o Meta", e);
    return {
      gastos: null,
      meta: { estado: "erro", mensagem: "O Meta não respondeu a tempo." },
    };
  }
}

const entradaSchema = z.object({
  campanha: z.string().trim().max(120).optional(),
  periodo: z.enum(["7", "30", "tudo"]).default("30"),
});

export const getFunilCampanhas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => entradaSchema.parse(input ?? {}))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const janela = janelaDoPeriodo(data.periodo);
    const [contas, meta] = await Promise.all([contasDeCampanha(), gastoMeta(janela)]);

    const campanhas = listarCampanhas(contas);
    const pedida = data.campanha;
    const campanha =
      pedida && (pedida === TODAS || campanhas.some((c) => c.campanha === pedida))
        ? pedida
        : campanhaPadrao(campanhas);

    const doRecorte = filtrarCadastros(contas, campanha, janela.iniMs);
    const ids = doRecorte.map((c) => c.id);
    const [perfis, calcularam] = await Promise.all([perfisPorId(ids), quemCalculouPreco(ids)]);

    const cadastros: CadastroCampanha[] = doRecorte.map((c) => {
      const p = perfis.get(c.id);
      return {
        campanha: c.campanha,
        anuncio: c.anuncio,
        criadoEm: c.criadoEm,
        fezOnboarding: p?.onboarding ?? false,
        calculouPreco: calcularam.has(c.id),
        assinante: ehAssinante(p?.plano),
      };
    });

    // Anúncios que essa campanha já teve em qualquer época: é o que liga o
    // ad_name do Meta à campanha quando o nome dela no Meta não é a UTM.
    const anunciosConhecidos = new Set(
      contas.filter((c) => campanha === TODAS || c.campanha === campanha).map((c) => c.anuncio),
    );
    const gastos = meta.gastos ? gastoDaCampanha(meta.gastos, campanha, anunciosConhecidos) : null;

    const linhas = montarLinhas(cadastros, gastos);
    return {
      campanha,
      periodo: data.periodo,
      campanhas: campanhas.map((c) => ({ campanha: c.campanha, cadastros: c.cadastros })),
      totais: somarTotais(linhas, gastos !== null),
      linhas,
      meta: meta.meta,
      atualizadoEm: new Date().toISOString(),
    };
  });
