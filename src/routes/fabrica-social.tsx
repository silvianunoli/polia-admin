import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ArrowLeft, FolderOpen } from "lucide-react";
import {
  AuthProviderFabricaSocial,
  useFabricaSocialAuth,
} from "@/context/fabrica-social/AuthContext";
import { WorkspaceProviderFabricaSocial } from "@/context/fabrica-social/WorkspaceContext";

export const Route = createFileRoute("/fabrica-social")({
  head: () => ({ meta: [{ title: "Fábrica Social · Pólia" }] }),
  component: FabricaSocialLayout,
});

/*
  Seções que já existem aqui dentro vs. as que ainda só existem no Fábrica
  Social separado (app.silvianunoli.com.br). Lista curta de propósito — cada
  fase de migração troca "em breve" por um link de verdade. Ver §Fábrica
  Social no CLAUDE.md pra a ordem recomendada das próximas.
*/
const SECOES = [
  { label: "Biblioteca", to: "/fabrica-social/biblioteca", pronto: true },
  { label: "Calendário", pronto: false },
  { label: "Criar postagem", pronto: false },
  { label: "Marcas", pronto: false },
  { label: "Conexões", pronto: false },
] as const;

// Um QueryClient próprio: o Fábrica Social usa `owner_id`/RLS do projeto dele,
// então cachear junto com queries do resto do polia-admin (que hoje nem usa
// TanStack Query) só criaria confusão de chave sem ganho nenhum.
function criarQueryClient() {
  return new QueryClient();
}

function FabricaSocialShell() {
  const { bridgeError, loading } = useFabricaSocialAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="fabrica-social min-h-screen bg-[var(--bg)]">
      <header className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] bg-white px-6 py-4 md:px-10">
        <Link
          to="/central"
          className="flex items-center gap-2 font-cabinet text-[14px] text-[var(--ink-soft)] no-underline hover:text-[var(--ink)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Central
        </Link>
        <span className="flex items-center gap-2 font-cabinet text-[15px] text-[var(--ink)]">
          <FolderOpen size={16} aria-hidden="true" />
          Fábrica Social
        </span>
        {!loading && !bridgeError && (
          <nav className="ml-auto flex flex-wrap gap-1">
            {SECOES.map((s) =>
              s.pronto && "to" in s ? (
                <Link
                  key={s.label}
                  to={s.to}
                  className={`rounded-full px-3 py-1.5 text-[13px] no-underline transition-colors ${
                    pathname === s.to
                      ? "bg-[var(--secondary)] text-[var(--secondary-ink)]"
                      : "text-[var(--ink-soft)] hover:bg-[var(--bg)]"
                  }`}
                >
                  {s.label}
                </Link>
              ) : (
                <span
                  key={s.label}
                  title="Ainda só no Fábrica Social separado — migra em breve"
                  className="cursor-default rounded-full px-3 py-1.5 text-[13px] text-[var(--muted)]"
                >
                  {s.label}
                </span>
              ),
            )}
          </nav>
        )}
      </header>

      <main>
        {loading ? (
          <div className="flex min-h-[60vh] items-center justify-center">
            <span className="animate-pulse text-4xl">🏭</span>
          </div>
        ) : bridgeError ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-4xl">🔒</span>
            <p className="max-w-sm text-[15px] text-[var(--ink-soft)]">{bridgeError}</p>
          </div>
        ) : (
          <WorkspaceProviderFabricaSocial>
            <Outlet />
          </WorkspaceProviderFabricaSocial>
        )}
      </main>
    </div>
  );
}

function FabricaSocialLayout() {
  const [queryClient] = useState(criarQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProviderFabricaSocial>
        <FabricaSocialShell />
      </AuthProviderFabricaSocial>
    </QueryClientProvider>
  );
}
