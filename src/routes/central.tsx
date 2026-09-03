import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Kanban, LogOut, Sparkles, Target } from "lucide-react";
import type { ComponentType } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PoliaIcon } from "@/components/brand/PoliaLogo";

export const Route = createFileRoute("/central")({
  head: () => ({ meta: [{ title: "Central de administração · Pólia" }] }),
  component: CentralAdmin,
});

type Produto = {
  nome: string;
  descricao: string;
  href: string;
  icone: ComponentType<{ className?: string }>;
};

// Ponto único de entrada das admins de todos os produtos dela — a lista
// existe pra crescer sem mexer no layout da página.
const PRODUTOS: Produto[] = [
  {
    nome: "Admin da Pólia",
    descricao: "Usuárias, conteúdo, métricas e operação do produto.",
    href: "/painel",
    icone: PoliaIcon,
  },
  {
    nome: "Kanban Operacional",
    descricao: "Tarefas do dia a dia, por pessoa e por área.",
    href: "/kanban",
    icone: Kanban,
  },
  {
    nome: "Gerenciamento Pólia",
    descricao: "Board estratégico: planejamento, decisões e roadmap.",
    href: "/estrategico",
    icone: Target,
  },
  {
    nome: "Criação de Conteúdo",
    descricao: "Instagram e blog, da ideia até o post no ar.",
    href: "/conteudo",
    icone: Sparkles,
  },
];

async function sair() {
  await supabase.auth.signOut();
  window.location.href = "/auth/login";
}

function CentralAdmin() {
  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4 md:px-10">
        <span className="text-[15px] font-medium text-[var(--ink)]">silvia nunoli</span>
        <button
          type="button"
          onClick={sair}
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[14px] text-[var(--ink-soft)] hover:bg-[var(--surface)]"
        >
          <LogOut size={18} aria-hidden="true" />
          Sair
        </button>
      </header>

      <div className="px-6 py-10 md:px-10">
        <h1 className="text-[28px] font-medium text-[var(--ink)]">Central de administração</h1>
        <p className="mt-2 text-[15px] text-[var(--ink-soft)]">Escolha o produto pra gerenciar.</p>

        <div className="mt-8 grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUTOS.map((produto) => {
            const Icone = produto.icone;
            return (
              <Link
                key={produto.nome}
                to={produto.href}
                className="group flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-5 no-underline transition-colors hover:border-[var(--secondary)]"
              >
                <Icone className="h-8 w-auto text-[var(--ink)]" />
                <div>
                  <p className="text-[16px] font-medium text-[var(--ink)]">{produto.nome}</p>
                  <p className="mt-1 text-[13px] text-[var(--ink-soft)]">{produto.descricao}</p>
                </div>
                <span className="mt-auto flex items-center gap-1 text-[13px] font-medium text-[var(--secondary-text)]">
                  Entrar no admin
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
