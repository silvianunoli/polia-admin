import { CARD_CLASS } from "@/lib/botoes";

const BLOCOS: Record<number, string> = {
  2: "instrumentação de eventos",
  3: "analytics de uso",
  4: "feature flags",
  5: "produto e retenção",
  6: "operação, infra e negócio",
};

export function EmConstrucao({
  titulo,
  bloco,
  descricao,
}: {
  titulo: string;
  bloco: number;
  descricao: string;
}) {
  return (
    <>
      <h1 className="font-cabinet mb-1 text-[32px] text-[var(--ink)]">{titulo}</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">{descricao}</p>
      <div className={`${CARD_CLASS} p-6`}>
        <p className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Em construção
        </p>
        <p className="mt-2 font-sans text-[14px] text-[var(--ink-soft)]">
          Esta seção chega no bloco {bloco} ({BLOCOS[bloco] ?? "próximo bloco"}). O item já está na
          sidebar pra ninguém achar que sumiu.
        </p>
      </div>
    </>
  );
}
