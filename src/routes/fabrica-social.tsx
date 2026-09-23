import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChevronsRight } from "lucide-react";
import {
  AuthProviderFabricaSocial,
  useFabricaSocialAuth,
} from "@/context/fabrica-social/AuthContext";
import {
  WorkspaceProviderFabricaSocial,
  useFabricaSocialWorkspace,
} from "@/context/fabrica-social/WorkspaceContext";
import { FabricaSocialSidebar } from "@/components/fabrica-social/Sidebar";
import { FabricaSocialCommandPalette } from "@/components/fabrica-social/CommandPalette";
import { cn } from "@/lib/fabrica-social/cn";

export const Route = createFileRoute("/fabrica-social")({
  head: () => ({ meta: [{ title: "Fábrica Social · Pólia" }] }),
  component: FabricaSocialLayout,
});

/*
  Réplica da tela real do Fábrica Social (AppShell.tsx + Sidebar.tsx +
  CommandPalette.tsx do repo original), não um menu resumido -- a Sil pediu
  a casca igual, não uma versão simplificada pras cores da Central. Por
  isso a paleta usada aqui é a do PRÓPRIO Fábrica Social (ver .fabrica-social
  em src/styles.css), inclusive tema escuro, isolada do resto do polia-admin.

  Camadas, de fora pra dentro:
    QueryClientProvider     cache próprio (RLS/owner_id são do outro projeto)
    AuthProviderFabricaSocial   ponte de sessão (ver fabrica-social-auth.functions.ts)
    FabricaSocialGate        mostra carregando/erro da ponte
    WorkspaceProviderFabricaSocial   marca ativa, tema, sidebar aberta/fechada
    FabricaSocialAppShell    a casca de verdade: Sidebar + Ctrl+K + topbar + Outlet
*/

const ROUTE_LABEL: Record<string, string> = {
  "criar-postagem": "Criar postagem",
  biblioteca: "Biblioteca",
  conexoes: "Conexões",
};

function Breadcrumb() {
  const { activeBrand } = useFabricaSocialWorkspace();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segmento = pathname.replace(/^\/fabrica-social\/?/, "").split("/")[0] ?? "";
  const label = ROUTE_LABEL[segmento] ?? segmento;

  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Link
        to="/central"
        className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-muted-foreground hover:bg-accent"
      >
        <span>{activeBrand.emoji}</span>
        <span>{activeBrand.name}</span>
      </Link>
      {segmento && (
        <>
          <span className="text-muted-foreground/50">/</span>
          <span className="rounded px-1.5 py-0.5 font-medium">{label}</span>
        </>
      )}
    </div>
  );
}

function FabricaSocialAppShell() {
  const { theme, sidebarOpen, setSidebarOpen } = useFabricaSocialWorkspace();

  return (
    <div className={cn("fabrica-social bg-background text-foreground", theme === "dark" && "dark")}>
      <div className="flex h-screen overflow-hidden">
        <FabricaSocialCommandPalette />
        {sidebarOpen && <FabricaSocialSidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                title="Abrir menu"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            )}
            <Breadcrumb />
          </header>
          <main className="notion-scroll flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function FabricaSocialGate() {
  const { loading, bridgeError } = useFabricaSocialAuth();

  if (loading) {
    return (
      <div className="fabrica-social flex min-h-screen items-center justify-center bg-background">
        <span className="animate-pulse text-4xl">🏭</span>
      </div>
    );
  }
  if (bridgeError) {
    return (
      <div className="fabrica-social flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <span className="text-4xl">🔒</span>
        <p className="max-w-sm text-[15px] text-muted-foreground">{bridgeError}</p>
        <Link to="/central" className="text-sm text-primary hover:underline">
          Voltar pra Central
        </Link>
      </div>
    );
  }

  return (
    <WorkspaceProviderFabricaSocial>
      <FabricaSocialAppShell />
    </WorkspaceProviderFabricaSocial>
  );
}

function criarQueryClient() {
  return new QueryClient();
}

function FabricaSocialLayout() {
  const [queryClient] = useState(criarQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProviderFabricaSocial>
        <FabricaSocialGate />
      </AuthProviderFabricaSocial>
    </QueryClientProvider>
  );
}
