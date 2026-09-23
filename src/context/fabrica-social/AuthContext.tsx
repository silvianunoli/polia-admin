import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fabricaSocialSupabase as supabase,
  fabricaSocialNaoConfigurado,
} from "@/lib/fabrica-social/supabase";
import { currentUser as mockUser, type CurrentUser } from "@/lib/fabrica-social/mock";
import type { PlanKey } from "@/lib/fabrica-social/credits";
import { iniciarSessaoFabricaSocial } from "@/lib/fabrica-social-auth.functions";

/*
  Versão da autenticação do Fábrica Social adaptada pra viver dentro da
  Central: aqui NÃO existe formulário de login. Quem chegou até `/fabrica-social`
  já passou pelo guard de admin da Central (`__root.tsx`) — o que falta é só
  trocar essa sessão por uma sessão real do Fábrica Social, e quem faz isso é
  `iniciarSessaoFabricaSocial` (a ponte, em `fabrica-social-auth.functions.ts`).

  Ordem na inicialização:
    1. getSession() — se já tem sessão válida (ex.: reload da página, token
       ainda não venceu), usa ela e pronto, sem chamar a ponte de novo.
    2. Sem sessão: chama a ponte, troca o token_hash por sessão via verifyOtp.
    3. Ponte falhou (ex.: conta sem passe) → `bridgeError`, mostrado pela
       tela em vez de deixar a pessoa presa num "carregando" infinito.
*/

interface AuthState {
  session: Session | null;
  profile: CurrentUser | null;
  loading: boolean;
  bridgeError: string | null;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchProfile(userId: string, email: string): Promise<CurrentUser> {
  const primeira = await supabase!.from("fs_profiles").select("*").eq("id", userId).maybeSingle();
  if (primeira.error) throw primeira.error;
  let data = primeira.data;
  if (!data) {
    const insert = await supabase!
      .from("fs_profiles")
      .insert({ id: userId, name: email.split("@")[0] })
      .select("*")
      .single();
    if (insert.error) throw insert.error;
    data = insert.data;
  }
  return {
    id: data.id,
    name: data.name || email.split("@")[0],
    email,
    plan: data.plan as PlanKey,
    credits: data.credits,
  };
}

export function AuthProviderFabricaSocial({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!fabricaSocialNaoConfigurado);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const tentouPonte = useRef(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        setSession(data.session);
        setLoading(false);
        return;
      }
      // Sem sessão ainda: primeira entrada nesta aba. Tenta a ponte uma vez —
      // StrictMode monta o efeito duas vezes, e um magic link já trocado por
      // sessão dá erro na segunda troca (token de uso único).
      if (tentouPonte.current) return;
      tentouPonte.current = true;
      try {
        const { tokenHash } = await iniciarSessaoFabricaSocial();
        // A API do Supabase é estrita aqui: com `token_hash`, `email` NÃO
        // pode vir junto -- "Only the token_hash and type should be
        // provided" é o erro exato que ela devolve se vier. `email` é só
        // pro OUTRO modo de verifyOtp (com o código de 6 dígitos), que não
        // é o que a ponte usa.
        //
        // TS não propaga o `if (!supabase) return;` de cima pra dentro deste
        // closure -- mas ele já rodou: sem cliente, o efeito nem chega aqui.
        const { error } = await supabase!.auth.verifyOtp({
          token_hash: tokenHash,
          type: "email",
        });
        if (error) throw error;
        // onAuthStateChange abaixo pega a sessão nova e desliga o loading.
      } catch (e) {
        setBridgeError(e instanceof Error ? e.message : "Não consegui entrar no Fábrica Social.");
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
      queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id;
  const email = session?.user.email ?? "";

  const { data: profile } = useQuery({
    queryKey: ["fabrica-social-profile", userId],
    queryFn: () => fetchProfile(userId!, email),
    enabled: !fabricaSocialNaoConfigurado && !!userId,
  });

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile: fabricaSocialNaoConfigurado ? mockUser : (profile ?? null),
      loading,
      bridgeError,
    }),
    [session, profile, loading, bridgeError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useFabricaSocialAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx)
    throw new Error("useFabricaSocialAuth deve ser usado dentro de AuthProviderFabricaSocial");
  return ctx;
}
