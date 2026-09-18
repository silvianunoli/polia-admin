import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { CrmSidebar, tituloDaRota } from "@/components/crm/CrmSidebar";

// O CRM antigo (usuárias + lista de espera + convites) virou /crm/usuarias.
// Esta rota agora é só a casca do módulo, no mesmo desenho de /founder.
export const Route = createFileRoute("/crm")({
  head: () => ({ meta: [{ title: "CRM · Pólia" }] }),
  component: CrmLayout,
});

function CrmLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen">
      <CrmSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[var(--line)] bg-white px-8 py-4">
          <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Relacionamento
          </p>
          <h1 className="font-cabinet text-[24px] leading-tight text-[var(--ink)]">
            {tituloDaRota(pathname)}
          </h1>
        </header>
        <main className="min-w-0 flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
