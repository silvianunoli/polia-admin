import type { ReactNode } from "react";
import { SkeletonBloco } from "@/components/Skeleton";
import { CARD_CLASS } from "@/lib/botoes";

// Card padrão das páginas de Operação/Infra/Negócio: título em caixa alta,
// skeleton enquanto carrega, conteúdo com ou sem padding (tabelas vão sem).

export function Secao({
  titulo,
  carregando,
  children,
  semPadding,
  altura = "h-32",
  acao,
  className = "",
}: {
  titulo: string;
  carregando?: boolean;
  children: ReactNode;
  semPadding?: boolean;
  altura?: string;
  acao?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${CARD_CLASS} ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
        <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          {titulo}
        </p>
        {acao}
      </div>
      {carregando ? (
        <SkeletonBloco className={`m-5 ${altura}`} />
      ) : (
        <div className={semPadding ? "" : "p-5"}>{children}</div>
      )}
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="p-5 font-sans text-[13px] text-[var(--muted)]">{children}</p>;
}
