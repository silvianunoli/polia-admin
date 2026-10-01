import { Link, useRouterState } from "@tanstack/react-router";
import { LOJA_ITENS, itemLojaAtivo as ativo } from "@/lib/loja-nav";

// Mesma anatomia da CrmSidebar: a loja é módulo com layout próprio
// (src/routes/loja.tsx), não cabe na Nav geral do admin.

export function LojaSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-[var(--line)] bg-white p-4">
      <Link
        to="/central"
        className="mb-1 px-2 font-sans text-[12px] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
      >
        ← Central
      </Link>
      <p className="mb-4 px-2 font-cabinet text-[18px] text-[var(--ink)]">Loja de serviços</p>

      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {LOJA_ITENS.map((item) => {
          const Icone = item.icone;
          const on = ativo(item.to, pathname);
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={on ? "page" : undefined}
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
