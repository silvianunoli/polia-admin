import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/founder-auth.server";
import { dataBRT, periodoSearchSchema, resolverPeriodo, variacaoPct } from "@/lib/founder-periodo";

// Infra (seção 6): API do produto (founder_api_chamadas), banco, storage e IA.

function percentil(valores: number[], p: number): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * p))];
}

export const getInfraApi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [{ data: atual }, { data: anterior }] = await Promise.all([
      supabaseAdmin
        .from("founder_api_chamadas")
        .select("fn, tipo, ok, status, latencia_ms, criado_em")
        .gte("criado_em", p.ini)
        .lt("criado_em", p.fim)
        .limit(50000),
      supabaseAdmin
        .from("founder_api_chamadas")
        .select("ok, tipo, latencia_ms")
        .gte("criado_em", p.iniAnterior)
        .lt("criado_em", p.fimAnterior)
        .limit(50000),
    ]);
    type Linha = {
      fn: string;
      tipo: string;
      ok: boolean;
      status: number | null;
      latencia_ms: number;
      criado_em: string;
    };
    const linhas = (atual ?? []) as Linha[];
    const ant = (anterior ?? []) as { ok: boolean; tipo: string; latencia_ms: number }[];
    const serverFns = linhas.filter((l) => l.tipo === "server_fn");
    const latencias = serverFns.map((l) => l.latencia_ms);
    const erros = linhas.filter((l) => !l.ok).length;
    const errosAnt = ant.filter((l) => !l.ok).length;
    const p95Ant = percentil(
      ant.filter((l) => l.tipo === "server_fn").map((l) => l.latencia_ms),
      0.95,
    );

    const porFn = new Map<string, { total: number; erros: number; lat: number[] }>();
    for (const l of linhas) {
      const f = porFn.get(l.fn) ?? { total: 0, erros: 0, lat: [] };
      f.total++;
      if (!l.ok) f.erros++;
      if (l.tipo === "server_fn") f.lat.push(l.latencia_ms);
      porFn.set(l.fn, f);
    }
    const funcoes = [...porFn.entries()]
      .map(([fn, f]) => ({
        fn,
        total: f.total,
        erros: f.erros,
        taxaErro: f.total ? (f.erros / f.total) * 100 : 0,
        p95: percentil(f.lat, 0.95),
      }))
      .sort((a, b) => b.total - a.total);

    const porDia = new Map<string, { total: number; erros: number }>();
    for (const l of linhas) {
      const d = dataBRT(l.criado_em);
      const x = porDia.get(d) ?? { total: 0, erros: 0 };
      x.total++;
      if (!l.ok) x.erros++;
      porDia.set(d, x);
    }
    const serie = [...porDia.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, x]) => ({ dia, valor: x.total }));
    const serieErros = [...porDia.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, x]) => ({ dia, valor: x.erros }));

    return {
      periodo: p,
      requests: linhas.length,
      requestsVariacao: variacaoPct(linhas.length, ant.length),
      serverFns: serverFns.length,
      ssr: linhas.length - serverFns.length,
      erros,
      taxaErro: linhas.length ? (erros / linhas.length) * 100 : null,
      taxaErroAnterior: ant.length ? (errosAnt / ant.length) * 100 : null,
      p50: percentil(latencias, 0.5),
      p95: percentil(latencias, 0.95),
      p99: percentil(latencias, 0.99),
      p95Variacao:
        p95Ant && percentil(latencias, 0.95) !== null
          ? variacaoPct(percentil(latencias, 0.95) as number, p95Ant)
          : null,
      funcoes: funcoes.slice(0, 30),
      maisLentas: [...funcoes]
        .filter((f) => f.p95 !== null)
        .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))
        .slice(0, 8),
      maisErros: [...funcoes]
        .filter((f) => f.erros > 0)
        .sort((a, b) => b.erros - a.erros)
        .slice(0, 8),
      serie,
      serieErros,
    };
  });

export const getInfraBanco = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin.rpc("founder_banco_status");
    if (error) throw error;
    const s = data as {
      tamanho_bytes: number;
      conexoes: Record<string, number> | null;
      conexoes_total: number;
      tabelas: { tabela: string; bytes: number; linhas: number }[] | null;
      lentas: { consulta: string; chamadas: number; media_ms: number; total_ms: number }[];
    };
    return {
      tamanhoBytes: Number(s.tamanho_bytes),
      conexoes: Object.entries(s.conexoes ?? {}).map(([estado, n]) => ({ estado, n: Number(n) })),
      conexoesTotal: Number(s.conexoes_total),
      tabelas: (s.tabelas ?? []).map((t) => ({
        tabela: t.tabela,
        bytes: Number(t.bytes),
        linhas: Number(t.linhas),
      })),
      lentas: (s.lentas ?? []).map((q) => ({
        consulta: q.consulta,
        chamadas: Number(q.chamadas),
        mediaMs: Number(q.media_ms),
        totalMs: Number(q.total_ms),
      })),
    };
  });

export const getInfraStorage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [{ data: buckets, error }, { data: checks }] = await Promise.all([
      supabaseAdmin.rpc("founder_storage_status", { p_dias: p.dias }),
      supabaseAdmin
        .from("founder_service_checks")
        .select("status, detalhe, checado_em")
        .eq("service", "storage")
        .order("checado_em", { ascending: false })
        .limit(50),
    ]);
    if (error) throw error;
    const linhas = (buckets ?? []) as {
      bucket: string;
      publico: boolean;
      objetos: number;
      bytes: number;
      novos_no_periodo: number;
    }[];
    const historico = (checks ?? []) as {
      status: string;
      detalhe: string | null;
      checado_em: string;
    }[];
    return {
      periodo: p,
      buckets: linhas.map((b) => ({
        bucket: b.bucket,
        publico: b.publico,
        objetos: Number(b.objetos),
        bytes: Number(b.bytes),
        novosNoPeriodo: Number(b.novos_no_periodo),
      })),
      totalBytes: linhas.reduce((s, b) => s + Number(b.bytes), 0),
      totalObjetos: linhas.reduce((s, b) => s + Number(b.objetos), 0),
      errosCheck: historico.filter((h) => h.status === "critico").length,
      ultimoCheck: historico[0] ?? null,
    };
  });

// USD por 1M tokens (entrada / saída), preços públicos de set/2026. Estimativa:
// o que importa é a ordem de grandeza e a tendência, não o centavo.
const PRECO_POR_MODELO: Record<string, { entrada: number; saida: number }> = {
  "gemini-2.5-pro": { entrada: 1.25, saida: 10 },
  "gemini-2.5-flash": { entrada: 0.3, saida: 2.5 },
  "gemini-2.5-flash-lite": { entrada: 0.1, saida: 0.4 },
  "gemini-2.0-flash": { entrada: 0.1, saida: 0.4 },
};

function precoDe(modelo: string) {
  const chave = Object.keys(PRECO_POR_MODELO).find((k) => modelo.includes(k));
  return chave ? PRECO_POR_MODELO[chave] : null;
}

export const getInfraIa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => periodoSearchSchema.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const p = resolverPeriodo(data);
    const [{ data: ger }, { count: gerAnt }, { data: sist }] = await Promise.all([
      supabaseAdmin
        .from("ia_geracoes")
        .select("feature, modelo, tokens_in, tokens_out, sucesso, erro, criado_em")
        .gte("criado_em", p.ini)
        .lt("criado_em", p.fim)
        .order("criado_em", { ascending: false })
        .limit(5000),
      supabaseAdmin
        .from("ia_geracoes")
        .select("id", { head: true, count: "exact" })
        .gte("criado_em", p.iniAnterior)
        .lt("criado_em", p.fimAnterior),
      supabaseAdmin
        .from("founder_eventos_sistema")
        .select("tipo, servico, latencia_ms, detalhes, criado_em")
        .in("tipo", ["ia_call", "ia_failure"])
        .gte("criado_em", p.ini)
        .lt("criado_em", p.fim)
        .limit(5000),
    ]);
    type Ger = {
      feature: string;
      modelo: string;
      tokens_in: number | null;
      tokens_out: number | null;
      sucesso: boolean;
      erro: string | null;
      criado_em: string;
    };
    const geracoes = (ger ?? []) as Ger[];
    const chamadas = (sist ?? []) as {
      tipo: string;
      servico: string | null;
      latencia_ms: number | null;
      detalhes: unknown;
      criado_em: string;
    }[];
    const latencias = chamadas
      .filter((c) => c.tipo === "ia_call" && c.latencia_ms !== null)
      .map((c) => c.latencia_ms as number);

    let custoUsd = 0;
    let semPreco = 0;
    const porModelo = new Map<
      string,
      { chamadas: number; falhas: number; tokensIn: number; tokensOut: number; custo: number }
    >();
    const porFeature = new Map<string, { chamadas: number; falhas: number }>();
    for (const g of geracoes) {
      const m = porModelo.get(g.modelo) ?? {
        chamadas: 0,
        falhas: 0,
        tokensIn: 0,
        tokensOut: 0,
        custo: 0,
      };
      m.chamadas++;
      if (!g.sucesso) m.falhas++;
      m.tokensIn += g.tokens_in ?? 0;
      m.tokensOut += g.tokens_out ?? 0;
      const preco = precoDe(g.modelo);
      if (preco) {
        const c =
          ((g.tokens_in ?? 0) * preco.entrada + (g.tokens_out ?? 0) * preco.saida) / 1_000_000;
        m.custo += c;
        custoUsd += c;
      } else {
        semPreco++;
      }
      porModelo.set(g.modelo, m);
      const f = porFeature.get(g.feature) ?? { chamadas: 0, falhas: 0 };
      f.chamadas++;
      if (!g.sucesso) f.falhas++;
      porFeature.set(g.feature, f);
    }
    const falhas = geracoes.filter((g) => !g.sucesso);
    return {
      periodo: p,
      chamadas: geracoes.length,
      chamadasVariacao: variacaoPct(geracoes.length, gerAnt ?? 0),
      falhas: falhas.length,
      taxaFalha: geracoes.length ? (falhas.length / geracoes.length) * 100 : null,
      latenciaP50: percentil(latencias, 0.5),
      latenciaP95: percentil(latencias, 0.95),
      latenciaMedida: latencias.length,
      custoUsd,
      semPreco,
      tokensIn: geracoes.reduce((s, g) => s + (g.tokens_in ?? 0), 0),
      tokensOut: geracoes.reduce((s, g) => s + (g.tokens_out ?? 0), 0),
      porModelo: [...porModelo.entries()]
        .map(([modelo, m]) => ({ modelo, ...m }))
        .sort((a, b) => b.chamadas - a.chamadas),
      porFeature: [...porFeature.entries()]
        .map(([feature, f]) => ({ feature, ...f }))
        .sort((a, b) => b.chamadas - a.chamadas),
      falhasRecentes: falhas.slice(0, 20).map((g) => ({
        feature: g.feature,
        modelo: g.modelo,
        erro: (g.erro ?? "").slice(0, 160),
        quando: g.criado_em,
      })),
    };
  });
