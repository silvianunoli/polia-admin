import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CARROSSEL_POLIA_ONE } from "./boards/carrossel/polia-one";
import anzylnaB64 from "./boards/carrossel/polia-one/ativos/anzylna.b64.txt?raw";
import telasSoltasB64 from "./boards/carrossel/polia-one/ativos/telas-soltas.b64.txt?raw";
import procuraEAchaB64 from "./boards/carrossel/polia-one/ativos/procura-e-acha.b64.txt?raw";
import caminhoB64 from "./boards/carrossel/polia-one/ativos/caminho.b64.txt?raw";

// Os carrosséis nascem no chat e são revisados aqui. O HTML de cada prancha
// fica no banco; a fonte e as ilustrações ficam no bundle do servidor e são
// servidas por RPC autenticado, pelo mesmo motivo dos boards: asset em
// public/ sairia pelo ASSETS binding da Cloudflare sem passar pelo guard.
//
// No HTML guardado, fonte e ilustração aparecem como marcador ({{fonte}},
// {{img:caminho}}) em vez de data: URI. Sem isso o editor abriria com
// centenas de kB de base64 no meio do markup e ficaria impossível de usar.

async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

const semQuebras = (b64: string) => b64.replace(/\s/g, "");

const ATIVOS = {
  fonte: `data:font/ttf;base64,${semQuebras(anzylnaB64)}`,
  imagens: {
    "telas-soltas": `data:image/jpeg;base64,${semQuebras(telasSoltasB64)}`,
    "procura-e-acha": `data:image/jpeg;base64,${semQuebras(procuraEAchaB64)}`,
    caminho: `data:image/jpeg;base64,${semQuebras(caminhoB64)}`,
  },
};

type SlideRow = { id: string; ordem: number; titulo: string; html: string };

// Semeia o carrossel de partida uma vez só. A partir daí o banco manda:
// se ela apagar uma prancha lá, não volta sozinha.
async function garantirSeed() {
  const { data: existente } = await supabaseAdmin
    .from("office_carrosseis")
    .select("id")
    .eq("slug", CARROSSEL_POLIA_ONE.slug)
    .maybeSingle();
  if (existente) return;

  const { data: criado, error } = await supabaseAdmin
    .from("office_carrosseis")
    .insert({
      slug: CARROSSEL_POLIA_ONE.slug,
      titulo: CARROSSEL_POLIA_ONE.titulo,
      descricao: CARROSSEL_POLIA_ONE.descricao,
      largura: CARROSSEL_POLIA_ONE.largura,
      altura: CARROSSEL_POLIA_ONE.altura,
      css_base: CARROSSEL_POLIA_ONE.cssBase,
    })
    .select("id")
    .single();
  if (error || !criado) throw new Error("Não consegui criar o carrossel de partida.");

  const { error: erroSlides } = await supabaseAdmin.from("office_carrossel_slides").insert(
    CARROSSEL_POLIA_ONE.slides.map((s) => ({
      carrossel_id: criado.id,
      ordem: s.ordem,
      titulo: s.titulo,
      html: s.html,
    })),
  );
  if (erroSlides) throw new Error("Não consegui criar as pranchas de partida.");
}

export const listarCarrosseis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    await garantirSeed();

    const { data, error } = await supabaseAdmin
      .from("office_carrosseis")
      .select("id, slug, titulo, descricao, atualizado_em, office_carrossel_slides(id)")
      .order("atualizado_em", { ascending: false });
    if (error) throw new Error("Não consegui listar os carrosséis.");

    return (data ?? []).map((c) => ({
      id: c.id as string,
      slug: c.slug as string,
      titulo: c.titulo as string,
      descricao: c.descricao as string,
      atualizadoEm: c.atualizado_em as string,
      pranchas: (c.office_carrossel_slides as unknown[] | null)?.length ?? 0,
    }));
  });

export const buscarCarrossel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    await garantirSeed();

    const { data: carrossel, error } = await supabaseAdmin
      .from("office_carrosseis")
      .select("id, slug, titulo, descricao, largura, altura, css_base")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error || !carrossel) throw new Error("Carrossel não encontrado.");

    const { data: slides } = await supabaseAdmin
      .from("office_carrossel_slides")
      .select("id, ordem, titulo, html")
      .eq("carrossel_id", carrossel.id)
      .order("ordem", { ascending: true });

    return {
      id: carrossel.id as string,
      slug: carrossel.slug as string,
      titulo: carrossel.titulo as string,
      descricao: carrossel.descricao as string,
      largura: carrossel.largura as number,
      altura: carrossel.altura as number,
      cssBase: carrossel.css_base as string,
      slides: (slides ?? []) as SlideRow[],
    };
  });

// Fonte e ilustrações vão numa chamada separada: são os mesmos bytes para as
// sete pranchas, então carregam uma vez e ficam em memória no client.
export const buscarAtivosCarrossel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return ATIVOS;
  });

export const salvarSlide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        titulo: z.string().max(120),
        html: z.string().max(400_000),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const agora = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("office_carrossel_slides")
      .update({ titulo: data.titulo, html: data.html, atualizado_em: agora })
      .eq("id", data.id);
    if (error) throw new Error("Não consegui salvar a prancha.");

    // O carrossel guarda a data da última mexida em qualquer prancha, que é
    // o que a lista mostra.
    const { data: slide } = await supabaseAdmin
      .from("office_carrossel_slides")
      .select("carrossel_id")
      .eq("id", data.id)
      .maybeSingle();
    if (slide?.carrossel_id) {
      await supabaseAdmin
        .from("office_carrosseis")
        .update({ atualizado_em: agora })
        .eq("id", slide.carrossel_id);
    }

    return { atualizadoEm: agora };
  });
