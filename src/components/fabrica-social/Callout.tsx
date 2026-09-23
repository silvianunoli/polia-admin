import type { ReactNode } from "react";

// Cópia de src/components/layout/PageShell.tsx (Callout) no repo original.
export function Callout({ emoji, children }: { emoji: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-lg bg-muted px-4 py-3 text-sm">
      <span className="text-lg leading-6">{emoji}</span>
      <div className="text-foreground/90">{children}</div>
    </div>
  );
}
