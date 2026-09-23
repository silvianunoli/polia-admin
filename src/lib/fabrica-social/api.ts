import { fabricaSocialSupabase as supabase } from "./supabase";
import { isoDeLocal } from "./tempo";
import {
  brands as mockBrands,
  posts as mockPosts,
  calendarEntries as mockCalendar,
  inspirationSources as mockSources,
  inspirations as mockInspirations,
  creditTransactions as mockTransactions,
  type Brand,
  type BrandBrief,
  type Post,
  type CalendarEntry,
  type InspirationSource,
  type Inspiration,
  type CreditTransaction,
} from "./mock";

/*
  Camada de acesso a dados: PostgREST (supabase.from) sobre as tabelas fs_*,
  com fallback para os mocks quando não há backend configurado.
  Mapeia snake_case (banco) → camelCase (app).
*/

/* eslint-disable @typescript-eslint/no-explicit-any */

function mapBrand(r: any): Brand {
  return {
    id: r.id,
    name: r.name,
    emoji: r.emoji,
    sector: r.sector ?? "",
    toneOfVoice: r.tone_of_voice ?? "",
    colors: Array.isArray(r.colors) ? r.colors : [],
    instagramHandle: r.instagram_handle ?? undefined,
    isDemo: r.owner_id === null,
    brief: r.brief && typeof r.brief === "object" ? r.brief : {},
    characterRefs: Array.isArray(r.character_ref_urls) ? r.character_ref_urls.length : 0,
    petRefs: Array.isArray(r.pet_ref_urls) ? r.pet_ref_urls.length : 0,
  };
}

/**
 * Salva o briefing de design da marca. É a única entrada do usuário que
 * alimenta ao mesmo tempo o prompt da IA e o funil de seleção de template.
 */
export async function updateBrandBrief(
  brandId: string,
  brief: BrandBrief,
  /**
   * Setor e tom de voz vivem em colunas próprias, não no brief — mas pesam
   * tanto no prompt quanto ele. Antes só dava para defini-los na criação da
   * marca, o que deixava um setor errado impossível de corrigir pela tela.
   */
  identity?: { sector: string; toneOfVoice: string },
): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  /*
    Mescla em vez de substituir. O `brief` é um jsonb único e o formulário só
    conhece os campos que ele mostra — gravar o objeto cru apagaria em silêncio
    qualquer chave que a tela não exiba. Já aconteceu: campos antigos sumiram no
    primeiro salvamento depois de uma reestruturação da tela.
  */
  const { data: atual } = await supabase
    .from("fs_brands")
    .select("brief")
    .eq("id", brandId)
    .maybeSingle();
  const merged = { ...((atual?.brief ?? {}) as Record<string, unknown>), ...brief };

  const patch: Record<string, unknown> = { brief: merged };
  if (identity) {
    patch.sector = identity.sector;
    patch.tone_of_voice = identity.toneOfVoice;
  }
  const { data, error } = await supabase
    .from("fs_brands")
    .update(patch)
    .eq("id", brandId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Marca de demonstração não pode ser editada.");
  }
}

export async function createBrand(input: {
  name: string;
  emoji: string;
  sector: string;
  toneOfVoice: string;
  instagramHandle?: string;
}): Promise<Brand> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");
  const { data, error } = await supabase
    .from("fs_brands")
    .insert({
      owner_id: userData.user.id,
      name: input.name,
      emoji: input.emoji || "🏷️",
      sector: input.sector,
      tone_of_voice: input.toneOfVoice,
      colors: ["#2383E2", "#F7F7F5", "#37352F"],
      instagram_handle: input.instagramHandle || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapBrand(data);
}

export async function deleteBrand(brandId: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { data, error } = await supabase.from("fs_brands").delete().eq("id", brandId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Marca de demonstração não pode ser excluída.");
  }
}

function mapPost(r: any): Post {
  return {
    id: r.id,
    brandId: r.brand_id,
    title: r.title,
    caption: r.caption,
    formatId: r.format_id,
    platforms: r.platforms ?? [],
    status: r.status,
    scheduledFor: r.scheduled_for ?? undefined,
    approvalState: r.approval_state ?? undefined,
    clientComment: r.client_comment ?? undefined,
    fabricJson: r.fabric_json ?? undefined,
    script: r.script ?? undefined,
    imageUrl: r.image_url ?? undefined,
    publishError: r.publish_error ?? undefined,
    publishAttempts: r.publish_attempts ?? 0,
    publishResults: r.publish_results ?? undefined,
    isDemo: r.owner_id === null,
    createdAt: r.created_at,
  };
}

function mapCalendarEntry(r: any): CalendarEntry {
  return {
    id: r.id,
    brandId: r.brand_id,
    date: r.date,
    title: r.title,
    summary: r.summary ?? undefined,
    formatId: r.format_id ?? undefined,
    objective: r.objective ?? undefined,
    postId: r.post_id ?? undefined,
    platforms: r.platforms ?? [],
  };
}

function mapSource(r: any): InspirationSource {
  return {
    id: r.id,
    brandId: r.brand_id,
    type: r.type,
    label: r.label,
    filePath: r.file_path ?? undefined,
    frequency: r.frequency ?? undefined,
  };
}

function mapInspiration(r: any): Inspiration {
  return {
    id: r.id,
    brandId: r.brand_id,
    title: r.title,
    summary: r.summary,
    sourceLabel: r.source_label,
  };
}

function mapTransaction(r: any): CreditTransaction {
  return { id: r.id, date: r.date, action: r.action, amount: r.amount };
}

export async function fetchBrands(): Promise<Brand[]> {
  if (!supabase) return mockBrands;
  const { data, error } = await supabase.from("fs_brands").select("*").order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapBrand);
}

export async function fetchPosts(brandId: string): Promise<Post[]> {
  if (!supabase) return mockPosts.filter((p) => p.brandId === brandId);
  const { data, error } = await supabase
    .from("fs_posts")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPost);
}

export async function fetchCalendarEntries(brandId: string): Promise<CalendarEntry[]> {
  if (!supabase) return mockCalendar.filter((c) => c.brandId === brandId);
  const { data, error } = await supabase
    .from("fs_calendar_entries")
    .select("*")
    .eq("brand_id", brandId)
    .order("date");
  if (error) throw error;
  return (data ?? []).map(mapCalendarEntry);
}

export async function createCalendarEntry(input: {
  brandId: string;
  date: string;
  title: string;
  summary?: string;
  formatId?: string;
  objective?: string;
}): Promise<CalendarEntry> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");
  const { data, error } = await supabase
    .from("fs_calendar_entries")
    .insert({
      owner_id: userData.user.id,
      brand_id: input.brandId,
      date: input.date,
      title: input.title,
      summary: input.summary ?? null,
      format_id: input.formatId ?? null,
      objective: input.objective ?? null,
      platforms: ["instagram"],
    })
    .select()
    .single();
  if (error) throw error;
  return mapCalendarEntry(data);
}

/** Remarca uma pauta. Post agendado tem função própria — ver `reschedulePost`. */
export async function moveCalendarEntry(id: string, date: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { error } = await supabase.from("fs_calendar_entries").update({ date }).eq("id", id);
  if (error) throw error;
}

export async function deleteCalendarEntry(id: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { error } = await supabase.from("fs_calendar_entries").delete().eq("id", id);
  if (error) throw error;
}

/*
  Remarcar um POST é diferente de remarcar uma pauta: mexe em `scheduled_for`,
  que é o campo que o cron de publicação lê. Arrastar no calendário muda quando
  o post vai ao ar de verdade — por isso preserva a hora já escolhida e troca
  só o dia.
*/
export async function reschedulePost(
  postId: string,
  date: string,
  horaAtual?: string,
): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const hora = horaAtual ?? "09:00:00";
  const { error } = await supabase
    .from("fs_posts")
    // `isoDeLocal`: a data vem do calendário e a hora da tela, ambas locais.
    // Sem a conversão o Postgres lia como UTC e o post saía 3h antes.
    .update({ scheduled_for: isoDeLocal(`${date}T${hora}`), status: "scheduled" })
    .eq("id", postId);
  if (error) throw error;
}

/**
 * Planeja as pautas do mês (NÃO gera peças). Devolve quantas entraram.
 * Custa 2 créditos — gerar as peças depois custa 15 cada, à parte.
 */
export async function planMonth(params: {
  brandId: string;
  year: number;
  month: number;
  perWeek: number;
}): Promise<{ inserted: number; cost: number }> {
  if (!supabase) throw new Error("backend não configurado");
  const { data, error } = await supabase.functions.invoke("plan-month", { body: params });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json();
        if (body?.error === "insufficient_credits") {
          throw new InsufficientCreditsError(body.required, body.available);
        }
        if (body?.message) throw new Error(body.message);
      } catch (e) {
        if (e instanceof Error) throw e;
      }
    }
    throw error;
  }
  return { inserted: Number(data?.inserted ?? 0), cost: Number(data?.cost ?? 0) };
}

/** Liga a pauta ao post gerado a partir dela. */
export async function linkCalendarEntryToPost(entryId: string, postId: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { error } = await supabase
    .from("fs_calendar_entries")
    .update({ post_id: postId })
    .eq("id", entryId);
  if (error) throw error;
}

export async function fetchInspirationSources(brandId: string): Promise<InspirationSource[]> {
  if (!supabase) return mockSources.filter((s) => s.brandId === brandId);
  const { data, error } = await supabase
    .from("fs_inspiration_sources")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapSource);
}

export async function fetchInspirations(brandId: string): Promise<Inspiration[]> {
  if (!supabase) return mockInspirations.filter((i) => i.brandId === brandId);
  const { data, error } = await supabase
    .from("fs_inspirations")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapInspiration);
}

export async function createInspirationSource(input: {
  brandId: string;
  type: InspirationSource["type"];
  label: string;
  frequency?: InspirationSource["frequency"];
  /** PDF ou TXT enviado do computador, em vez de URL. */
  file?: File;
}): Promise<InspirationSource> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");

  /*
    Bucket PRIVADO: documento que a cliente sobe não é arte pública. O uid na
    primeira pasta é o que a policy de INSERT exige — mudar o caminho aqui
    quebra o upload no servidor, não no type-check.
  */
  let filePath: string | null = null;
  if (input.file) {
    const ext = input.file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "txt";
    filePath = `${userData.user.id}/${input.brandId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("inspiration-files")
      .upload(filePath, input.file, { contentType: input.file.type || undefined, upsert: false });
    if (upErr) throw upErr;
  }

  const { data, error } = await supabase
    .from("fs_inspiration_sources")
    .insert({
      owner_id: userData.user.id,
      brand_id: input.brandId,
      type: input.type,
      label: input.label,
      file_path: filePath,
      // Recorrentes: site, busca e Instagram. Vídeo e arquivo rodam uma vez.
      frequency: input.frequency ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return mapSource(data);
}

export async function deleteInspirationSource(id: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  // O arquivo sai junto: fonte apagada com PDF órfão no bucket é lixo que
  // ninguém mais consegue nem ver nem remover pela interface.
  const { data: fonte } = await supabase
    .from("fs_inspiration_sources")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("fs_inspiration_sources").delete().eq("id", id);
  if (error) throw error;
  if (fonte?.file_path) {
    await supabase.storage.from("inspiration-files").remove([fonte.file_path]);
  }
}

export async function deleteInspiration(id: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { error } = await supabase.from("fs_inspirations").delete().eq("id", id);
  if (error) throw error;
}

/** Lê a fonte e grava pautas novas. Devolve quantas entraram. */
export async function collectInspirations(sourceId: string): Promise<number> {
  if (!supabase) throw new Error("backend não configurado");
  const { data, error } = await supabase.functions.invoke("collect-inspirations", {
    body: { sourceId },
  });
  if (error) {
    // A mensagem útil vem no corpo da resposta, não no erro do cliente.
    const detail = (data as { message?: string } | null)?.message;
    throw new Error(detail ?? error.message);
  }
  return Number(data?.inserted ?? 0);
}

// ===== Editor (Fase 4) =====

export async function fetchPost(postId: string): Promise<Post | null> {
  if (!supabase) return mockPosts.find((p) => p.id === postId) ?? null;
  const { data, error } = await supabase
    .from("fs_posts")
    .select("*")
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPost(data) : null;
}

export class ReadOnlyPostError extends Error {
  constructor() {
    super("read_only_post");
  }
}

/**
 * Salva o conteúdo editado. RLS garante que só o dono altera; posts demo
 * (owner_id null) são somente leitura — o update volta vazio e sinalizamos.
 */
export async function updatePostContent(
  postId: string,
  changes: { title?: string; caption?: string; fabricJson?: unknown },
): Promise<void> {
  if (!supabase) {
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  const payload: Record<string, unknown> = {};
  if (changes.title !== undefined) payload.title = changes.title;
  if (changes.caption !== undefined) payload.caption = changes.caption;
  if (changes.fabricJson !== undefined) payload.fabric_json = changes.fabricJson;
  const { data, error } = await supabase
    .from("fs_posts")
    .update(payload)
    .eq("id", postId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ReadOnlyPostError();
}

// ===== Publicação Meta (Fase 6) =====

export const META_APP_ID = "1014885174872706";

export interface SocialConnection {
  id: string;
  brandId: string;
  platform: string;
  pageName?: string;
  igUsername?: string;
  /** TikTok: @ e nome de exibição do criador que autorizou. */
  ttUsername?: string;
  ttDisplayName?: string;
  /** TikTok: quando a autorização (refresh token, 365 dias) vence e é preciso reconectar. */
  refreshExpiresAt?: string;
}

export function buildMetaOAuthUrl(brandId: string): string {
  const redirectUri = `${window.location.origin}/conexoes/meta`;
  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: redirectUri,
    state: btoa(JSON.stringify({ brandId })),
    response_type: "code",
    /*
      pages_manage_posts ficou de fora: não é necessária para publicar no
      Instagram (só para o feed da Página do FB) e o app da Meta a rejeita.

      instagram_manage_insights entrou em 10/08/2026 para o LEITOR de perfis
      (business_discovery, na aba Inspiração). Publicar e ler são permissões
      separadas — o token só de publicar recebe "(#10) Application does not
      have permission for this action" ao tentar ler.

      Permissão nova só entra em token NOVO: quem já conectou precisa reconectar.
    */
    scope: [
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_content_publish",
      "instagram_manage_insights",
      "business_management",
    ].join(","),
  });
  return `https://www.facebook.com/v22.0/dialog/oauth?${params.toString()}`;
}

export async function fetchConnections(brandId: string): Promise<SocialConnection[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("fs_social_connections")
    .select(
      "id, brand_id, platform, page_name, ig_username, tt_username, tt_display_name, refresh_expires_at",
    )
    .eq("brand_id", brandId);
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    brandId: r.brand_id,
    platform: r.platform,
    pageName: r.page_name ?? undefined,
    igUsername: r.ig_username ?? undefined,
    ttUsername: r.tt_username ?? undefined,
    ttDisplayName: r.tt_display_name ?? undefined,
    refreshExpiresAt: r.refresh_expires_at ?? undefined,
  }));
}

// ===== Publicação TikTok =====

/*
  A chave do app é pública (vai na URL de autorização), mas não está no código
  como a da Meta porque ainda não existe: o app precisa ser criado no portal
  do TikTok. Vem do .env (VITE_TIKTOK_CLIENT_KEY) e, enquanto estiver vazia, a
  tela de Conexões avisa em vez de mandar a pessoa para um erro do TikTok.
*/
export const TIKTOK_CLIENT_KEY: string =
  (import.meta.env.VITE_TIKTOK_CLIENT_KEY as string | undefined) ?? "";
export const tiktokConfigurado = TIKTOK_CLIENT_KEY.length > 0;

/** Destinos que publicam de verdade. Os outros valores de `Platform` são só planejamento. */
export type PublishablePlatform = "instagram" | "tiktok";

export function buildTikTokOAuthUrl(brandId: string): string {
  const redirectUri = `${window.location.origin}/conexoes/tiktok`;
  const params = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY,
    /*
      user.info.basic  — identificar a conta
      video.publish    — publicar direto (vídeo e fotos)
      video.upload     — mandar para os rascunhos do app do TikTok (reserva)

      Os três precisam estar habilitados no app do portal do TikTok. Assim como
      na Meta, permissão nova só entra em token novo: reconectar.
    */
    scope: ["user.info.basic", "video.publish", "video.upload"].join(","),
    response_type: "code",
    redirect_uri: redirectUri,
    state: btoa(JSON.stringify({ brandId })),
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
}

export interface TikTokCallbackResult {
  ok?: boolean;
  tt_username?: string;
  tt_display_name?: string;
}

export async function tiktokCallback(params: {
  brandId: string;
  code: string;
}): Promise<TikTokCallbackResult> {
  if (!supabase) throw new Error("backend não configurado");
  const { data, error } = await supabase.functions.invoke("tiktok-callback", {
    body: {
      brandId: params.brandId,
      code: params.code,
      redirectUri: `${window.location.origin}/conexoes/tiktok`,
    },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json();
        if (body?.message) throw new Error(body.message);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw error;
  }
  return data as TikTokCallbackResult;
}

export interface MetaCallbackResult {
  ok?: boolean;
  ig_username?: string;
  requiresPageSelection?: boolean;
  pages?: Array<{ id: string; name: string; hasInstagram: boolean }>;
}

export async function metaCallback(params: {
  brandId: string;
  code?: string;
  pageId?: string;
}): Promise<MetaCallbackResult> {
  if (!supabase) throw new Error("backend não configurado");
  const { data, error } = await supabase.functions.invoke("meta-callback", {
    body: {
      brandId: params.brandId,
      code: params.code,
      page_id: params.pageId,
      redirectUri: `${window.location.origin}/conexoes/meta`,
    },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json();
        if (body?.message) throw new Error(body.message);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw error;
  }
  return data as MetaCallbackResult;
}

export async function publishPostNow(postId: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { error } = await supabase.functions.invoke("social-publish", { body: { postId } });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json();
        if (body?.message) throw new Error(body.message);
      } catch (e) {
        if (e instanceof Error && e.message) throw e;
      }
    }
    throw error;
  }
}

/**
 * Apaga o post e os arquivos dele. Sem volta.
 *
 * Os slides caem por CASCADE e a pauta do calendário só perde o vínculo
 * (`post_id` vira null) — a ideia continua marcada no dia, só a peça some. Isso
 * é de propósito: apagar a arte não é desistir da pauta.
 *
 * O storage é limpo ANTES do banco. Se limpasse depois e o delete falhasse, a
 * pessoa ficaria com um post visível apontando para imagens que não existem
 * mais. Falha ao apagar arquivo não interrompe: arquivo órfão custa centavos,
 * post que não sai da tela custa confiança.
 *
 * Um post já publicado continua no Instagram — isto aqui é a sua biblioteca,
 * não a conta. Quem chama precisa avisar.
 */
export async function deletePost(postId: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;

  if (uid) {
    try {
      const alvos = [`${uid}/${postId}.png`];
      // Mídia de upload manual: uma pasta por post, com um arquivo por peça.
      const { data: manuais } = await supabase.storage
        .from("post-images")
        .list(`${uid}/manual/${postId}`);
      for (const m of manuais ?? []) alvos.push(`${uid}/manual/${postId}/${m.name}`);
      await supabase.storage.from("post-images").remove(alvos);
    } catch {
      // segue para o delete do banco — ver comentário acima
    }
  }

  const { data, error } = await supabase.from("fs_posts").delete().eq("id", postId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ReadOnlyPostError();
}

export async function schedulePost(postId: string, when: string): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("fs_posts")
    // Idempotente: quem já manda ISO com fuso passa intacto.
    .update({ status: "scheduled", scheduled_for: isoDeLocal(when), publish_error: null })
    .eq("id", postId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ReadOnlyPostError();
}

/** Sobe a arte exportada do canvas (PNG) e grava image_url no post. */
export async function uploadPostImage(postId: string, dataUrl: string): Promise<string> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userData.user.id}/${postId}.png`;
  const { error: upError } = await supabase.storage
    .from("post-images")
    .upload(path, blob, { upsert: true, contentType: "image/png" });
  if (upError) throw upError;
  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
  // cache-buster: o upsert mantém a mesma URL e o Instagram pode cachear
  const url = `${pub.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from("fs_posts").update({ image_url: url }).eq("id", postId);
  if (error) throw error;
  return url;
}

// ===== Criação manual (upload) =====

export type ManualMediaType = "image" | "carousel" | "reels" | "story";

/*
  Post feito fora daqui: a arte já existe, só entra e é publicada ou agendada.

  Duas decisões que valem estar escritas:

  - A mídia vai para o bucket PÚBLICO. Não é escolha estética: a Graph API do
    Instagram BAIXA a mídia da URL que a gente manda. URL privada = publicação
    falha, sem volta por cima.
  - Cada peça vira também um `fabric_json` de uma camada só, com a imagem. Sem
    isso o Editor abriria vazio num post que claramente tem arte, e exportar
    apagaria o que a pessoa subiu.
*/
function fabricDeImagem(url: string, w: number, h: number) {
  return {
    version: "5.3.0",
    background: "#000000",
    objects: [
      {
        type: "image",
        originX: "left",
        originY: "top",
        src: url,
        crossOrigin: "anonymous",
        left: 0,
        top: 0,
        scaleX: 1,
        scaleY: 1,
        selectable: true,
      },
    ],
    // Guardado para o Editor saber o tamanho do canvas desta peça.
    width: w,
    height: h,
  };
}

async function uploadMidia(userId: string, postId: string, file: File, i: number): Promise<string> {
  if (!supabase) throw new Error("backend não configurado");
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const path = `${userId}/manual/${postId}/${String(i).padStart(2, "0")}.${ext}`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw error;
  const { data } = supabase.storage.from("post-images").getPublicUrl(path);
  return data.publicUrl;
}

export async function createManualPost(input: {
  brandId: string;
  title: string;
  caption: string;
  mediaType: ManualMediaType;
  /** Já na ordem de publicação. Vídeo: um arquivo só. */
  files: File[];
  /**
   * Para onde publicar. Sem informar, só Instagram — o comportamento de antes
   * do TikTok existir. É o que o social-publish lê para decidir os destinos.
   */
  platforms?: PublishablePlatform[];
  /** ISO local (AAAA-MM-DDTHH:mm) quando for agendar. */
  scheduledFor?: string;
  onProgress?: (feito: number, total: number) => void;
}): Promise<{ postId: string }> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");
  const userId = userData.user.id;
  if (input.files.length === 0) throw new Error("Nenhum arquivo para enviar.");
  const platforms: PublishablePlatform[] =
    input.platforms && input.platforms.length > 0 ? input.platforms : ["instagram"];

  const formatId =
    input.mediaType === "carousel"
      ? "carrossel-portrait"
      : input.mediaType === "reels"
        ? "reels"
        : input.mediaType === "story"
          ? "stories-unico"
          : "post-portrait";

  const { data: post, error: postErr } = await supabase
    .from("fs_posts")
    .insert({
      owner_id: userId,
      brand_id: input.brandId,
      title: input.title.slice(0, 160),
      caption: input.caption,
      format_id: formatId,
      platforms,
      media_type: input.mediaType,
      status: input.scheduledFor ? "scheduled" : "draft",
      // Vem cru do seletor `datetime-local` ("2026-08-12T11:00"), sem fuso.
      // Era este o caminho que publicava 3 horas antes do combinado.
      scheduled_for: input.scheduledFor ? isoDeLocal(input.scheduledFor) : null,
    })
    .select("id")
    .single();
  if (postErr || !post) throw postErr ?? new Error("post_insert_failed");

  const ehVideo =
    input.mediaType === "reels" ||
    (input.mediaType === "story" && input.files[0]?.type.startsWith("video/"));

  const urls: string[] = [];
  for (let i = 0; i < input.files.length; i++) {
    urls.push(await uploadMidia(userId, post.id, input.files[i], i));
    input.onProgress?.(i + 1, input.files.length);
  }

  if (ehVideo) {
    const { error } = await supabase
      .from("fs_posts")
      .update({ video_url: urls[0] })
      .eq("id", post.id);
    if (error) throw error;
  } else if (input.mediaType === "carousel") {
    const rows = urls.map((url, i) => ({
      owner_id: userId,
      post_id: post.id,
      position: i,
      image_url: url,
      fabric_json: fabricDeImagem(url, 1080, 1350),
    }));
    const { error } = await supabase.from("fs_post_slides").insert(rows);
    if (error) throw error;
    // A capa também vai no post: é ela que aparece na Biblioteca e no Portal.
    await supabase
      .from("fs_posts")
      .update({ image_url: urls[0], fabric_json: fabricDeImagem(urls[0], 1080, 1350) })
      .eq("id", post.id);
  } else {
    const { error } = await supabase
      .from("fs_posts")
      .update({ image_url: urls[0], fabric_json: fabricDeImagem(urls[0], 1080, 1350) })
      .eq("id", post.id);
    if (error) throw error;
  }

  return { postId: post.id };
}

// ===== Acervo de imagens por marca =====

export interface BrandAsset {
  id: string;
  brandId: string;
  /** `textura` é PNG com transparência aplicado como véu por cima da arte */
  subject: "character" | "pet" | "cenario" | "textura";
  url: string;
  /** PNG sem fundo, gerado uma vez no upload (só para personagem) */
  cutoutUrl?: string;
  width?: number;
  height?: number;
  label?: string;
  createdAt: string;
}

function mapAsset(r: any): BrandAsset {
  return {
    id: r.id,
    brandId: r.brand_id,
    subject: r.subject,
    url: r.url,
    cutoutUrl: r.cutout_url ?? undefined,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    label: r.label ?? undefined,
    createdAt: r.created_at,
  };
}

export async function fetchBrandAssets(brandId: string): Promise<BrandAsset[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("fs_brand_assets")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapAsset);
}

/*
  Upload em dois passos: o arquivo vai direto para o Storage pelo navegador, e
  só então a edge function registra o asset. Ela é quem lê as dimensões e gera o
  recorte sem fundo — a chave da Magnific não pode viver no cliente.
*/
export async function uploadBrandAsset(
  brandId: string,
  file: File,
  subject: BrandAsset["subject"],
): Promise<BrandAsset> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");

  const ext = (file.name.split(".").pop() ?? "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  // O nome precisa ser único: dois uploads do mesmo arquivo não podem se sobrescrever.
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  /*
    A PRIMEIRA pasta precisa ser o id do usuário: a política de INSERT do bucket
    `post-images` exige `(storage.foldername(name))[1] = auth.uid()`. Qualquer
    outro prefixo é recusado pelo Storage.
  */
  const path = `${userData.user.id}/brand-assets/${brandId}/${subject}-${stamp}.${ext}`;

  const { error: upError } = await supabase.storage
    .from("post-images")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (upError) throw upError;

  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);

  const { data, error } = await supabase.functions.invoke("prepare-brand-asset", {
    body: { brandId, url: pub.publicUrl, subject, label: file.name },
  });
  if (error) throw error;
  if (!data?.asset) throw new Error(data?.message ?? "falha ao registrar a imagem");
  return mapAsset(data.asset);
}

export async function deleteBrandAsset(assetId: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { error } = await supabase.from("fs_brand_assets").delete().eq("id", assetId);
  if (error) throw error;
}

// ===== Analytics (Fase 7) =====

export interface AccountSnapshot {
  date: string; // yyyy-mm-dd
  followers: number;
  reach: number;
  profileViews: number;
}

export interface PostMetrics {
  postId: string;
  title: string;
  formatId: string;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

/** Série mock determinística (sem backend) com o mesmo formato do banco. */
function mockAccountSeries(brandId: string): AccountSnapshot[] {
  const base = brandId === "brand-2" ? 12500 : brandId === "brand-3" ? 2100 : 4800;
  const growth = brandId === "brand-2" ? 35 : brandId === "brand-3" ? 6 : 12;
  const out: AccountSnapshot[] = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (29 - i));
    const followers = base + i * growth + ((i * 7) % 13) * 3;
    const reach = Math.round(followers / 3) + ((i * 11) % 17) * 9;
    out.push({
      date: d.toISOString().slice(0, 10),
      followers,
      reach,
      profileViews: Math.round(reach / 8),
    });
  }
  return out;
}

export async function fetchAccountSnapshots(brandId: string): Promise<AccountSnapshot[]> {
  if (!supabase) return mockAccountSeries(brandId);
  const { data, error } = await supabase
    .from("fs_account_analytics_snapshots")
    .select("captured_at, followers, reach, profile_views")
    .eq("brand_id", brandId)
    .order("captured_at");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    date: r.captured_at,
    followers: r.followers,
    reach: r.reach,
    profileViews: r.profile_views,
  }));
}

export async function fetchPostMetrics(brandId: string): Promise<PostMetrics[]> {
  if (!supabase) {
    return mockPosts
      .filter((p) => p.brandId === brandId)
      .map((p, i) => {
        const reach = 2400 + (((i + 1) * 913) % 3800);
        return {
          postId: p.id,
          title: p.title,
          formatId: p.formatId,
          reach,
          likes: Math.round(reach * 0.08),
          comments: Math.round(reach * 0.012),
          saves: Math.round(reach * 0.03),
          shares: Math.round(reach * 0.01),
        };
      })
      .sort((a, b) => b.reach - a.reach);
  }
  const { data, error } = await supabase
    .from("fs_post_analytics_snapshots")
    .select("reach, likes, comments, saves, shares, fs_posts!inner(id, title, format_id, brand_id)")
    .eq("fs_posts.brand_id", brandId)
    .order("reach", { ascending: false });
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    postId: r.fs_posts.id,
    title: r.fs_posts.title,
    formatId: r.fs_posts.format_id,
    reach: r.reach,
    likes: r.likes,
    comments: r.comments,
    saves: r.saves,
    shares: r.shares,
  }));
}

// ===== Portal do Cliente (Fase 5) =====

export interface PortalInfo {
  id: string;
  token: string;
  hasPassword: boolean;
}

export interface PortalPublicPost {
  id: string;
  title: string;
  caption: string;
  formatId: string;
  platforms: string[];
  status: string;
  scheduledFor?: string;
  approvalState?: "pending" | "approved" | "adjust";
  clientComment?: string;
}

export interface PortalPublicData {
  brand: { name: string; emoji: string; sector: string; colors: string[] };
  posts: PortalPublicPost[];
}

export class PortalError extends Error {
  constructor(public code: "not_found" | "password_required" | "internal") {
    super(code);
  }
}

/** Portal existente da marca (só o dono enxerga, via RLS). */
export async function fetchPortal(brandId: string): Promise<PortalInfo | null> {
  if (!supabase) return { id: "mock-portal", token: "demo-aurora", hasPassword: false };
  const { data, error } = await supabase
    .from("fs_portal_calendars")
    .select("id, token, password")
    .eq("brand_id", brandId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, token: data.token, hasPassword: !!data.password } : null;
}

export async function createPortal(brandId: string, password?: string): Promise<PortalInfo> {
  if (!supabase) return { id: "mock-portal", token: "demo-aurora", hasPassword: false };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");
  const { data, error } = await supabase
    .from("fs_portal_calendars")
    .insert({ brand_id: brandId, owner_id: userData.user.id, password: password || null })
    .select("id, token, password")
    .single();
  if (error) throw error;
  return { id: data.id, token: data.token, hasPassword: !!data.password };
}

async function invokePortal<T>(fn: string, body: unknown): Promise<T> {
  const { data, error } = await supabase!.functions.invoke(fn, {
    body: body as Record<string, unknown>,
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const parsed = await ctx.json();
        if (parsed?.error === "not_found" || parsed?.error === "password_required") {
          throw new PortalError(parsed.error);
        }
      } catch (e) {
        if (e instanceof PortalError) throw e;
      }
    }
    throw new PortalError("internal");
  }
  return data as T;
}

function mapPortalPost(r: any): PortalPublicPost {
  return {
    id: r.id,
    title: r.title,
    caption: r.caption,
    formatId: r.format_id,
    platforms: r.platforms ?? [],
    status: r.status,
    scheduledFor: r.scheduled_for ?? undefined,
    approvalState: r.approval_state ?? undefined,
    clientComment: r.client_comment ?? undefined,
  };
}

export async function portalPublicAccess(
  token: string,
  password?: string,
): Promise<PortalPublicData> {
  if (!supabase) {
    const brand = mockBrands[0];
    return {
      brand: { name: brand.name, emoji: brand.emoji, sector: brand.sector, colors: brand.colors },
      posts: mockPosts
        .filter((p) => p.brandId === brand.id)
        .map((p) => ({ ...p, scheduledFor: p.scheduledFor })),
    };
  }

  const data = await invokePortal<any>("portal-public-access", { token, password });
  return { brand: data.brand, posts: (data.posts ?? []).map(mapPortalPost) };
}

export async function portalPublicApprove(params: {
  token: string;
  password?: string;
  postId: string;
  action: "approve" | "adjust";
  comment?: string;
  name?: string;
}): Promise<void> {
  if (!supabase) {
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  await invokePortal("portal-public-approve", {
    token: params.token,
    password: params.password,
    post_id: params.postId,
    action: params.action,
    comment: params.comment,
    name: params.name,
  });
}

// ===== Slides de carrossel =====

export interface PostSlide {
  id: string;
  position: number;
  fabricJson?: unknown;
  imageUrl?: string;
}

export async function fetchSlides(postId: string): Promise<PostSlide[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("fs_post_slides")
    .select("id, position, fabric_json, image_url")
    .eq("post_id", postId)
    .order("position");
  if (error) throw error;

  return (data ?? []).map((r: any) => ({
    id: r.id,
    position: r.position,
    fabricJson: r.fabric_json ?? undefined,
    imageUrl: r.image_url ?? undefined,
  }));
}

export async function updateSlideFabric(slideId: string, fabricJson: unknown): Promise<void> {
  if (!supabase) return;
  const { data, error } = await supabase
    .from("fs_post_slides")
    .update({ fabric_json: fabricJson })
    .eq("id", slideId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ReadOnlyPostError();
}

/** Sobe a arte de um slide; se for a capa (posição 0), vira também a capa do post. */
export async function uploadSlideImage(
  postId: string,
  slideId: string,
  position: number,
  dataUrl: string,
): Promise<string> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${userData.user.id}/${postId}-s${position}.png`;
  const { error: upError } = await supabase.storage
    .from("post-images")
    .upload(path, blob, { upsert: true, contentType: "image/png" });
  if (upError) throw upError;
  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
  const url = `${pub.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase
    .from("fs_post_slides")
    .update({ image_url: url })
    .eq("id", slideId);
  if (error) throw error;
  if (position === 0) {
    await supabase.from("fs_posts").update({ image_url: url }).eq("id", postId);
  }
  return url;
}

// ===== Geração assíncrona (Fase 3) =====

export interface GenerationJob {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  postId?: string;
  error?: string;
}

export class InsufficientCreditsError extends Error {
  constructor(
    public required: number,
    public available: number,
  ) {
    super("insufficient_credits");
  }
}

/**
 * Dispara a Edge Function generate-post e devolve o job_id.
 * Em modo mock devolve um id local (o progresso é simulado no componente).
 */
export async function startGeneration(params: {
  brandId: string;
  idea: string;
  formatId: string;
  /** intenção do post: comentar | salvar | compartilhar | vender | divulgar */
  objective: string;
}): Promise<{ jobId: string; cost: number }> {
  if (!supabase) {
    await new Promise((r) => setTimeout(r, 300));
    return { jobId: `mock-${Date.now()}`, cost: 15 };
  }
  const { data, error } = await supabase.functions.invoke("generate-post", { body: params });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx instanceof Response) {
      try {
        const body = await ctx.json();
        if (body?.error === "insufficient_credits") {
          throw new InsufficientCreditsError(body.required, body.available);
        }
        if (body?.message) throw new Error(body.message);
      } catch (e) {
        if (e instanceof InsufficientCreditsError || e instanceof Error) throw e;
      }
    }
    throw error;
  }
  return { jobId: data.job_id, cost: data.cost };
}

export async function fetchGenerationJob(jobId: string): Promise<GenerationJob> {
  if (!supabase) return { id: jobId, status: "processing", progress: 50 };
  const { data, error } = await supabase
    .from("fs_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .single();
  if (error) throw error;
  return {
    id: data.id,
    status: data.status,
    progress: data.progress,
    postId: data.post_id ?? undefined,
    error: data.error ?? undefined,
  };
}

export async function fetchCreditTransactions(): Promise<CreditTransaction[]> {
  if (!supabase) return mockTransactions;
  const { data, error } = await supabase
    .from("fs_credit_transactions")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTransaction);
}

// ===== Modelos de arte por marca =====

/*
  Um modelo é um arquétipo (a forma) + a configuração que a pessoa escolheu +
  a marca dona. Pólia e Balumango podem não ter um único modelo em comum — foi
  esse o pedido que trocou o catálogo global por esta tabela.
*/
export interface BrandTemplate {
  id: string;
  brandId: string;
  kind: "capa" | "slide" | "cta";
  archetype: string;
  name: string;
  config: Record<string, unknown>;
  subject: "character" | "pet" | null;
  contentTypes: string[];
  roles: string[];
  enabled: boolean;
  position: number;
}

function mapBrandTemplate(r: any): BrandTemplate {
  return {
    id: r.id,
    brandId: r.brand_id,
    kind: r.kind,
    archetype: r.archetype,
    name: r.name,
    config: r.config ?? {},
    subject: r.subject ?? null,
    contentTypes: r.content_types ?? [],
    roles: r.roles ?? [],
    enabled: r.enabled,
    position: r.position ?? 0,
  };
}

export async function fetchBrandTemplates(brandId: string): Promise<BrandTemplate[]> {
  if (!supabase || !brandId) return [];
  const { data, error } = await supabase
    .from("fs_brand_templates")
    .select("*")
    .eq("brand_id", brandId)
    .order("kind")
    .order("position");
  if (error) throw error;
  return (data ?? []).map(mapBrandTemplate);
}

export async function createBrandTemplate(input: {
  brandId: string;
  kind: BrandTemplate["kind"];
  archetype: string;
  name: string;
  config: BrandTemplate["config"];
  subject?: BrandTemplate["subject"];
  contentTypes?: string[];
  roles?: string[];
}): Promise<BrandTemplate> {
  if (!supabase) throw new Error("backend não configurado");
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("not_authenticated");
  const { data, error } = await supabase
    .from("fs_brand_templates")
    .insert({
      owner_id: userData.user.id,
      brand_id: input.brandId,
      kind: input.kind,
      archetype: input.archetype,
      name: input.name,
      config: input.config,
      subject: input.subject ?? null,
      content_types: input.contentTypes ?? [],
      roles: input.roles ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return mapBrandTemplate(data);
}

export async function updateBrandTemplate(
  id: string,
  patch: Partial<
    Pick<BrandTemplate, "name" | "config" | "subject" | "contentTypes" | "roles" | "enabled">
  >,
): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const linha: Record<string, unknown> = {};
  if (patch.name !== undefined) linha.name = patch.name;
  if (patch.config !== undefined) linha.config = patch.config;
  if (patch.subject !== undefined) linha.subject = patch.subject;
  if (patch.contentTypes !== undefined) linha.content_types = patch.contentTypes;
  if (patch.roles !== undefined) linha.roles = patch.roles;
  if (patch.enabled !== undefined) linha.enabled = patch.enabled;
  const { error } = await supabase.from("fs_brand_templates").update(linha).eq("id", id);
  if (error) throw error;
}

export async function deleteBrandTemplate(id: string): Promise<void> {
  if (!supabase) throw new Error("backend não configurado");
  const { error } = await supabase.from("fs_brand_templates").delete().eq("id", id);
  if (error) throw error;
}
