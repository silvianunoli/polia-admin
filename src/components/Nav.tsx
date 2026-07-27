import { Link, useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Espelha ADMIN_SUBLINKS do Sidebar.tsx do polia-app, com os paths sem o
// prefixo /admin (aqui toda rota já é admin) e sem blog-admin/design-system
// (fora do escopo desta extração — ver polia_admin_extracao memória).
const ITENS = [
  { to: "/painel", label: "Visão geral" },
  { to: "/crm", label: "CRM" },
  { to: "/social", label: "Social" },
  { to: "/chamados", label: "Chamados" },
  { to: "/pesquisas", label: "Pesquisas" },
  { to: "/funil", label: "Funil de jornada" },
  { to: "/negocio", label: "Negócio" },
  { to: "/analytics", label: "Analytics" },
  { to: "/qualidade", label: "Qualidade" },
  { to: "/governanca", label: "Governança" },
  { to: "/auditoria", label: "Auditoria" },
  { to: "/alertas", label: "Alertas" },
  { to: "/logs", label: "Logs do sistema" },
  { to: "/flags", label: "Feature Flags" },
  { to: "/blog", label: "Blog" },
  { to: "/design-system", label: "Design System" },
] as const;

function isActive(itemTo: string, pathname: string) {
  return pathname === itemTo || pathname.startsWith(itemTo + "/");
}

async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "/auth/login";
}

export function Nav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-[var(--line)] bg-white p-4">
      <Link
        to="/central"
        className="mb-4 px-2 font-cabinet text-[16px] text-[var(--ink)] no-underline hover:underline"
      >
        ← Central · Gestão Pólia
      </Link>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {ITENS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className={`rounded-lg px-3 py-2 text-[13px] font-medium no-underline ${
              isActive(item.to, pathname)
                ? "bg-[var(--surface)] text-[var(--ink)]"
                : "text-[var(--ink-soft)] hover:bg-[var(--surface)]/60"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={signOut}
        className="flex items-center gap-2 rounded-lg border-t border-[var(--line)] px-3 py-3 text-left text-[13px] font-medium text-[var(--ink-soft)] hover:bg-[var(--surface)]/60"
      >
        <LogOut size={16} aria-hidden="true" />
        Sair
      </button>
    </nav>
  );
}
