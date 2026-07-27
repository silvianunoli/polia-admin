import type { SVGProps } from "react";

type LogoProps = Omit<SVGProps<SVGSVGElement>, "viewBox" | "role">;

/**
 * Símbolo isolado da Pólia (sem a palavra) — cópia de src/components/brand/PoliaLogo.tsx
 * do polia-app. Cor herdada via currentColor; precisa estar dentro do escopo
 * .polia-v3 pros tokens de acento (--secondary/--accent/--highlight) resolverem.
 */
export function PoliaIcon({ className, ...props }: LogoProps) {
  return (
    <svg
      viewBox="0 0 100 100"
      role="img"
      aria-label="Pólia"
      fill="currentColor"
      className={className}
      {...props}
    >
      <rect x="26" y="18" width="15" height="64" rx="7.5" />
      <circle cx="54" cy="34" r="16" fill="none" stroke="currentColor" strokeWidth="9" />
      <circle cx="60" cy="84" r="4" fill="var(--secondary)" />
      <circle cx="72" cy="86" r="5" fill="var(--accent)" />
      <circle cx="86" cy="88" r="7" fill="var(--highlight)" />
    </svg>
  );
}
