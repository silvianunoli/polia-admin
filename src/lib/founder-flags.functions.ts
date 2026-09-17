import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/founder-auth.server";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import type { Json } from "@/integrations/supabase/types";

// Feature flags do Founder Dashboard (founder_flags + founder_flags_historico).
// Toda escrita passa por aqui (service role + atualizado_por = admin logada),
// o trigger do banco grava o histórico e o audit log registra a ação.

export type EstadoFlag = "on" | "off" | "beta";
export type AmbienteFlag = "prod" | "preview";

export interface FlagLinha {
  key: string;
  ambiente: AmbienteFlag;
  nome: string;
  descricao: string | null;
  estado: EstadoFlag;
  rolloutPct: number;
  betaUserIds: string[];
  atualizadoEm: string;
  atualizadoPor: string | null;
}

export interface HistoricoLinha {
  id: string;
  flagKey: string;
  ambiente: AmbienteFlag;
  alteradoPor: string | null;
  alteradoEm: string;
  estadoAnterior: Json;
  estadoNovo: Json;
  motivo: string | null;
}

type FlagDb = {
  key: string;
  ambiente: AmbienteFlag;
  nome: string;
  descricao: string | null;
  estado: EstadoFlag;
  rollout_pct: number;
  beta_user_ids: string[];
  atualizado_em: string;
  atualizado_por: string | null;
};

function mapear(f: FlagDb): FlagLinha {
  return {
    key: f.key,
    ambiente: f.ambiente,
    nome: f.nome,
    descricao: f.descricao,
    estado: f.estado,
    rolloutPct: f.rollout_pct,
    betaUserIds: f.beta_user_ids ?? [],
    atualizadoEm: f.atualizado_em,
    atualizadoPor: f.atualizado_por,
  };
}

async function nomesDosAdmins(ids: (string | null)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unicos.length === 0) return {};
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id, full_name, display_name")
    .in("id", unicos);
  const mapa: Record<string, string> = {};
  for (const p of (data ?? []) as {
    id: string;
    full_name: string | null;
    display_name: string | null;
  }[]) {
    mapa[p.id] = p.display_name || p.full_name || p.id.slice(0, 8);
  }
  return mapa;
}

export const getFounderFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const [{ data: flagsData }, { data: histData }] = await Promise.all([
      supabaseAdmin.from("founder_flags").select("*").order("key").order("ambiente"),
      supabaseAdmin
        .from("founder_flags_historico")
        .select("*")
        .order("alterado_em", { ascending: false })
        .limit(100),
    ]);
    const flags = ((flagsData ?? []) as FlagDb[]).map(mapear);
    const historicoRaw = (histData ?? []) as {
      id: string;
      flag_key: string;
      ambiente: AmbienteFlag;
      alterado_por: string | null;
      alterado_em: string;
      estado_anterior: Json;
      estado_novo: Json;
      motivo: string | null;
    }[];
    const nomes = await nomesDosAdmins([
      ...flags.map((f) => f.atualizadoPor),
      ...historicoRaw.map((h) => h.alterado_por),
    ]);
    const historico: HistoricoLinha[] = historicoRaw.map((h) => ({
      id: h.id,
      flagKey: h.flag_key,
      ambiente: h.ambiente,
      alteradoPor: h.alterado_por,
      alteradoEm: h.alterado_em,
      estadoAnterior: h.estado_anterior,
      estadoNovo: h.estado_novo,
      motivo: h.motivo,
    }));
    return { flags, historico, nomes };
  });

const alterarInput = z.object({
  key: z.string().min(1).max(80),
  ambiente: z.enum(["prod", "preview"]),
  estado: z.enum(["on", "off", "beta"]).optional(),
  rolloutPct: z.number().int().min(0).max(100).optional(),
  betaUserIds: z.array(z.string().uuid()).max(200).optional(),
  nome: z.string().min(1).max(120).optional(),
  descricao: z.string().max(500).nullable().optional(),
});

export const alterarFounderFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => alterarInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const patch: Record<string, unknown> = {
      atualizado_em: new Date().toISOString(),
      atualizado_por: context.userId,
    };
    if (data.estado !== undefined) patch.estado = data.estado;
    if (data.rolloutPct !== undefined) patch.rollout_pct = data.rolloutPct;
    if (data.betaUserIds !== undefined) patch.beta_user_ids = data.betaUserIds;
    if (data.nome !== undefined) patch.nome = data.nome;
    if (data.descricao !== undefined) patch.descricao = data.descricao;

    const { data: linha, error } = await supabaseAdmin
      .from("founder_flags")
      .update(patch)
      .eq("key", data.key)
      .eq("ambiente", data.ambiente)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!linha) throw new Error("Flag não encontrada");
    await logAcaoAdminServer(
      context.userId,
      "alterar_founder_flag",
      `${data.key}@${data.ambiente}`,
      {
        estado: data.estado,
        rollout_pct: data.rolloutPct,
        beta: data.betaUserIds?.length,
      },
    );
    return mapear(linha as FlagDb);
  });

const criarInput = z.object({
  key: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z][a-z0-9_]*$/, "só letras minúsculas, números e _"),
  nome: z.string().min(1).max(120),
  descricao: z.string().max(500).optional(),
});

export const criarFounderFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => criarInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const linhas = (["prod", "preview"] as const).map((ambiente) => ({
      key: data.key,
      ambiente,
      nome: data.nome,
      descricao: data.descricao ?? null,
      estado: "off",
      rollout_pct: 0,
      atualizado_por: context.userId,
    }));
    const { error } = await supabaseAdmin.from("founder_flags").insert(linhas);
    if (error)
      throw new Error(
        error.code === "23505" ? "Já existe uma flag com essa chave." : error.message,
      );
    await logAcaoAdminServer(context.userId, "criar_founder_flag", data.key, { nome: data.nome });
    return { ok: true as const };
  });

// Resumo pro card da Overview: só prod, sem histórico.
export const getFounderFlagsResumo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("founder_flags")
      .select("key, nome, estado, rollout_pct")
      .eq("ambiente", "prod")
      .order("key");
    return (
      (data ?? []) as { key: string; nome: string; estado: EstadoFlag; rollout_pct: number }[]
    ).map((f) => ({ key: f.key, nome: f.nome, estado: f.estado, rolloutPct: f.rollout_pct }));
  });
