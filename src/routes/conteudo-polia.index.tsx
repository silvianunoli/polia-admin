import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Images } from "lucide-react";
import { listarCarrosseis } from "@/lib/carrosseis.functions";

export const Route = createFileRoute("/conteudo-polia/")({
  head: () => ({ meta: [{ title: "Conteúdo Pólia" }] }),
  component: ListaDeCarrosseis,
});

type Item = {
  slug: string;
  titulo: string;
  descricao: string;
  pranchas: number;
  atualizadoEm: string;
};

function quando(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function ListaDeCarrosseis() {
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listarCarrosseis()
      .then((lista) => vivo && setItens(lista as Item[]))
      .catch((e) => {
        if (!vivo) return;
        setItens([]);
        setErro(e instanceof Error ? e.message : "Não consegui carregar os carrosséis.");
      });
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4 md:px-10">
        <Link
          to="/central"
          className="flex items-center gap-2 font-sans text-[14px] text-[var(--ink-soft)] no-underline hover:text-[var(--ink)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
          Central
        </Link>
        <span className="font-sans text-[14px] text-[var(--muted)]">Conteúdo Pólia</span>
      </header>

      <div className="mx-auto max-w-[1120px] px-6 py-10 md:px-10">
        <h1 className="text-[32px] text-[var(--ink)]">Carrosséis</h1>
        <p className="mt-2 max-w-[640px] font-sans text-[15px] text-[var(--ink-soft)]">
          Cada carrossel nasce na conversa e aparece aqui. Abra um para revisar prancha por prancha
          e baixar os PNG prontos para o feed.
        </p>

        {erro ? (
          <p className="mt-6 rounded-lg bg-[var(--danger-soft)] px-4 py-3 font-sans text-[14px] text-[var(--danger)]">
            {erro}
          </p>
        ) : null}

        {itens === null ? (
          <p className="mt-8 font-sans text-[15px] text-[var(--muted)]">Carregando…</p>
        ) : itens.length === 0 && !erro ? (
          <p className="mt-8 font-sans text-[15px] text-[var(--muted)]">Nenhum carrossel ainda.</p>
        ) : (
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {itens.map((c) => (
              <Link
                key={c.slug}
                to="/conteudo-polia/$slug"
                params={{ slug: c.slug }}
                className="group flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-6 no-underline transition hover:border-[var(--secondary)]"
              >
                <span className="flex items-center gap-3">
                  <Images size={20} className="text-[var(--ink-soft)]" aria-hidden="true" />
                  <span className="text-[20px] text-[var(--ink)]">{c.titulo}</span>
                </span>
                <span className="font-sans text-[14px] leading-[1.6] text-[var(--ink-soft)]">
                  {c.descricao}
                </span>
                <span className="mt-1 flex items-center justify-between font-sans text-[13px] text-[var(--muted)]">
                  <span>
                    {c.pranchas} {c.pranchas === 1 ? "prancha" : "pranchas"} · mexido em{" "}
                    {quando(c.atualizadoEm)}
                  </span>
                  <ArrowRight
                    size={18}
                    className="text-[var(--ink-soft)] transition group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
