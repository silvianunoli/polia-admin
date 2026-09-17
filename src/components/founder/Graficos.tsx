import { Link } from "@tanstack/react-router";

// Visualizações mínimas do Founder Dashboard: sem biblioteca de gráfico, só
// div e SVG com os tokens do design system. Cada uma responde uma pergunta.

export function BarraLista({
  itens,
  formatar = (v) => String(v),
  vazio = "Sem dados no período.",
}: {
  itens: { rotulo: string; valor: number; detalhe?: string; href?: string }[];
  formatar?: (v: number) => string;
  vazio?: string;
}) {
  if (itens.length === 0) {
    return <p className="font-sans text-[13px] text-[var(--muted)]">{vazio}</p>;
  }
  const max = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div className="space-y-2.5">
      {itens.map((i) => (
        <div key={i.rotulo}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            {i.href ? (
              <Link
                to={i.href}
                search={(prev) => prev}
                className="truncate font-sans text-[13px] text-[var(--ink)] no-underline hover:underline"
              >
                {i.rotulo}
              </Link>
            ) : (
              <span className="truncate font-sans text-[13px] text-[var(--ink)]">{i.rotulo}</span>
            )}
            <span className="shrink-0 font-sans text-[12px] text-[var(--ink-soft)]">
              {formatar(i.valor)}
              {i.detalhe ? <span className="text-[var(--muted)]"> · {i.detalhe}</span> : null}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--surface)]">
            <div
              className="h-1.5 rounded-full bg-[var(--secondary)]"
              style={{ width: `${Math.max(2, (i.valor / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BarrasDiarias({
  pontos,
  formatar = (v) => String(v),
  altura = 96,
}: {
  pontos: { dia: string; valor: number }[];
  formatar?: (v: number) => string;
  altura?: number;
}) {
  if (pontos.length === 0) {
    return <p className="font-sans text-[13px] text-[var(--muted)]">Sem dados no período.</p>;
  }
  const max = Math.max(...pontos.map((p) => p.valor), 1);
  return (
    <div>
      <div className="flex items-end gap-[3px]" style={{ height: altura }}>
        {pontos.map((p) => (
          <div
            key={p.dia}
            className="group relative flex-1 rounded-t-sm bg-[var(--secondary)]"
            style={{
              height: `${Math.max(2, (p.valor / max) * 100)}%`,
              opacity: p.valor === 0 ? 0.25 : 1,
            }}
            title={`${p.dia}: ${formatar(p.valor)}`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-sans text-[10px] text-[var(--muted)]">
        <span>{pontos[0].dia.slice(5)}</span>
        <span>{pontos[pontos.length - 1].dia.slice(5)}</span>
      </div>
    </div>
  );
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function Heatmap({ celulas }: { celulas: { dow: number; hora: number; valor: number }[] }) {
  if (celulas.length === 0) {
    return <p className="font-sans text-[13px] text-[var(--muted)]">Sem dados no período.</p>;
  }
  const max = Math.max(...celulas.map((c) => c.valor), 1);
  const mapa = new Map(celulas.map((c) => [`${c.dow}-${c.hora}`, c.valor]));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-[40px_repeat(24,1fr)] gap-[2px]">
        <div />
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="text-center font-sans text-[9px] text-[var(--muted)]">
            {h % 3 === 0 ? `${h}h` : ""}
          </div>
        ))}
        {DIAS.map((nome, dow) => (
          <div key={nome} className="contents">
            <div className="pr-1 text-right font-sans text-[10px] leading-[18px] text-[var(--muted)]">
              {nome}
            </div>
            {Array.from({ length: 24 }, (_, h) => {
              const v = mapa.get(`${dow}-${h}`) ?? 0;
              return (
                <div
                  key={h}
                  className="h-[18px] rounded-[3px] bg-[var(--secondary)]"
                  style={{ opacity: v === 0 ? 0.08 : 0.25 + (v / max) * 0.75 }}
                  title={`${nome} ${h}h: ${v}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Funil({
  passos,
  onSelecionar,
  selecionado,
}: {
  passos: { rotulo: string; total: number }[];
  onSelecionar?: (indice: number) => void;
  selecionado?: number | null;
}) {
  const base = passos[0]?.total ?? 0;
  return (
    <div className="space-y-2">
      {passos.map((p, i) => {
        const anterior = i === 0 ? p.total : passos[i - 1].total;
        const pctBase = base > 0 ? (p.total / base) * 100 : 0;
        const pctAnterior = anterior > 0 ? (p.total / anterior) * 100 : 0;
        const ativo = selecionado === i;
        return (
          <button
            key={p.rotulo}
            type="button"
            onClick={() => onSelecionar?.(i)}
            className={`block w-full cursor-pointer rounded-xl border p-3 text-left transition-colors ${
              ativo
                ? "border-[var(--secondary)] bg-[var(--secondary-light)]/30"
                : "border-[var(--line)] bg-white hover:border-[var(--secondary)]"
            }`}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="font-sans text-[13px] text-[var(--ink)]">
                {i + 1}. {p.rotulo}
              </span>
              <span className="font-sans text-[12px] text-[var(--ink-soft)]">
                {p.total} · {pctBase.toFixed(0)}% do início
                {i > 0 ? ` · ${pctAnterior.toFixed(0)}% do passo anterior` : ""}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--surface)]">
              <div
                className="h-2 rounded-full bg-[var(--secondary)]"
                style={{ width: `${Math.max(pctBase, p.total > 0 ? 2 : 0)}%` }}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
