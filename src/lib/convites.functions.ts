import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import { emailPolia, enviarEmailResend } from "@/lib/email-template";
import { PLANOS_CONVITE, type PlanoConvite } from "@/lib/planos-convite";

const emailInput = z.object({ email: z.string().trim().toLowerCase().email().max(255) });

// O plano vem da interface, então é validado aqui também — o check do banco
// (convites_cadastro_plano_check) é a segunda trava, não a única.
const acessoInput = emailInput.extend({
  plano: z.enum(PLANOS_CONVITE.map((p) => p.valor) as [PlanoConvite, ...PlanoConvite[]]),
  is_admin: z.boolean(),
});

interface ConviteRow {
  usado_em: string | null;
}

export interface ConviteListItem {
  email: string;
  criado_em: string;
  usado_em: string | null;
  enviado_em: string | null;
  /** Tipo de acesso que a conta VAI receber ao ser criada. Depois que a conta
   *  existe isto é só histórico — ver `contaPlano`. */
  plano: string;
  is_admin: boolean;
  /** Estado real da conta, quando ela já existe. Sem isto a tela mostra o
   *  plano do convite pra quem já se cadastrou e mudou de plano depois, o que
   *  é mentira. null = conta ainda não existe. */
  contaPlano: string | null;
  contaAdmin: boolean | null;
}

// Nota: verificarConvite (usada pelo fluxo público de cadastro em polia-app,
// src/routes/auth/cadastro.tsx) não foi portada aqui — este app só precisa das
// funções administrativas usadas por routes/crm/convites.tsx.

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

/**
 * Mapa e-mail → estado do perfil, pros convites já usados. `profiles` não tem
 * coluna de e-mail (mora em auth.users), então não dá pra fazer isso num join
 * do PostgREST — precisa passar pela Admin API.
 */
async function estadoDasContas(
  emails: string[],
): Promise<Map<string, { plano: string | null; is_admin: boolean }>> {
  const mapa = new Map<string, { plano: string | null; is_admin: boolean }>();
  if (emails.length === 0) return mapa;

  const procurados = new Set(emails);
  const idPorEmail = new Map<string, string>();
  // Paginado: a Admin API devolve no máximo 1000 por página e a lista de
  // usuárias cresce. Teto de 10 páginas pra não girar sem fim se algo mudar.
  for (let pagina = 1; pagina <= 10; pagina++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: pagina,
      perPage: 1000,
    });
    if (error) {
      console.error("[Convites] Falha ao listar contas:", error);
      return mapa;
    }
    (data?.users ?? []).forEach((u) => {
      const email = (u.email ?? "").toLowerCase();
      if (procurados.has(email)) idPorEmail.set(email, u.id);
    });
    if ((data?.users ?? []).length < 1000) break;
  }
  if (idPorEmail.size === 0) return mapa;

  const { data: perfis } = await supabaseAdmin
    .from("profiles")
    .select("id, plano, is_admin")
    .in("id", [...idPorEmail.values()]);

  const perfilPorId = new Map(
    ((perfis ?? []) as { id: string; plano: string | null; is_admin: boolean | null }[]).map(
      (p) => [p.id, p],
    ),
  );
  idPorEmail.forEach((id, email) => {
    const perfil = perfilPorId.get(id);
    if (perfil) mapa.set(email, { plano: perfil.plano, is_admin: Boolean(perfil.is_admin) });
  });
  return mapa;
}

export const listarConvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await supabaseAdmin
      .from("convites_cadastro")
      .select("email, criado_em, usado_em, enviado_em, plano, is_admin")
      .order("criado_em", { ascending: false });
    if (error) throw new Error("Falha ao listar convites.");

    const linhas = (data ?? []) as Omit<ConviteListItem, "contaPlano" | "contaAdmin">[];
    const contas = await estadoDasContas(linhas.filter((l) => l.usado_em).map((l) => l.email));

    return {
      convites: linhas.map((l) => {
        const conta = contas.get(l.email);
        return {
          ...l,
          is_admin: Boolean(l.is_admin),
          contaPlano: conta?.plano ?? null,
          contaAdmin: conta ? conta.is_admin : null,
        };
      }) as ConviteListItem[],
    };
  });

export const criarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => acessoInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("convites_cadastro").insert({
      email: data.email,
      plano: data.plano,
      is_admin: data.is_admin,
    });
    if (error) {
      if (error.code === "23505") throw new Error("Esse e-mail já tem convite.");
      throw new Error("Falha ao criar convite.");
    }
    // Acesso de administradora tem ação própria no log: é o que dá entrada no
    // office inteiro, não pode ficar indistinguível de "liberei mais um e-mail".
    await logAcaoAdminServer(
      context.userId,
      data.is_admin ? "criar_convite_admin" : "criar_convite",
      `${data.email} · plano ${data.plano}`,
    );
    return { ok: true };
  });

/**
 * Corrige o tipo de acesso de um convite que ainda não foi usado. Bloqueia
 * convite já usado de propósito: o gatilho aplicar_convite_no_perfil() só roda
 * no nascimento da conta, então editar depois não mudaria nada — e uma tela que
 * aceita a edição em silêncio é pior que uma que recusa.
 */
export const atualizarAcessoDoConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => acessoInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: convite } = await supabaseAdmin
      .from("convites_cadastro")
      .select("usado_em")
      .eq("email", data.email)
      .maybeSingle();
    if (!convite) throw new Error("Esse e-mail não está na lista de convites.");
    if ((convite as ConviteRow).usado_em) {
      throw new Error(
        "Essa pessoa já criou a conta. O convite não muda mais o acesso dela — isso agora é mudança no perfil.",
      );
    }

    const { error } = await supabaseAdmin
      .from("convites_cadastro")
      .update({ plano: data.plano, is_admin: data.is_admin })
      .eq("email", data.email);
    if (error) throw new Error("Falha ao mudar o acesso do convite.");

    await logAcaoAdminServer(
      context.userId,
      data.is_admin ? "convite_acesso_admin" : "convite_acesso",
      `${data.email} · plano ${data.plano}`,
    );
    return { ok: true };
  });

const SITE_URL = "https://one.usepolia.com.br";

export const enviarConvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => emailInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: convite } = await supabaseAdmin
      .from("convites_cadastro")
      .select("usado_em, plano")
      .eq("email", data.email)
      .maybeSingle();
    if (!convite) throw new Error("Esse e-mail não está na lista de convites.");
    if ((convite as ConviteRow).usado_em) {
      throw new Error("Essa pessoa já criou a conta — não precisa reenviar.");
    }

    // O e-mail nomeia o plano, mas não menciona acesso de administradora: quem
    // recebe isso cria a conta do mesmo jeito, e anunciar poder de admin num
    // e-mail não ajuda ninguém.
    const plano = (convite as { plano?: string }).plano ?? "confere";
    const nome = PLANOS_CONVITE.find((p) => p.valor === plano)?.nomeNoEmail ?? "Grátis";

    const link = `${SITE_URL}/auth/cadastro?email=${encodeURIComponent(data.email)}`;
    const enviado = await enviarEmailResend({
      to: [data.email],
      subject: "Você foi convidada pra Pólia",
      text: `Você tem acesso liberado à Pólia, sem custo, no ${nome}.\n\nAceita o convite e cria sua conta:\n${link}`,
      html: emailPolia({
        preheader: "Seu acesso à Pólia está liberado.",
        headline: "Você foi convidada pra Pólia",
        paragrafos: [
          `Alguém liberou seu acesso à Pólia, sem custo, no ${nome}. É só aceitar o convite e criar sua conta.`,
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
