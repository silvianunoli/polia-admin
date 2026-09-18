import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { emailPolia, enviarEmailResend, escapeHtml } from "@/lib/email-template";

// CRM da Pólia — contatos, timeline, negócios, follow-ups e modelos.
// Todas as tabelas crm_* têm RLS ligada e nenhuma policy: só o service role
// enxerga, e só depois de assertAdmin. Mesmo desenho de convites.functions.ts.

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export const STATUS_CONTATO = ["lead", "conversando", "cliente", "inativa", "perdida"] as const;
export type StatusContato = (typeof STATUS_CONTATO)[number];

export const FASES_NEGOCIO = ["novo", "conversando", "proposta", "fechado", "perdido"] as const;
export type FaseNegocio = (typeof FASES_NEGOCIO)[number];

export const CANAIS_INTERACAO = [
  "whatsapp",
  "email",
  "instagram",
  "ligacao",
  "reuniao",
  "nota",
  "sistema",
] as const;

export const TIPOS_TAREFA = ["followup", "pos_venda", "cobranca", "aniversario", "outro"] as const;

export interface Contato {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  instagram: string | null;
  negocio: string | null;
  tipo_negocio: string | null;
  cidade: string | null;
  origem: string;
  status: StatusContato;
  tags: string[];
  user_id: string | null;
  aniversario: string | null;
  observacoes: string | null;
  consent_marketing: boolean;
  descadastrado_em: string | null;
  ultimo_contato_em: string | null;
  proximo_followup: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Interacao {
  id: string;
  contato_id: string;
  canal: string;
  direcao: string;
  assunto: string | null;
  conteudo: string;
  criado_em: string;
}

export interface Negocio {
  id: string;
  contato_id: string;
  titulo: string;
  fase: FaseNegocio;
  valor: number;
  produto: string | null;
  data_prevista: string | null;
  motivo_perda: string | null;
  fechado_em: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface Tarefa {
  id: string;
  contato_id: string | null;
  titulo: string;
  tipo: string;
  prazo: string;
  feito_em: string | null;
  criado_em: string;
}

export interface Modelo {
  id: string;
  nome: string;
  canal: "whatsapp" | "email";
  assunto: string | null;
  corpo: string;
  criado_em: string;
  atualizado_em: string;
}

// Só dígitos, com 55 na frente: é o formato que o wa.me aceita. Número curto
// demais volta nulo em vez de virar link quebrado que abre conversa errada.
export function normalizarTelefone(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  if (digitos.startsWith("55")) return digitos.length >= 12 ? digitos : null;
  return `55${digitos}`;
}

const contatoInput = z.object({
  id: z.string().uuid().optional(),
  nome: z.string().trim().min(1, "Nome obrigatório.").max(160),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email("E-mail inválido.")
    .optional()
    .or(z.literal("")),
  telefone: z.string().trim().max(40).optional().or(z.literal("")),
  instagram: z.string().trim().max(80).optional().or(z.literal("")),
  negocio: z.string().trim().max(160).optional().or(z.literal("")),
  tipo_negocio: z.string().trim().max(120).optional().or(z.literal("")),
  cidade: z.string().trim().max(120).optional().or(z.literal("")),
  origem: z.string().trim().max(40).default("manual"),
  status: z.enum(STATUS_CONTATO).default("lead"),
  tags: z.array(z.string().trim().max(40)).max(20).default([]),
  aniversario: z.string().trim().max(10).optional().or(z.literal("")),
  observacoes: z.string().trim().max(4000).optional().or(z.literal("")),
  consent_marketing: z.boolean().default(false),
  proximo_followup: z.string().trim().max(10).optional().or(z.literal("")),
});

function limpar(v: string | undefined | null): string | null {
  const t = (v ?? "").trim();
  return t === "" ? null : t;
}

export const listarContatos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data, error } = await supabaseAdmin
      .from("crm_contatos")
      .select("*")
      .order("atualizado_em", { ascending: false })
      .limit(2000);
    if (error) throw new Error("Falha ao listar contatos.");

    return { contatos: (data ?? []) as unknown as Contato[] };
  });

export const obterContato = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const [contatoRes, interacoesRes, negociosRes, tarefasRes] = await Promise.all([
      supabaseAdmin.from("crm_contatos").select("*").eq("id", data.id).maybeSingle(),
      supabaseAdmin
        .from("crm_interacoes")
        .select("*")
        .eq("contato_id", data.id)
        .order("criado_em", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("crm_negocios")
        .select("*")
        .eq("contato_id", data.id)
        .order("criado_em", { ascending: false }),
      supabaseAdmin
        .from("crm_tarefas")
        .select("*")
        .eq("contato_id", data.id)
        .order("prazo", { ascending: true }),
    ]);

    if (!contatoRes.data) throw new Error("Contato não encontrado.");

    return {
      contato: contatoRes.data as unknown as Contato,
      interacoes: (interacoesRes.data ?? []) as unknown as Interacao[],
      negocios: (negociosRes.data ?? []) as unknown as Negocio[],
      tarefas: (tarefasRes.data ?? []) as unknown as Tarefa[],
    };
  });

export const salvarContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => contatoInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const email = limpar(data.email);
    const telefone = normalizarTelefone(data.telefone);
    if (!email && !telefone) {
      throw new Error("Precisa de e-mail ou de um WhatsApp válido com DDD.");
    }

    const linha = {
      nome: data.nome,
      email,
      telefone,
      instagram: limpar(data.instagram)?.replace(/^@/, "") ?? null,
      negocio: limpar(data.negocio),
      tipo_negocio: limpar(data.tipo_negocio),
      cidade: limpar(data.cidade),
      origem: data.origem || "manual",
      status: data.status,
      tags: data.tags.filter((t) => t.length > 0),
      aniversario: limpar(data.aniversario),
      observacoes: limpar(data.observacoes),
      consent_marketing: data.consent_marketing,
      proximo_followup: limpar(data.proximo_followup),
      atualizado_em: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("crm_contatos").update(linha).eq("id", data.id);
      if (error) {
        if (error.code === "23505") throw new Error("Já existe um contato com esse e-mail.");
        throw new Error("Falha ao salvar o contato.");
      }
      await logAcaoAdminServer(context.userId, "crm_editar_contato", data.id);
      return { id: data.id };
    }

    const { data: criado, error } = await supabaseAdmin
      .from("crm_contatos")
      .insert(linha)
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("Já existe um contato com esse e-mail.");
      throw new Error("Falha ao criar o contato.");
    }
    await logAcaoAdminServer(context.userId, "crm_criar_contato", criado.id as string);
    return { id: criado.id as string };
  });

export const excluirContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("crm_contatos").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao excluir o contato.");
    await logAcaoAdminServer(context.userId, "crm_excluir_contato", data.id);
    return { ok: true };
  });

export const registrarInteracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contato_id: z.string().uuid(),
        canal: z.enum(CANAIS_INTERACAO),
        direcao: z.enum(["saida", "entrada", "interna"]).default("saida"),
        assunto: z.string().trim().max(200).optional(),
        conteudo: z.string().trim().min(1, "Escreva alguma coisa.").max(8000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { error } = await supabaseAdmin.from("crm_interacoes").insert({
      contato_id: data.contato_id,
      canal: data.canal,
      direcao: data.direcao,
      assunto: limpar(data.assunto),
      conteudo: data.conteudo,
    });
    if (error) throw new Error("Falha ao registrar.");

    // Nota interna não conta como contato — só o que saiu ou entrou de fato.
    if (data.canal !== "nota" && data.direcao !== "interna") {
      const agora = new Date().toISOString();
      await supabaseAdmin
        .from("crm_contatos")
        .update({ ultimo_contato_em: agora, atualizado_em: agora })
        .eq("id", data.contato_id);
    }
    return { ok: true };
  });

// E-mail avulso pra uma pessoa, na casca da marca, e o registro já entra na
// timeline. É o irmão do botão de WhatsApp: a diferença é que este realmente
// sai daqui, enquanto o WhatsApp só abre a conversa.
export const enviarEmailContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        contato_id: z.string().uuid(),
        assunto: z.string().trim().min(1, "Escreva um assunto.").max(200),
        corpo: z.string().trim().min(1, "O e-mail está vazio.").max(20_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: contatoRaw } = await supabaseAdmin
      .from("crm_contatos")
      .select("id, nome, email")
      .eq("id", data.contato_id)
      .maybeSingle();
    const contato = contatoRaw as { id: string; nome: string; email: string | null } | null;
    if (!contato?.email) throw new Error("Esse contato não tem e-mail.");

    const paragrafos = data.corpo
      .split(/\n{2,}/)
      .map((p) => escapeHtml(p).replace(/\n/g, "<br>"))
      .filter((p) => p.trim().length > 0);

    const enviado = await enviarEmailResend({
      to: [contato.email],
      subject: data.assunto,
      text: data.corpo,
      html: emailPolia({
        preheader: data.assunto,
        headline: data.assunto,
        paragrafos,
      }),
      replyTo: "oi@usepolia.com.br",
      contexto: "[crm]",
    });

    if (!enviado) throw new Error("O Resend recusou o envio. O e-mail não saiu.");

    const agora = new Date().toISOString();
    await supabaseAdmin.from("crm_interacoes").insert({
      contato_id: contato.id,
      canal: "email",
      direcao: "saida",
      assunto: data.assunto,
      conteudo: data.corpo,
    });
    await supabaseAdmin
      .from("crm_contatos")
      .update({ ultimo_contato_em: agora, atualizado_em: agora })
      .eq("id", contato.id);

    return { ok: true };
  });

export const excluirInteracao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("crm_interacoes").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao apagar o registro.");
    return { ok: true };
  });

export const listarNegocios = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [negociosRes, contatosRes] = await Promise.all([
      supabaseAdmin
        .from("crm_negocios")
        .select("*")
        .order("atualizado_em", { ascending: false })
        .limit(1000),
      supabaseAdmin.from("crm_contatos").select("id, nome, telefone, email").limit(2000),
    ]);

    return {
      negocios: (negociosRes.data ?? []) as unknown as Negocio[],
      contatos: (contatosRes.data ?? []) as unknown as Pick<
        Contato,
        "id" | "nome" | "telefone" | "email"
      >[],
    };
  });

export const salvarNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        contato_id: z.string().uuid(),
        titulo: z.string().trim().min(1, "Dê um nome pra essa negociação.").max(160),
        fase: z.enum(FASES_NEGOCIO).default("novo"),
        valor: z.number().min(0).max(99_999_999).default(0),
        produto: z.string().trim().max(120).optional().or(z.literal("")),
        data_prevista: z.string().trim().max(10).optional().or(z.literal("")),
        motivo_perda: z.string().trim().max(400).optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const agora = new Date().toISOString();
    const linha = {
      contato_id: data.contato_id,
      titulo: data.titulo,
      fase: data.fase,
      valor: data.valor,
      produto: limpar(data.produto),
      data_prevista: limpar(data.data_prevista),
      motivo_perda: limpar(data.motivo_perda),
      fechado_em: data.fase === "fechado" || data.fase === "perdido" ? agora : null,
      atualizado_em: agora,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("crm_negocios").update(linha).eq("id", data.id);
      if (error) throw new Error("Falha ao salvar a negociação.");
      return { id: data.id };
    }

    const { data: criado, error } = await supabaseAdmin
      .from("crm_negocios")
      .insert(linha)
      .select("id")
      .single();
    if (error) throw new Error("Falha ao criar a negociação.");
    return { id: criado.id as string };
  });

export const moverNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), fase: z.enum(FASES_NEGOCIO) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("crm_negocios")
      .update({
        fase: data.fase,
        atualizado_em: agora,
        fechado_em: data.fase === "fechado" || data.fase === "perdido" ? agora : null,
      })
      .eq("id", data.id);
    if (error) throw new Error("Falha ao mover.");
    return { ok: true };
  });

export const excluirNegocio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("crm_negocios").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao excluir a negociação.");
    return { ok: true };
  });

export const listarTarefas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [tarefasRes, contatosRes] = await Promise.all([
      supabaseAdmin.from("crm_tarefas").select("*").order("prazo", { ascending: true }).limit(1000),
      supabaseAdmin.from("crm_contatos").select("id, nome, telefone, email").limit(2000),
    ]);

    return {
      tarefas: (tarefasRes.data ?? []) as unknown as Tarefa[],
      contatos: (contatosRes.data ?? []) as unknown as Pick<
        Contato,
        "id" | "nome" | "telefone" | "email"
      >[],
    };
  });

export const salvarTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        contato_id: z.string().uuid().nullable().optional(),
        titulo: z.string().trim().min(1, "Escreva o que precisa ser feito.").max(200),
        tipo: z.enum(TIPOS_TAREFA).default("followup"),
        prazo: z.string().trim().min(10).max(10),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const linha = {
      contato_id: data.contato_id ?? null,
      titulo: data.titulo,
      tipo: data.tipo,
      prazo: data.prazo,
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("crm_tarefas").update(linha).eq("id", data.id);
      if (error) throw new Error("Falha ao salvar o lembrete.");
      return { id: data.id };
    }

    const { data: criado, error } = await supabaseAdmin
      .from("crm_tarefas")
      .insert(linha)
      .select("id")
      .single();
    if (error) throw new Error("Falha ao criar o lembrete.");

    if (data.contato_id) {
      await supabaseAdmin
        .from("crm_contatos")
        .update({ proximo_followup: data.prazo })
        .eq("id", data.contato_id);
    }
    return { id: criado.id as string };
  });

export const alternarTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), feito: z.boolean() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("crm_tarefas")
      .update({ feito_em: data.feito ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error("Falha ao atualizar o lembrete.");
    return { ok: true };
  });

export const excluirTarefa = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("crm_tarefas").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao excluir o lembrete.");
    return { ok: true };
  });

export const listarModelos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("crm_modelos")
      .select("*")
      .order("canal", { ascending: true })
      .order("nome", { ascending: true });
    return { modelos: (data ?? []) as unknown as Modelo[] };
  });

export const salvarModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        nome: z.string().trim().min(1, "Dê um nome ao modelo.").max(120),
        canal: z.enum(["whatsapp", "email"]).default("whatsapp"),
        assunto: z.string().trim().max(200).optional().or(z.literal("")),
        corpo: z.string().trim().min(1, "O modelo está vazio.").max(8000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const linha = {
      nome: data.nome,
      canal: data.canal,
      assunto: limpar(data.assunto),
      corpo: data.corpo,
      atualizado_em: new Date().toISOString(),
    };

    if (data.id) {
      const { error } = await supabaseAdmin.from("crm_modelos").update(linha).eq("id", data.id);
      if (error) throw new Error("Falha ao salvar o modelo.");
      return { id: data.id };
    }
    const { data: criado, error } = await supabaseAdmin
      .from("crm_modelos")
      .insert(linha)
      .select("id")
      .single();
    if (error) throw new Error("Falha ao criar o modelo.");
    return { id: criado.id as string };
  });

export const excluirModelo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("crm_modelos").delete().eq("id", data.id);
    if (error) throw new Error("Falha ao excluir o modelo.");
    return { ok: true };
  });

interface Candidato {
  email: string;
  nome: string;
  origem: string;
  tipo_negocio?: string | null;
  consent_marketing: boolean;
  consent_texto?: string | null;
  descadastrado_em?: string | null;
  user_id?: string | null;
  status?: StatusContato;
  criado_em?: string;
}

// Espelha as portas de entrada (lista de espera, quiz, manual, /contato e as
// usuárias do app) dentro de crm_contatos, deduplicando por e-mail. Roda sob
// demanda, é idempotente: contato que já existe só ganha os campos que ainda
// estavam vazios, nunca sobrescreve o que ela editou à mão.
export const sincronizarFontes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [espera, quiz, manual, contatosForm, profiles, usuarios] = await Promise.all([
      supabaseAdmin.from("lista_espera").select("nome, email, tipo_negocio, criado_em, novidades"),
      supabaseAdmin
        .from("quiz_leads")
        .select("email, consentimento, consent_texto, descadastrado_em, created_at"),
      supabaseAdmin
        .from("manual_leads")
        .select("email, consentimento, consent_texto, descadastrado_em, created_at"),
      supabaseAdmin.from("contatos").select("nome, email, created_at"),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, business_name, business_type, notif_novidades, created_at"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);

    const emailPorUserId = new Map<string, string>();
    for (const u of usuarios.data?.users ?? []) {
      if (u.email) emailPorUserId.set(u.id, u.email.toLowerCase());
    }

    const candidatos: Candidato[] = [];

    for (const l of espera.data ?? []) {
      const linha = l as {
        nome: string;
        email: string;
        tipo_negocio: string | null;
        criado_em: string;
        novidades: boolean;
      };
      candidatos.push({
        email: linha.email.toLowerCase(),
        nome: linha.nome,
        origem: "lista_espera",
        tipo_negocio: linha.tipo_negocio,
        consent_marketing: linha.novidades,
        criado_em: linha.criado_em,
      });
    }

    for (const q of quiz.data ?? []) {
      const linha = q as {
        email: string;
        consentimento: boolean;
        consent_texto: string | null;
        descadastrado_em: string | null;
        created_at: string;
      };
      candidatos.push({
        email: linha.email.toLowerCase(),
        nome: nomeDoEmail(linha.email),
        origem: "quiz",
        consent_marketing: linha.consentimento,
        consent_texto: linha.consent_texto,
        descadastrado_em: linha.descadastrado_em,
        criado_em: linha.created_at,
      });
    }

    for (const m of manual.data ?? []) {
      const linha = m as {
        email: string;
        consentimento: boolean;
        consent_texto: string | null;
        descadastrado_em: string | null;
        created_at: string;
      };
      candidatos.push({
        email: linha.email.toLowerCase(),
        nome: nomeDoEmail(linha.email),
        origem: "manual_gratuito",
        consent_marketing: linha.consentimento,
        consent_texto: linha.consent_texto,
        descadastrado_em: linha.descadastrado_em,
        criado_em: linha.created_at,
      });
    }

    for (const c of contatosForm.data ?? []) {
      const linha = c as { nome: string; email: string; created_at: string };
      candidatos.push({
        email: linha.email.toLowerCase(),
        nome: linha.nome,
        origem: "formulario_contato",
        consent_marketing: false,
        criado_em: linha.created_at,
      });
    }

    for (const p of profiles.data ?? []) {
      const linha = p as {
        id: string;
        full_name: string | null;
        business_name: string | null;
        business_type: string | null;
        notif_novidades: boolean;
        created_at: string;
      };
      const email = emailPorUserId.get(linha.id);
      if (!email) continue;
      candidatos.push({
        email,
        nome: linha.full_name || linha.business_name || nomeDoEmail(email),
        origem: "app",
        tipo_negocio: linha.business_type,
        consent_marketing: linha.notif_novidades,
        user_id: linha.id,
        status: "cliente",
        criado_em: linha.created_at,
      });
    }

    const { data: existentesRaw } = await supabaseAdmin
      .from("crm_contatos")
      .select("id, email, nome, tipo_negocio, user_id, consent_marketing, descadastrado_em");
    const existentes = new Map<string, Record<string, unknown>>();
    for (const e of (existentesRaw ?? []) as Record<string, unknown>[]) {
      const email = e.email as string | null;
      if (email) existentes.set(email.toLowerCase(), e);
    }

    // Mais de uma fonte pode trazer o mesmo e-mail (quem entrou na lista de
    // espera e depois virou usuária). A última a falar vence nos campos novos,
    // e a ordem acima vai do mais frio pro mais quente de propósito.
    const porEmail = new Map<string, Candidato>();
    for (const c of candidatos) {
      const anterior = porEmail.get(c.email);
      porEmail.set(c.email, anterior ? mesclarCandidatos(anterior, c) : c);
    }

    let criados = 0;
    let atualizados = 0;
    const novos: Record<string, unknown>[] = [];

    for (const [email, c] of porEmail) {
      const atual = existentes.get(email);
      if (!atual) {
        novos.push({
          nome: c.nome,
          email,
          origem: c.origem,
          status: c.status ?? "lead",
          tipo_negocio: c.tipo_negocio ?? null,
          user_id: c.user_id ?? null,
          consent_marketing: c.consent_marketing,
          consent_texto: c.consent_texto ?? null,
          descadastrado_em: c.descadastrado_em ?? null,
          criado_em: c.criado_em ?? new Date().toISOString(),
        });
        criados += 1;
        continue;
      }

      // Só preenche buraco. Nome, status e tags que ela ajustou ficam como estão.
      const patch: Record<string, unknown> = {};
      if (!atual.tipo_negocio && c.tipo_negocio) patch.tipo_negocio = c.tipo_negocio;
      if (!atual.user_id && c.user_id) patch.user_id = c.user_id;
      if (c.descadastrado_em && !atual.descadastrado_em) {
        patch.descadastrado_em = c.descadastrado_em;
        patch.consent_marketing = false;
      }
      if (Object.keys(patch).length > 0) {
        patch.atualizado_em = new Date().toISOString();
        await supabaseAdmin
          .from("crm_contatos")
          .update(patch)
          .eq("id", atual.id as string);
        atualizados += 1;
      }
    }

    if (novos.length > 0) {
      for (let i = 0; i < novos.length; i += 200) {
        const { error } = await supabaseAdmin.from("crm_contatos").insert(novos.slice(i, i + 200));
        if (error) throw new Error(`Falha ao importar contatos: ${error.message}`);
      }
    }

    await logAcaoAdminServer(
      context.userId,
      "crm_sincronizar_fontes",
      `${criados} novos, ${atualizados} atualizados`,
    );
    return { criados, atualizados, total: porEmail.size };
  });

function mesclarCandidatos(a: Candidato, b: Candidato): Candidato {
  return {
    email: b.email,
    nome: b.nome && b.nome !== nomeDoEmail(b.email) ? b.nome : a.nome,
    origem: b.origem === "app" ? "app" : a.origem,
    tipo_negocio: b.tipo_negocio ?? a.tipo_negocio,
    consent_marketing: a.consent_marketing || b.consent_marketing,
    consent_texto: b.consent_texto ?? a.consent_texto,
    descadastrado_em: b.descadastrado_em ?? a.descadastrado_em,
    user_id: b.user_id ?? a.user_id,
    status: b.status ?? a.status,
    criado_em: a.criado_em ?? b.criado_em,
  };
}

function nomeDoEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .replace(/[._-]+/g, " ")
      .replace(/\d+/g, "")
      .trim()
      .split(" ")
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || email
  );
}

export interface ResumoCrm {
  porStatus: Record<string, number>;
  total: number;
  semContato30d: number;
  novos7d: number;
  aniversariantesHoje: { id: string; nome: string; telefone: string | null }[];
  followupsVencidos: {
    id: string;
    titulo: string;
    prazo: string;
    contato_id: string | null;
    contato: string | null;
  }[];
  followupsHoje: number;
  negociosAbertos: { quantidade: number; valor: number };
  fechadoNoMes: { quantidade: number; valor: number };
  contatosMarketing: number;
  ultimasCampanhas: {
    id: string;
    nome: string;
    status: string;
    enviada_em: string | null;
    destinatarios: number;
  }[];
}

export const resumoCrm = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ResumoCrm> => {
    await assertAdmin(context.userId);

    const hoje = new Date();
    const iso = (d: Date) => d.toISOString();
    const ha30 = new Date(hoje.getTime() - 30 * 86_400_000);
    const ha7 = new Date(hoje.getTime() - 7 * 86_400_000);
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

    const [contatosRes, negociosRes, tarefasRes, campanhasRes] = await Promise.all([
      supabaseAdmin
        .from("crm_contatos")
        .select(
          "id, nome, status, telefone, aniversario, ultimo_contato_em, criado_em, consent_marketing, descadastrado_em",
        )
        .limit(5000),
      supabaseAdmin.from("crm_negocios").select("fase, valor, fechado_em").limit(2000),
      supabaseAdmin
        .from("crm_tarefas")
        .select("id, titulo, prazo, contato_id")
        .is("feito_em", null)
        .lte("prazo", hojeStr)
        .order("prazo", { ascending: true })
        .limit(50),
      supabaseAdmin
        .from("crm_campanhas")
        .select("id, nome, status, enviada_em, destinatarios")
        .order("criado_em", { ascending: false })
        .limit(5),
    ]);

    const contatos = (contatosRes.data ?? []) as unknown as Pick<
      Contato,
      | "id"
      | "nome"
      | "status"
      | "telefone"
      | "aniversario"
      | "ultimo_contato_em"
      | "criado_em"
      | "consent_marketing"
      | "descadastrado_em"
    >[];

    const porStatus: Record<string, number> = {};
    for (const s of STATUS_CONTATO) porStatus[s] = 0;
    let semContato30d = 0;
    let novos7d = 0;
    let contatosMarketing = 0;
    const aniversariantesHoje: ResumoCrm["aniversariantesHoje"] = [];
    const mesDia = hojeStr.slice(5);

    for (const c of contatos) {
      porStatus[c.status] = (porStatus[c.status] ?? 0) + 1;
      const ultimo = c.ultimo_contato_em ?? c.criado_em;
      if (ultimo < iso(ha30)) semContato30d += 1;
      if (c.criado_em >= iso(ha7)) novos7d += 1;
      if (c.consent_marketing && !c.descadastrado_em) contatosMarketing += 1;
      if (c.aniversario && c.aniversario.slice(5) === mesDia) {
        aniversariantesHoje.push({ id: c.id, nome: c.nome, telefone: c.telefone });
      }
    }

    const negocios = (negociosRes.data ?? []) as unknown as Pick<
      Negocio,
      "fase" | "valor" | "fechado_em"
    >[];
    let abertosQtd = 0;
    let abertosValor = 0;
    let mesQtd = 0;
    let mesValor = 0;
    for (const n of negocios) {
      const valor = Number(n.valor ?? 0);
      if (n.fase !== "fechado" && n.fase !== "perdido") {
        abertosQtd += 1;
        abertosValor += valor;
      } else if (n.fase === "fechado" && n.fechado_em && n.fechado_em >= iso(inicioMes)) {
        mesQtd += 1;
        mesValor += valor;
      }
    }

    const tarefas = (tarefasRes.data ?? []) as unknown as Pick<
      Tarefa,
      "id" | "titulo" | "prazo" | "contato_id"
    >[];
    const nomePorId = new Map(contatos.map((c) => [c.id, c.nome]));

    return {
      porStatus,
      total: contatos.length,
      semContato30d,
      novos7d,
      aniversariantesHoje,
      followupsVencidos: tarefas.map((t) => ({
        id: t.id,
        titulo: t.titulo,
        prazo: t.prazo,
        contato_id: t.contato_id,
        contato: t.contato_id ? (nomePorId.get(t.contato_id) ?? null) : null,
      })),
      followupsHoje: tarefas.filter((t) => t.prazo === hojeStr).length,
      negociosAbertos: { quantidade: abertosQtd, valor: abertosValor },
      fechadoNoMes: { quantidade: mesQtd, valor: mesValor },
      contatosMarketing,
      ultimasCampanhas: (campanhasRes.data ?? []) as unknown as ResumoCrm["ultimasCampanhas"],
    };
  });
