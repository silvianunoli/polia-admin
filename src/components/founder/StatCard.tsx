import { Link } from "@tanstack/react-router";
import { SkeletonNumero } from "@/components/Skeleton";
import { CARD_CLASS } from "@/lib/botoes";

interface Props {
  label: string;
  valor: string | number | null | undefined;
  descricao?: string;
  variacaoPct?: number | null;
  rotuloComparacao?: string;
  carregando?: boolean;
  semDados?: boolean;
  href?: string;
  invertido?: boolean;
}

function Delta({ pct, rotulo, invertido }: { pct: number; rotulo?: string; invertido?: boolean }) {
  const subiu = pct > 0;
  const estavel = Math.abs(pct) < 0.05;
  const bom = estavel ? null : invertido ? !subiu : subiu;
  const cor = estavel
    ? "text-[var(--muted)]"
    : bom
      ? "text-[var(--secondary-text)]"
      : "text-[var(--danger)]";
  const sinal = estavel ? "" : subiu ? "+" : "";
  return (
    <p className={`mt-1 font-sans text-[11px] ${cor}`}>
      {estavel ? "estável" : `${sinal}${pct.toFixed(pct % 1 === 0 ? 0 : 1)}%`}
      {rotulo ? ` ${rotulo}` : ""}
    </p>
  );
}

export function StatCard({
  label,
  valor,
  descricao,
  variacaoPct,
  rotuloComparacao = "vs período anterior",
  carregando,
  semDados,
  href,
  invertido,
}: Props) {
  const conteudo = (
    <>
      <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
        {label}
      </p>
      <p className="font-cabinet text-[26px] leading-none text-[var(--ink)]">
        {carregando ? (
          <SkeletonNumero />
        ) : semDados || valor === null || valor === undefined ? (
          <span className="text-[18px] text-[var(--muted)]">sem dados</span>
        ) : (
          valor
        )}
      </p>
      {!carregando && !semDados && typeof variacaoPct === "number" ? (
        <Delta pct={variacaoPct} rotulo={rotuloComparacao} invertido={invertido} />
      ) : !carregando && !semDados && variacaoPct === null ? (
        <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">sem base de comparação</p>
      ) : null}
      {descricao && <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">{descricao}</p>}
    </>
  );

  if (href) {
    return (
      <Link
        to={href}
        className={`${CARD_CLASS} block p-5 no-underline transition-colors hover:border-[var(--secondary)]`}
      >
        {conteudo}
      </Link>
    );
  }
  return <div className={`${CARD_CLASS} p-5`}>{conteudo}</div>;
}
