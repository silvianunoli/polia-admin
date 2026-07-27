import type { ReactNode } from "react";
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
    links: [{ rel: "stylesheet", href: appCss }],
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
  // /central (seletor logo após o login) e /auth/login não têm chrome de
  // admin — nenhuma das duas faz sentido com a Sidebar do painel ao lado.
  const semSidebar = pathname === "/central" || pathname === "/auth/login";

  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <Toaster richColors position="top-center" />
      {semSidebar ? (
        <Outlet />
      ) : (
        <div className="flex min-h-screen">
          <Nav />
          <main className="flex-1 p-8">
            <Outlet />
          </main>
        </div>
      )}
    </div>
  );
}
