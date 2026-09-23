import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/*
  Ponte de sessão entre a Central (projeto Supabase "Pólia") e o Fábrica
  Social (projeto Supabase "Fábrica de Posts", zfsistnimeftijsasojw) — dois
  bancos, uma porta de entrada.

  Por que uma ponte, e não um login único de verdade: os dois produtos usam
  projetos Supabase diferentes, criados em épocas diferentes, com usuárias que
  não batem por e-mail (a conta do Fábrica Social nasceu antes da Central
  existir). Unificar os bancos exigiria migrar dados de produção com posts e
  agendamentos rodando — risco que não faz sentido correr só pra evitar dois
  logins. Ver §Fábrica Social no CLAUDE.md.

  Como funciona, passo a passo:
    1. O navegador chama esta server function com o Bearer token da SESSÃO DA
       CENTRAL (`requireSupabaseAuth` já valida isso e confere `is_admin`,
       igual ao padrão de `boards.functions.ts`).
    2. `PASSE_FABRICA_SOCIAL` diz qual conta do Fábrica Social esse admin da
       Central pode usar. É uma lista curta e explícita, não uma convenção por
       e-mail — se as contas não estão ligadas por natureza, não finjo que
       estão.
    3. Com o SERVICE ROLE do projeto Fábrica Social (nunca exposto ao
       navegador), gera um magic link de uso único (`admin.generateLink`) pra
       aquela conta.
    4. Devolve só o e-mail e o `hashed_token` — o suficiente pro navegador
       trocar por uma sessão real via `verifyOtp` no cliente do Fábrica Social
       (`fabrica-social/supabase.ts`). Da metade pra cá, a sessão é uma sessão
       normal do Supabase Auth do Fábrica Social, sujeita às MESMAS políticas
       de RLS de sempre — a ponte não abre nenhum atalho na segurança de lá,
       só evita pedir senha de novo.
*/

// Só quem está aqui ganha passe. Chave: user id da Central (auth.users do
// projeto "Pólia"). Valor: user id correspondente no Fábrica Social.
const PASSE_FABRICA_SOCIAL: Record<string, string> = {
  // Sil — dona das duas contas.
  "5be97dcd-d0e3-4fce-835d-48bb4d9fbaec": "e34167b3-8fc9-4652-9bb9-68351cce7d39",
};

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

export const iniciarSessaoFabricaSocial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const fabricaUserId = PASSE_FABRICA_SOCIAL[context.userId];
    if (!fabricaUserId) {
      throw new Error("Esta conta não tem acesso ao Fábrica Social. Fale com a Sil.");
    }

    const url = process.env.FABRICA_SOCIAL_SUPABASE_URL;
    const serviceKey = process.env.FABRICA_SOCIAL_SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        "Fábrica Social não configurado neste ambiente (faltam FABRICA_SOCIAL_SUPABASE_URL / " +
          "FABRICA_SOCIAL_SUPABASE_SERVICE_ROLE_KEY nos secrets do Worker).",
      );
    }

    // Cliente à parte, nunca o `supabaseAdmin` do arquivo importado acima —
    // aquele é o service role do projeto "Pólia"; este é o do "Fábrica de
    // Posts". Sem persistência: vive só o tempo desta chamada.
    const fabricaAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } =
      await fabricaAdmin.auth.admin.getUserById(fabricaUserId);
    if (userErr || !userData?.user?.email) {
      throw new Error("Não achei a conta do Fábrica Social — o id do mapa pode estar errado.");
    }

    const { data: linkData, error: linkErr } = await fabricaAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: userData.user.email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(
        `Não consegui gerar o acesso ao Fábrica Social: ${linkErr?.message ?? "sem motivo"}`,
      );
    }

    return {
      email: userData.user.email,
      tokenHash: linkData.properties.hashed_token,
    };
  });
