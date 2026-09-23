import type { ReactNode } from "react";
import { cn } from "@/lib/fabrica-social/cn";
import type { PostStatus, ApprovalState } from "@/lib/fabrica-social/mock";

export function Card({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn("rounded-lg border bg-card p-4", onClick && "cursor-pointer", className)}
      onClick={onClick}
      // Card clicável precisa responder ao teclado também — quem navega por Tab
      // não tem como acionar um onClick em <div>.
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "blue" | "green" | "orange" | "red";
}) {
  const tones = {
    neutral: "bg-muted text-muted-foreground",
    blue: "bg-primary/15 text-primary",
    green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    orange: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
    red: "bg-destructive/15 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: PostStatus }) {
  const map: Record<PostStatus, { label: string; tone: "neutral" | "blue" | "green" | "orange" }> =
    {
      draft: { label: "Rascunho", tone: "neutral" },
      scheduled: { label: "Agendado", tone: "blue" },
      published: { label: "Publicado", tone: "green" },
      generating: { label: "Gerando…", tone: "orange" },
    };
  const { label, tone } = map[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ApprovalBadge({ state }: { state?: ApprovalState }) {
  if (!state) return null;
  const map: Record<ApprovalState, { label: string; tone: "neutral" | "green" | "orange" }> = {
    pending: { label: "Aguardando cliente", tone: "neutral" },
    approved: { label: "Aprovado ✓", tone: "green" },
    adjust: { label: "Pediu ajuste", tone: "orange" },
  };
  const { label, tone } = map[state];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Button({
  children,
  variant = "default",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "ghost" | "outline" }) {
  const variants = {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    ghost: "hover:bg-accent",
    outline: "border hover:bg-accent",
  };
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
