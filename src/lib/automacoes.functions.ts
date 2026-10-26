import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import {
  automacaoSchema,
  gatilhoSchema,
  modeloFalaInstagram,
  modeloFalaWhatsapp,
  passoSchema,
  type AutomacaoEntrada,
  type Gatilho,
  type Passo,
} from "@/lib/automacoes";
import { listarPostsInstagram } from "@/lib/conversas-meta.server";

// Telas /crm/automacoes (CRM-27). Mesmo desenho do resto do CRM: tabelas auto_* com RLS e
// nenhuma policy, service role só depois do assertAdmin.

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export interface AutomacaoItem extends AutomacaoEntrada {
  id: string;
  execucoes: number;
  ativas_agora: number;
  atualizado_em: string;
}

function lerLinha(l: Record<string, unknown>): AutomacaoItem {
  const gatilho = gatilhoSchema.safeParse(l.gatilho);
  const passos = (Array.isArray(l.passos) ? l.passos : [])
    .map((p) => passoSchema.safeParse(p))
    .filter((r) => r.success)
    .map((r) => r.data as Passo);
  return {
    id: String(l.id),
    nome: String(l.nome),
    canal: l.canal as AutomacaoItem["canal"],
    ativa: Boolean(l.ativa),
    gatilho: gatilho.success ? gatilho.data : ({ tipo: "resposta_padrao" } as Gatilho),
    passos,
    execucoes: Number(l.execucoes ?? 0),
    ativas_agora: 0,
    atualizado_em: String(l.atualizado_em),
  };
}

export const listarAutomacoes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("auto_automacoes")
      .select("*")
      .order("criado_em", { ascending: true });
    if (error) throw new Error("Falha ao listar as automações.");

    const { data: vivas } = await supabaseAdmin
      .from("auto_execucoes")
      .select("automacao_id")
      .in("estado", ["rodando", "aguardando"]);
    const porAutomacao = new Map<string, number>();
    for (const v of (vivas ?? []) as { automacao_id: string }[]) {
      porAutomacao.set(v.automacao_id, (porAutomacao.get(v.automacao_id) ?? 0) + 1);
    }
    return {
      automacoes: ((data ?? []) as Record<string, unknown>[]).map((l) => ({
        ...lerLinha(l),
        ativas_agora: porAutomacao.get(String(l.id)) ?? 0,
      })),
    };
  });

export const obterAutomacao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: linha } = await supabaseAdmin
      .from("auto_automacoes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!linha) throw new Error("Automação não encontrada.");

    const { data: execucoes } = await supabaseAdmin
      .from("auto_execucoes")
      .select("id, estado, passo_idx, erro, iniciado_em, conversa_id, contato:crm_contatos(nome)")
      .eq("automacao_id", data.id)
      .order("iniciado_em", { ascending: false })
      .limit(30);
    return {
      automacao: lerLinha(linha as Record<string, unknown>),
      execucoes: (execucoes ?? []) as unknown as {
        id: string;
        estado: string;
        passo_idx: number;
        erro: string | null;
        iniciado_em: string;
        conversa_id: string;
        contato: { nome: string } | null;
      }[],
    };
  });

export const salvarAutomacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ id: z.string().uuid().optional(), automacao: z.unknown() })
      .transform((v) => {
        const r = automacaoSchema.safeParse(v.automacao);
        // Mensagem do zod em português vai direto pra tela.
        if (!r.success) throw new Error(r.error.issues[0]?.message ?? "Automação inválida.");
        return { id: v.id, automacao: r.data };
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const linha = { ...data.automacao, atualizado_em: new Date().toISOString() };
    if (data.id) {
      const { error } = await supabaseAdmin.from("auto_automacoes").update(linha).eq("id", data.id);
      if (error) throw new Error("Falha ao salvar a automação.");
      await logAcaoAdminServer(context.userId, "automacao_editar", data.id);
      return { id: data.id };
    }
    const { data: criada, error } = await supabaseAdmin
      .from("auto_automacoes")
      .insert(linha)
      .select("id")
      .single();
    if (error || !criada) throw new Error("Falha ao criar a automação.");
    await logAcaoAdminServer(context.userId, "automacao_criar", criada.id as string);
    return { id: criada.id as string };
  });

export const alternarAutomacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), ativa: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("auto_automacoes")
      .update({ ativa: data.ativa, atualizado_em: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Falha ao ligar ou desligar a automação.");
    await logAcaoAdminServer(
      context.userId,
      data.ativa ? "automacao_ligar" : "automacao_desligar",
      data.id,
    );
    return { ok: true };
  });

export const excluirAutomacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("auto_automacoes").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao apagar a automação.");
    await logAcaoAdminServer(context.userId, "automacao_excluir", data.id);
    return { ok: true };
  });

export const criarDoModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ modelo: z.enum(["fala_instagram", "fala_whatsapp"]) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const automacao =
      data.modelo === "fala_instagram" ? modeloFalaInstagram() : modeloFalaWhatsapp();
    const { data: criada, error } = await supabaseAdmin
      .from("auto_automacoes")
      .insert(automacao)
      .select("id")
      .single();
    if (error || !criada) throw new Error("Falha ao criar a partir do modelo.");
    await logAcaoAdminServer(context.userId, "automacao_criar_modelo", criada.id as string);
    return { id: criada.id as string };
  });

export const postsDoInstagram = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    try {
      return { posts: await listarPostsInstagram(), erro: null };
    } catch (e) {
      return { posts: [], erro: e instanceof Error ? e.message : "Não consegui ler os posts." };
    }
  });
