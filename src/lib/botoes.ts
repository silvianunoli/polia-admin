// Classes de botão/input/card compartilhadas do admin -- mesmo padrão do
// botoes.ts do polia-app. Existiam copiadas (com pequenas divergências de
// padding, py-2 vs py-2.5) em pelo menos 6 arquivos antes desta extração.
//
// cursor-pointer explícito nos 3 botões: o preflight do Tailwind v4 põe
// cursor:default em <button>, então sem isso todo botão do admin mostra
// seta em vez de mãozinha (achado da auditoria de design system, 03/09).
export const BTN_PRIMARIO =
  "rounded-xl bg-[var(--secondary)] px-5 py-2.5 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";

export const BTN_SECUNDARIO =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)] hover:text-[var(--ink)] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

export const BTN_LINK =
  "font-sans text-[14px] text-[var(--secondary-text)] hover:underline cursor-pointer";

export const INPUT_CLASS =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--secondary)] focus:outline-none";

export const CARD_CLASS = "overflow-hidden rounded-2xl border border-[var(--line)] bg-white";

// DM Sans 700, igual a todo outro label de caixa alta do design system --
// era o único lugar do admin com header de tabela em Inter em vez de DM Sans.
export const TH_CLASS =
  "px-5 py-3 text-left font-accent text-[11px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]";

// As duas caixas de aviso que já se repetiam em 4+ arquivos antes de virar
// constante (painel, funil, negocio, analytics, alertas, governanca,
// qualidade, auditoria, logs, flags -- achado nos dois lados da auditoria
// de design system em paralelo).
export const ALERTA_ERRO_CLASS =
  "rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-5 font-sans text-[13px] text-[var(--danger)]";

export const ALERTA_OK_CLASS =
  "rounded-2xl border border-[var(--secondary)]/30 bg-[var(--secondary-light)]/30 p-5 font-sans text-[13px] text-[var(--secondary-text)]";
