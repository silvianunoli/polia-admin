import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { stripeClient } from "@/lib/stripe.functions";

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

const STATUS_ATIVOS = ["active", "trialing", "past_due"];

export interface PlanoResumo {
  priceId: string;
  plano: "mensal" | "anual" | "desconhecido";
  quantidade: number;
  valorMensalCentavos: number;
}

export const getResumoMonetizacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: assinaturas } = await supabaseAdmin
      .from("assinaturas" as never)
      .select("price_id, status")
      .in("status", STATUS_ATIVOS);

    const rows = (assinaturas ?? []) as { price_id: string; status: string }[];
    const porPriceId = new Map<string, number>();
    rows.forEach((r) => porPriceId.set(r.price_id, (porPriceId.get(r.price_id) ?? 0) + 1));

    const priceIdMensal = process.env.STRIPE_PRICE_ID_MENSAL;
    const priceIdAnual = process.env.STRIPE_PRICE_ID_ANUAL;

    const stripe = stripeClient();
    const porPlano: PlanoResumo[] = [];
    for (const [priceId, quantidade] of porPriceId.entries()) {
      let valorMensalCentavos = 0;
      let plano: PlanoResumo["plano"] = "desconhecido";
      try {
        const price = await stripe.prices.retrieve(priceId);
        const valor = price.unit_amount ?? 0;
        if (priceId === priceIdAnual) {
          plano = "anual";
          valorMensalCentavos = Math.round(valor / 12);
        } else if (priceId === priceIdMensal) {
          plano = "mensal";
          valorMensalCentavos = valor;
        } else {
          valorMensalCentavos = valor;
        }
      } catch (err) {
        console.error(`[Negócio] Falha ao buscar price ${priceId} no Stripe:`, err);
      }
      porPlano.push({ priceId, plano, quantidade, valorMensalCentavos });
    }

    const mrrCentavos = porPlano.reduce((s, p) => s + p.valorMensalCentavos * p.quantidade, 0);
    const assinantesAtivas = rows.length;

    return { mrrCentavos, assinantesAtivas, porPlano };
  });

// Eventos que marcam cada degrau real do funil de ativação — nomes vêm de
// track() no polia-app (src/lib/analytics.ts), não são inventados aqui.
const EVENTOS_ONBOARDING = ["onboarding_concluido"];
const EVENTOS_PRIMEIRO_NEGOCIO = ["produto_criado", "onboarding_primeiro_produto"];
const EVENTOS_USO_REAL = ["venda_registrada", "cliente_criado", "venda_produto_registrada"];
const EVENTOS_ATIVACAO = [...EVENTOS_ONBOARDING, ...EVENTOS_PRIMEIRO_NEGOCIO, ...EVENTOS_USO_REAL];
// pageview/click são ruído de navegação, não uso de feature — mesma exclusão
// que a tela /analytics já aplica pro "uso por feature".
const EVENTOS_AUTOMATICOS = new Set(["pageview", "click"]);

export interface FunilAtivacao {
  totalCadastros: number;
  completaramOnboarding: number;
  criaramPrimeiroNegocio: number;
  usaramFuncionalidade: number;
  voltaramEm7Dias: number;
  recorrentes: number;
}

export interface UsuariaResumo {
  id: string;
  nome: string;
  ultimaAtividade: string | null;
}

export interface SegmentosUso {
  assinantesSemUsoTotal: number;
  assinantesSemUso: UsuariaResumo[];
  gratuitasEngajadasTotal: number;
  gratuitasEngajadas: UsuariaResumo[];
  emRiscoTotal: number;
  emRisco: UsuariaResumo[];
  altamenteEngajadasTotal: number;
  altamenteEngajadas: UsuariaResumo[];
}

export interface FeatureUso {
  evento: string;
  usuariasUnicas: number;
  total: number;
}

export interface ResumoNumeros {
  funil: FunilAtivacao;
  segmentos: SegmentosUso;
  featuresTop: FeatureUso[];
  ativasSemanaAtual: number;
  ativasSemanaAnterior: number;
}

type ProfileLinha = {
  id: string;
  full_name: string | null;
  created_at: string;
  updated_at: string;
};
type EventoLinha = { user_id: string | null; evento: string; criado_em: string };

export const getResumoNumeros = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumoNumeros> => {
    await assertAdmin(context.userId);

    const agora = Date.now();
    const dia7 = new Date(agora - 7 * 86400000).toISOString();
    const dia14 = new Date(agora - 14 * 86400000).toISOString();
    const dia30 = new Date(agora - 30 * 86400000).toISOString();

    const [
      { data: profilesData },
      { data: eventosAtivacaoData },
      { data: eventos30dData },
      { data: assinaturasData },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, created_at, updated_at"),
      supabaseAdmin
        .from("eventos_analytics")
        .select("user_id, evento, criado_em")
        .in("evento", EVENTOS_ATIVACAO)
        .not("user_id", "is", null),
      supabaseAdmin
        .from("eventos_analytics")
        .select("user_id, evento, criado_em")
        .gte("criado_em", dia30)
        .not("user_id", "is", null)
        .limit(20000),
      supabaseAdmin.from("assinaturas" as never).select("user_id, status"),
    ]);

    const profiles = (profilesData ?? []) as ProfileLinha[];
    const profilesById = new Map(profiles.map((p) => [p.id, p]));
    const nomeDe = (id: string) => profilesById.get(id)?.full_name ?? "Sem nome";

    // Funil de ativação: cada degrau é quem já disparou o evento real
    // correspondente pelo menos uma vez (all-time), não uma amostra.
    const onboardingSet = new Set<string>();
    const primeiroNegocioSet = new Set<string>();
    const usoRealSet = new Set<string>();
    ((eventosAtivacaoData ?? []) as EventoLinha[]).forEach((e) => {
      if (!e.user_id) return;
      if (EVENTOS_ONBOARDING.includes(e.evento)) onboardingSet.add(e.user_id);
      if (EVENTOS_PRIMEIRO_NEGOCIO.includes(e.evento)) primeiroNegocioSet.add(e.user_id);
      if (EVENTOS_USO_REAL.includes(e.evento)) usoRealSet.add(e.user_id);
    });

    // "Voltou"/"recorrente" usam profiles.updated_at como sinal de atividade
    // (mesma aproximação já usada em /painel e /funil deste admin).
    const voltaramEm7Dias = profiles.filter(
      (p) => new Date(p.updated_at).getTime() - new Date(p.created_at).getTime() >= 7 * 86400000,
    ).length;
    const recorrentes = profiles.filter(
      (p) =>
        new Date(p.created_at).getTime() <= agora - 14 * 86400000 &&
        new Date(p.updated_at).getTime() >= agora - 7 * 86400000,
    ).length;

    const funil: FunilAtivacao = {
      totalCadastros: profiles.length,
      completaramOnboarding: onboardingSet.size,
      criaramPrimeiroNegocio: primeiroNegocioSet.size,
      usaramFuncionalidade: usoRealSet.size,
      voltaramEm7Dias,
      recorrentes,
    };

    // Atividade real (sem pageview/click) dos últimos 30 dias, por usuária —
    // base dos segmentos, do ranking de features e do delta semana a semana.
    const diasAtivos30 = new Map<string, Set<string>>();
    const diasAtivos7 = new Map<string, Set<string>>();
    const ultimaAtividade = new Map<string, string>();
    const featureContagem = new Map<string, { total: number; usuarias: Set<string> }>();
    const ativosSemanaAtual = new Set<string>();
    const ativosSemanaAnterior = new Set<string>();

    ((eventos30dData ?? []) as EventoLinha[]).forEach((e) => {
      if (!e.user_id || EVENTOS_AUTOMATICOS.has(e.evento)) return;
      const dia = e.criado_em.slice(0, 10);

      if (!diasAtivos30.has(e.user_id)) diasAtivos30.set(e.user_id, new Set());
      diasAtivos30.get(e.user_id)!.add(dia);

      const atual = ultimaAtividade.get(e.user_id);
      if (!atual || e.criado_em > atual) ultimaAtividade.set(e.user_id, e.criado_em);

      if (e.criado_em >= dia7) {
        if (!diasAtivos7.has(e.user_id)) diasAtivos7.set(e.user_id, new Set());
        diasAtivos7.get(e.user_id)!.add(dia);
        ativosSemanaAtual.add(e.user_id);
      } else if (e.criado_em >= dia14) {
        ativosSemanaAnterior.add(e.user_id);
      }

      const f = featureContagem.get(e.evento) ?? { total: 0, usuarias: new Set<string>() };
      f.total++;
      f.usuarias.add(e.user_id);
      featureContagem.set(e.evento, f);
    });

    // Segmentos: cruza uso real (30d) com status de pagamento.
    const assinanteIds = new Set(
      ((assinaturasData ?? []) as { user_id: string; status: string }[])
        .filter((a) => STATUS_ATIVOS.includes(a.status))
        .map((a) => a.user_id),
    );

    const assinantesSemUso: UsuariaResumo[] = [];
    assinanteIds.forEach((id) => {
      const ultima = ultimaAtividade.get(id) ?? null;
      if (!ultima || ultima < dia14) {
        assinantesSemUso.push({ id, nome: nomeDe(id), ultimaAtividade: ultima });
      }
    });
    assinantesSemUso.sort((a, b) =>
      (a.ultimaAtividade ?? "").localeCompare(b.ultimaAtividade ?? ""),
    );

    const gratuitasEngajadas: UsuariaResumo[] = [];
    const emRisco: UsuariaResumo[] = [];
    const altamenteEngajadas: UsuariaResumo[] = [];

    diasAtivos30.forEach((dias, id) => {
      const dias7 = diasAtivos7.get(id)?.size ?? 0;
      const resumo = { id, nome: nomeDe(id), ultimaAtividade: ultimaAtividade.get(id) ?? null };
      // Engajada: usou em pelo menos 5 dias diferentes no mês, sem pagar.
      if (!assinanteIds.has(id) && dias.size >= 5) gratuitasEngajadas.push(resumo);
      // Em risco: tinha uso recorrente no mês, sumiu nos últimos 7 dias.
      if (dias.size >= 3 && dias7 === 0) emRisco.push(resumo);
      // Altamente engajada: usou em 3+ dias diferentes só na última semana.
      if (dias7 >= 3) altamenteEngajadas.push(resumo);
    });
    gratuitasEngajadas.sort((a, b) =>
      (b.ultimaAtividade ?? "").localeCompare(a.ultimaAtividade ?? ""),
    );
    emRisco.sort((a, b) => (a.ultimaAtividade ?? "").localeCompare(b.ultimaAtividade ?? ""));
    altamenteEngajadas.sort((a, b) =>
      (b.ultimaAtividade ?? "").localeCompare(a.ultimaAtividade ?? ""),
    );

    const segmentos: SegmentosUso = {
      assinantesSemUsoTotal: assinantesSemUso.length,
      assinantesSemUso: assinantesSemUso.slice(0, 20),
      gratuitasEngajadasTotal: gratuitasEngajadas.length,
      gratuitasEngajadas: gratuitasEngajadas.slice(0, 20),
      emRiscoTotal: emRisco.length,
      emRisco: emRisco.slice(0, 20),
      altamenteEngajadasTotal: altamenteEngajadas.length,
      altamenteEngajadas: altamenteEngajadas.slice(0, 20),
    };

    // Não dá pra listar "feature quase sem uso" sem um catálogo fixo de
    // features (eventos_analytics só registra o que de fato disparou) — só
    // o ranking de mais usadas é honesto com o dado que existe.
    const featuresTop: FeatureUso[] = Array.from(featureContagem.entries())
      .map(([evento, v]) => ({ evento, usuariasUnicas: v.usuarias.size, total: v.total }))
      .sort((a, b) => b.usuariasUnicas - a.usuariasUnicas)
      .slice(0, 8);

    return {
      funil,
      segmentos,
      featuresTop,
      ativasSemanaAtual: ativosSemanaAtual.size,
      ativasSemanaAnterior: ativosSemanaAnterior.size,
    };
  });
