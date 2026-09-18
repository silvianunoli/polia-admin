import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  Handshake,
  BellRing,
  Mail,
  MessageSquareText,
  UserCheck,
} from "lucide-react";
import type { ComponentType } from "react";

// Mesma anatomia da FounderSidebar: o CRM virou módulo com layout próprio
// (src/routes/crm.tsx), não cabia mais na Nav geral do admin.
type Item = { to: string; label: string; icone: ComponentType<{ size?: number }> };

export const CRM_ITENS: Item[] = [
  { to: "/crm", label: "Visão geral", icone: LayoutDashboard },
  { to: "/crm/contatos", label: "Contatos", icone: Users },
  { to: "/crm/negocios", label: "Negociações", icone: Handshake },
  { to: "/crm/tarefas", label: "Lembretes", icone: BellRing },
  { to: "/crm/campanhas", label: "E-mail e campanhas", icone: Mail },
  { to: "/crm/modelos", label: "Modelos de mensagem", icone: MessageSquareText },
  { to: "/crm/usuarias", label: "Usuárias da Pólia", icone: UserCheck },
];

export function tituloDaRota(pathname: string): string {
  if (pathname.startsWith("/crm/contatos/")) return "Contato";
  if (pathname.startsWith("/crm/campanhas/")) return "Campanha";
  return CRM_ITENS.find((i) => i.to === pathname)?.label ?? "CRM";
}

function ativo(to: string, pathname: string) {
  if (to === "/crm") return pathname === "/crm" || pathname === "/crm/";
  return pathname === to || pathname.startsWith(to + "/");
}

export function CrmSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-[var(--line)] bg-white p-4">
      <Link
        to="/central"
        className="mb-1 px-2 font-sans text-[12px] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
      >
        ← Central
      </Link>
      <p className="mb-4 px-2 font-cabinet text-[18px] text-[var(--ink)]">CRM</p>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {CRM_ITENS.map((item) => {
          const Icone = item.icone;
          const on = ativo(item.to, pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium no-underline ${
                on
                  ? "bg-[var(--surface)] text-[var(--ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface)]/60"
              }`}
            >
              <Icone size={15} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
