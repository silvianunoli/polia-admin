import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/*
  O Fábrica Social é outro produto, com outro banco Supabase (projeto "Fábrica
  de Posts", zfsistnimeftijsasojw — não confundir com o projeto "Pólia" que o
  resto do polia-admin usa). Por isso este cliente é SEPARADO do
  `@/integrations/supabase/client`: sessão, tabelas e RLS não têm nada a ver
  com o admin da Pólia.

  `storageKey` explícito para não depender do default (que já separa por
  projeto, mas fica claro aqui e evita qualquer colisão se algum dia os dois
  projetos compartilharem parte do ref).

  A sessão deste cliente nunca nasce de e-mail/senha digitados aqui — ela é
  criada pela ponte em `fabrica-social-auth.functions.ts`: server function que
  confere que você é admin da Central e devolve um magic link só-uso para a
  SUA conta do Fábrica Social, que este cliente troca por uma sessão real via
  `verifyOtp`. Ver `src/context/fabrica-social/AuthContext.tsx`.
*/

const url = import.meta.env.VITE_FABRICA_SOCIAL_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_FABRICA_SOCIAL_SUPABASE_ANON_KEY as string | undefined;

export const fabricaSocialSupabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storageKey: "sb-fabrica-social-auth-token",
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

/** true quando faltam as variáveis do Fábrica Social — a seção fica "em breve" em vez de quebrar. */
export const fabricaSocialNaoConfigurado = fabricaSocialSupabase === null;
