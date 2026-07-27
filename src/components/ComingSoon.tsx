import { PoliaIcon } from "@/components/brand/PoliaLogo";

// Shell público e estático (sem dado nenhum, sem fetch) — é o que qualquer
// visitante deslogada vê em "/". Existe porque o SSR não tem como checar
// sessão (auth é só client-side, via localStorage): sem este componente,
// a Visão Geral real seria renderizada no servidor antes do check de
// auth rodar no navegador e redirecionar. Ver src/routes/index.tsx.
export function ComingSoon() {
  return (
    <div className="polia-v3 flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 text-center">
      <PoliaIcon className="h-12 w-auto text-[var(--ink)]" />
      <h1 className="mt-6 font-cabinet text-[28px] text-[var(--ink)]">Gestão Pólia</h1>
      <p className="mt-2 max-w-[360px] text-[15px] text-[var(--ink-soft)]">
        Área interna, em breve por aqui.
      </p>
      <a
        href="/auth/login"
        className="mt-6 rounded-lg bg-[var(--secondary)] px-6 py-3 text-[14px] font-semibold text-[var(--secondary-ink)] no-underline transition-[filter] hover:brightness-95"
      >
        Entrar
      </a>
    </div>
  );
}
