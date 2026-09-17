export type Estado = "operacional" | "atencao" | "critico" | "sem_dados";

const ESTILO: Record<Estado, { cor: string; ponto: string; texto: string }> = {
  operacional: {
    cor: "text-[var(--secondary-text)]",
    ponto: "bg-[var(--secondary)]",
    texto: "Operacional",
  },
  atencao: { cor: "text-[var(--highlight-ink)]", ponto: "bg-[var(--highlight)]", texto: "Atenção" },
  critico: { cor: "text-[var(--danger)]", ponto: "bg-[var(--danger)]", texto: "Crítico" },
  sem_dados: { cor: "text-[var(--muted)]", ponto: "bg-[var(--line)]", texto: "Sem dados" },
};

export function EstadoPill({ estado, texto }: { estado: Estado; texto?: string }) {
  const s = ESTILO[estado] ?? ESTILO.sem_dados;
  return (
    <span className={`inline-flex items-center gap-2 font-sans text-[13px] ${s.cor}`}>
      <span className={`h-2 w-2 shrink-0 rounded-full ${s.ponto}`} aria-hidden="true" />
      {texto ?? s.texto}
    </span>
  );
}
