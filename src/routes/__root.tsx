import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Outlet,
  createRootRoute,
  redirect,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Nav } from "@/components/Nav";
import { ComingSoon } from "@/components/ComingSoon";
import { VoltarCentral } from "@/components/VoltarCentral";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Gestão · Pólia" },
      // Área interna — nunca indexar.
      { name: "robots", content: "noindex, nofollow" },
    ],
    // Sem isso, font-cabinet/font-accent/font-fraunces e Caveat caem tudo em
    // fallback de sistema -- nenhuma fica visualmente diferente da outra.
    // Mesmas fontes e mesma fonte de carregamento do polia-app (__root.tsx
    // de lá): Google Fonts pra Fraunces/Inter/DM Sans/Caveat, Fontshare pra
    // Cabinet Grotesk (não está no Google Fonts).
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,400..600&family=Inter:wght@400;500;600;700&family=DM+Sans:wght@700&family=Caveat:wght@400;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@400,500,600,700&display=swap",
      },
    ],
  }),
  // Guard de autorização: única barreira real de acesso (equivalente ao
  // admin.tsx do polia-app). Toda rota deste app é admin — não existe rota
  // pública aqui, então o guard vive na raiz, não num layout aninhado.
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    if (location.pathname === "/auth/login") return;

    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      throw redirect({ to: "/auth/login", search: { next: location.href } });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .maybeSingle();
    if (!(profile as { is_admin?: boolean } | null)?.is_admin) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth/login", search: { motivo: "sem-acesso" } });
    }
  },
  shellComponent: RootShell,
  component: RootComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isLogin = pathname === "/auth/login";
  // /central (seletor logo após o login) e os três boards embutidos (iframe
  // de página inteira, com o próprio header) não têm chrome de admin — não
  // faz sentido com a Sidebar do painel ao lado.
  const semChrome =
    pathname === "/central" ||
    pathname === "/kanban" ||
    pathname === "/estrategico" ||
    pathname === "/conteudo";

  // Páginas que ganharam entrada direta na Central (não passam mais pela
  // Sidebar pra serem alcançadas) -- mantêm o padding do layout padrão, só
  // trocam a Sidebar inteira por um link simples de volta.
  const semSidebar =
    pathname === "/crm" ||
    pathname.startsWith("/chamados") ||
    pathname.startsWith("/pesquisas") ||
    pathname.startsWith("/blog");

  // O SSR não checa sessão (auth é só client-side, via localStorage) — sem
  // este gate, QUALQUER rota (com a Sidebar inteira revelando as seções
  // internas) seria enviada no HTML inicial pra visitante deslogada, antes
  // do beforeLoad acima redirecionar. Enquanto não confirma is_admin (ou se
  // não for admin), mostra só o shell público ComingSoon — nunca o Outlet
  // nem a Sidebar.
  //
  // "checando" (nunca "negado" de cara) evita o pisca-pisca de quem ATUALIZA
  // a página já logada: getSession() lê a sessão do localStorage (rápido,
  // sem round-trip pro servidor como getUser() faria), então pra quem já
  // tem sessão válida o "checando" dura só o tempo da consulta de is_admin.
  // Só vira "negado" (ComingSoon) se getSession() não achar ninguém.
  const [estado, setEstado] = useState<"checando" | "negado" | "autorizado">("checando");
  useEffect(() => {
    if (isLogin) return;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (!user) {
        setEstado("negado");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", user.id)
        .maybeSingle();
      setEstado((profile as { is_admin?: boolean } | null)?.is_admin ? "autorizado" : "negado");
    })();
  }, [isLogin]);

  let conteudo: ReactNode;
  if (isLogin) {
    conteudo = <Outlet />;
  } else if (estado === "checando") {
    conteudo = null;
  } else if (estado === "negado") {
    conteudo = <ComingSoon />;
  } else if (semChrome) {
    conteudo = <Outlet />;
  } else if (semSidebar) {
    conteudo = (
      <main className="p-8">
        <VoltarCentral />
        <Outlet />
      </main>
    );
  } else {
    conteudo = (
      <div className="flex min-h-screen">
        <Nav />
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <Toaster richColors position="top-center" />
      {conteudo}
    </div>
  );
}
