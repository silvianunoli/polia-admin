// Mesmo padrão de skeleton do polia-app (h-XX animate-pulse rounded-xl
// bg-[var(--surface)], usado em caderno/calendario/marca/metas/etc.) --
// aqui como componente porque o admin tem dois formatos: bloco (lista,
// gráfico, card) e número solto (o "…" que virava placeholder de tile).
export function SkeletonBloco({ className = "h-24" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-[var(--surface)] ${className}`} />;
}

export function SkeletonNumero({ className = "h-8 w-16" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-pulse rounded-md bg-[var(--surface)] align-middle ${className}`}
    />
  );
}
