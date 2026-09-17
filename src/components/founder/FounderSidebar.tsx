import { Link, useRouterState } from "@tanstack/react-router";
import { GRUPOS_FOUNDER, itemAtivo } from "@/lib/founder-nav";

export function FounderSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      aria-label="Seções do Founder Dashboard"
      className="sticky top-0 flex h-screen w-[232px] shrink-0 flex-col border-r border-[var(--line)] bg-white"
    >
      <div className="border-b border-[var(--line)] px-5 py-4">
        <Link
          to="/central"
          className="font-sans text-[12px] text-[var(--ink-soft)] no-underline hover:underline"
        >
          ← Central
        </Link>
        <p className="font-cabinet mt-1 text-[18px] leading-tight text-[var(--ink)]">
          Pólia Founder
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {GRUPOS_FOUNDER.map((g) => (
          <div key={g.titulo} className="mb-4">
            <p className="mb-1 px-2 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              {g.titulo}
            </p>
            {g.itens.map((i) => (
              <Link
                key={i.to}
                to={i.to}
                search={(prev) => prev}
                className={`block rounded-lg px-2 py-1.5 font-sans text-[13px] no-underline ${
                  itemAtivo(i, pathname)
                    ? "bg-[var(--surface)] font-medium text-[var(--ink)]"
                    : "text-[var(--ink-soft)] hover:bg-[var(--surface)]/60"
                }`}
              >
                {i.label}
              </Link>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
