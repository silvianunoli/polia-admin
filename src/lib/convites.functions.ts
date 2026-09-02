import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { emailPolia, enviarEmailResend } from "@/lib/email-template";

const emailInput = z.object({ email: z.string().trim().toLowerCase().email().max(255) });

interface ConviteRow {
  usado_em: string | null;
}

export interface ConviteListItem {
  email: string;
  criado_em: string;
  usado_em: string | null;
  enviado_em: string | null;
}

// Nota: verificarConvite (usada pelo fluxo público de cadastro em polia-app,
// src/routes/auth/cadastro.tsx) não foi portada aqui — este app só precisa das
// funções administrativas usadas por routes/crm.tsx.

// As funções abaixo usam supabaseAdmin (bypassa RLS deny-all da tabela) —
// só são seguras porque assertAdmin barra qualquer chamador que não seja
// admin ANTES de tocar na tabela.
async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export const listarConvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("convites_cadastro")
      .select("email, criado_em, usado_em, enviado_em")
      .order("criado_em", { ascending: false });
    if (error) throw new Error("Falha ao listar convites.");
    return { convites: (data ?? []) as ConviteListItem[] };
  });

export const criarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emailInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("convites_cadastro").insert({ email: data.email });
    if (error) {
      if (error.code === "23505") throw new Error("Esse e-mail já tem convite.");
      throw new Error("Falha ao criar convite.");
    }
    await logAcaoAdminServer(context.userId, "criar_convite", data.email);
    return { ok: true };
  });

const SITE_URL = "https://usepolia.com.br";

export const enviarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emailInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: convite } = await supabaseAdmin
      .from("convites_cadastro")
      .select("usado_em")
      .eq("email", data.email)
      .maybeSingle();
    if (!convite) throw new Error("Esse e-mail não está na lista de convites.");
    if ((convite as ConviteRow).usado_em) {
      throw new Error("Essa pessoa já criou a conta — não precisa reenviar.");
    }

    const link = `${SITE_URL}/auth/cadastro?email=${encodeURIComponent(data.email)}`;
    const enviado = await enviarEmailResend({
      to: [data.email],
      subject: "Você foi convidada pra Pólia",
      text: `Você tem acesso liberado à Pólia, sem custo.\n\nAceita o convite e cria sua conta:\n${link}`,
      html: emailPolia({
        preheader: "Seu acesso à Pólia está liberado.",
        headline: "Você foi convidada pra Pólia",
        paragrafos: [
          "Alguém liberou seu acesso à Pólia, sem custo. É só aceitar o convite e criar sua conta.",
        ],
        ctaLabel: "Aceitar convite",
        ctaUrl: link,
      }),
      contexto: "[Convites]",
    });
    if (!enviado) {
      throw new Error("Não consegui enviar o convite agora. Tenta de novo.");
    }

    const { error } = await supabaseAdmin
      .from("convites_cadastro")
      .update({ enviado_em: new Date().toISOString() })
      .eq("email", data.email);
    if (error) console.error("[Convites] Falha ao marcar convite enviado:", error);

    await logAcaoAdminServer(context.userId, "enviar_convite", data.email);
    return { ok: true };
  });

export const removerConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emailInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("convites_cadastro")
      .delete()
      .eq("email", data.email);
    if (error) throw new Error("Falha ao remover convite.");
    await logAcaoAdminServer(context.userId, "remover_convite", data.email);
    return { ok: true };
  });
