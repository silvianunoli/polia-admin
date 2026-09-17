import { useNavigate, useSearch } from "@tanstack/react-router";
import { INPUT_CLASS } from "@/lib/botoes";
import type { PeriodoSearch } from "@/lib/founder-periodo";

const OPCOES: { chave: PeriodoSearch["periodo"]; label: string }[] = [
  { chave: "hoje", label: "Hoje" },
  { chave: "7", label: "7 dias" },
  { chave: "30", label: "30 dias" },
  { chave: "90", label: "90 dias" },
  { chave: "custom", label: "Intervalo" },
];

// Filtro global de período: mora no search param da rota /founder, então
// sobrevive à navegação entre seções e dá pra compartilhar a URL.
export function FiltroPeriodo() {
  const search = useSearch({ from: "/founder" });
  const navigate = useNavigate({ from: "/founder" });

  const definir = (patch: Partial<PeriodoSearch>) => {
    navigate({ to: ".", search: (prev) => ({ ...prev, ...patch }), replace: true });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
        {OPCOES.map((o) => (
          <button
            key={o.chave}
            type="button"
            onClick={() => definir({ periodo: o.chave })}
            className={`cursor-pointer rounded-md px-3 py-1.5 font-sans text-[12px] font-medium ${
              search.periodo === o.chave
                ? "bg-white text-[var(--ink)] shadow-sm"
                : "text-[var(--ink-soft)]"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {search.periodo === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            aria-label="Data inicial"
            className={`${INPUT_CLASS} py-1.5 text-[12px]`}
            value={search.de ?? ""}
            onChange={(e) => definir({ de: e.target.value || undefined })}
          />
          <span className="font-sans text-[12px] text-[var(--muted)]">a</span>
          <input
            type="date"
            aria-label="Data final"
            className={`${INPUT_CLASS} py-1.5 text-[12px]`}
            value={search.ate ?? ""}
            onChange={(e) => definir({ ate: e.target.value || undefined })}
          />
        </div>
      )}
    </div>
  );
}
