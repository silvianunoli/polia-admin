import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { LojaSidebar } from "@/components/loja/LojaSidebar";
import { tituloDaRotaLoja } from "@/lib/loja-nav";

// Casca do módulo da loja de serviços (lab.usepolia.com.br/loja), mesmo
// desenho de /crm: sidebar própria + header com o título da tela.
export const Route = createFileRoute("/loja")({
  head: () => ({ meta: [{ title: "Loja de serviços · Gestão Pólia" }] }),
  component: LojaLayout,
});

function LojaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen">
      <LojaSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--line)] bg-white px-8 py-4">
          <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Loja de serviços
          </p>
          <h1 className="font-cabinet text-[24px] leading-tight text-[var(--ink)]">
            {tituloDaRotaLoja(pathname)}
          </h1>
        </header>
        <main className="min-w-0 flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
