import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { logAcaoAdminServer } from "@/lib/audit-log.server";
import {
  WABA_POLIA,
  canaisConfigurados,
  contaInstagramConectada,
  lerContaWhatsapp,
  ligarAppNaContaWhatsapp,
  type ContaWhatsapp,
} from "@/lib/conversas-meta.server";

// Tela /crm/canais: em que pé está cada canal e o botão de ligar o WhatsApp da Pólia ao office
// sem tirar do ManyChat (decisão da Sil em 26/10/2026).

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

const wabaInput = z.object({ wabaId: z.string().regex(/^\d{6,30}$/, "ID da conta inválido.") });

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "A Meta não respondeu.";
}

export const estadoDosCanais = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const segredos = canaisConfigurados();

    let instagram: { username: string; erro: string | null } = { username: "", erro: null };
    try {
      instagram = { username: (await contaInstagramConectada()).username, erro: null };
    } catch (e) {
      instagram = { username: "", erro: msg(e) };
    }

    const temTokenWhatsapp = Boolean(process.env.WHATSAPP_ACCESS_TOKEN);
    return {
      segredos,
      instagram,
      whatsapp: {
        temToken: temTokenWhatsapp,
        numeroConfigurado: process.env.WHATSAPP_PHONE_NUMBER_ID ?? null,
        wabaPadrao: WABA_POLIA,
      },
    };
  });

export const lerWhatsapp = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => wabaInput.parse(input))
  .handler(
    async ({ context, data }): Promise<{ conta: ContaWhatsapp | null; erro: string | null }> => {
      await assertAdmin(context.userId);
      try {
        return { conta: await lerContaWhatsapp(data.wabaId), erro: null };
      } catch (e) {
        return { conta: null, erro: msg(e) };
      }
    },
  );

export const conectarWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => wabaInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    try {
      await ligarAppNaContaWhatsapp(data.wabaId);
      await logAcaoAdminServer(context.userId, "canal_whatsapp_conectar", data.wabaId);
      return { conta: await lerContaWhatsapp(data.wabaId), erro: null };
    } catch (e) {
      return { conta: null, erro: msg(e) };
    }
  });
