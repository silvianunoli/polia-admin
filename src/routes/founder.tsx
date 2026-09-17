import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FounderSidebar } from "@/components/founder/FounderSidebar";
import { FiltroPeriodo } from "@/components/founder/FiltroPeriodo";
import { tituloDaRota } from "@/lib/founder-nav";
import { periodoSearchSchema } from "@/lib/founder-periodo";
import { getFounderBarra } from "@/lib/founder-overview.functions";

export const Route = createFileRoute("/founder")({
  validateSearch: periodoSearchSchema,
  head: () => ({ meta: [{ title: "Founder · Pólia" }] }),
  component: FounderLayout,
});

function tempoRelativo(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s} segundo(s)`;
  if (s < 3600) return `há ${Math.floor(s / 60)} minuto(s)`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} hora(s)`;
  return `há ${Math.floor(s / 86400)} dia(s)`;
}

function FounderLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const titulo = tituloDaRota(pathname);
  const [barra, setBarra] = useState<{
    atualizadoEm: string | null;
    alertasAbertos: number;
    servicosCriticos: number;
  } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await getFounderBarra();
        if (vivo) setBarra(r);
      } catch {
        // A barra é informativa; a página em si mostra o próprio erro.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pathname, tick]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const corPonto =
    !barra || !barra.atualizadoEm
      ? "bg-[var(--line)]"
      : barra.servicosCriticos > 0
        ? "bg-[var(--danger)]"
        : barra.alertasAbertos > 0
          ? "bg-[var(--highlight)]"
          : "bg-[var(--secondary)]";

  return (
    <div className="flex min-h-screen">
      <FounderSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-8 py-4">
          <div>
            {titulo && (
              <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
                {titulo.grupo}
              </p>
            )}
            <h1 className="font-cabinet text-[24px] leading-tight text-[var(--ink)]">
              {titulo?.label ?? "Founder"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <FiltroPeriodo />
            <span className="inline-flex items-center gap-2 font-sans text-[12px] text-[var(--muted)]">
              <span className={`h-2 w-2 rounded-full ${corPonto}`} aria-hidden="true" />
              {barra?.atualizadoEm
                ? `Última verificação ${tempoRelativo(barra.atualizadoEm)}`
                : "Monitor ainda não rodou"}
            </span>
          </div>
        </header>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
