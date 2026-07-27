import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PESQUISAS } from "@/lib/pesquisas/registro";
import { alternarPesquisaAtiva } from "@/lib/pesquisa.functions";
import { toastErro } from "@/lib/toast";

export const Route = createFileRoute("/pesquisas/")({
  head: () => ({
    meta: [{ title: "Pesquisas · Pólia" }],
  }),
  component: AdminPesquisasLista,
});

interface LinhaPesquisa {
  slug: string;
  titulo: string;
  ativa: boolean;
  criadoEm: string | null;
  respostas: number;
}

function AdminPesquisasLista() {
  const [linhas, setLinhas] = useState<LinhaPesquisa[] | null>(null);
  const [alternando, setAlternando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const slugs = PESQUISAS.map((p) => p.slug);
    const { data: pesquisasDb } = await supabase
      .from("pesquisas")
      .select("id, slug, titulo, ativa, criado_em")
      .in("slug", slugs);

    const rows: LinhaPesquisa[] = [];
    for (const config of PESQUISAS) {
      const db = pesquisasDb?.find((p) => p.slug === config.slug);
      let respostas = 0;
      if (db) {
        const { count } = await supabase
          .from("pesquisa_respostas")
          .select("id", { count: "exact", head: true })
          .eq("pesquisa_id", db.id);
        respostas = count ?? 0;
      }
      rows.push({
        slug: config.slug,
        titulo: db?.titulo ?? config.slug,
        ativa: db?.ativa ?? false,
        criadoEm: db?.criado_em ?? null,
        respostas,
      });
    }
    setLinhas(rows);
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function alternar(slug: string, ativa: boolean) {
    if (!ativa && !window.confirm("Fechar essa pesquisa? Ela some de /pesquisa imediatamente.")) {
      return;
    }
    setAlternando(slug);
    try {
      const r = await alternarPesquisaAtiva({ data: { slug, ativa } });
      if (!r.ok) {
        toastErro("Não consegui alterar o status. Tenta de novo.");
        return;
      }
      await carregar();
    } catch {
      toastErro("Não consegui alterar o status. Tenta de novo.");
    } finally {
      setAlternando(null);
    }
  }

  return (
    <>
      <h1 className="mb-1 font-cabinet text-[40px] text-[var(--ink)]">Pesquisas</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Só uma fica pública em <code>/pesquisa</code> por vez. Pra criar uma nova, é só pedir.
      </p>

      {linhas === null ? (
        <p className="font-sans text-[14px] text-[var(--muted)]">Carregando…</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {linhas.map((l) => (
            <div
              key={l.slug}
              className="rounded-2xl border border-[var(--line)] bg-white p-5 transition-colors hover:border-[var(--secondary)]"
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    l.ativa
                      ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
                      : "bg-[var(--surface)] text-[var(--muted)]"
                  }`}
                >
                  {l.ativa ? "No ar" : "Fechada"}
                </span>
                {l.criadoEm && (
                  <span className="font-sans text-[12px] text-[var(--muted)]">
                    criada em {new Date(l.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                )}
              </div>
              <Link
                to="/pesquisas/$slug"
                params={{ slug: l.slug }}
                className="font-cabinet text-[20px] text-[var(--ink)] no-underline hover:text-[var(--secondary-text)]"
              >
                {l.titulo}
              </Link>
              <p className="mt-1 font-sans text-[13px] text-[var(--muted)]">
                {l.respostas} resposta{l.respostas === 1 ? "" : "s"}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  to="/pesquisas/$slug"
                  params={{ slug: l.slug }}
                  className="rounded-lg border border-[var(--line)] bg-white px-4 py-1.5 font-sans text-[13px] text-[var(--ink-soft)] no-underline transition-colors hover:border-[var(--secondary)]"
                >
                  Ver resultados
                </Link>
                <button
                  onClick={() => void alternar(l.slug, !l.ativa)}
                  disabled={alternando === l.slug}
                  className="rounded-lg border border-[var(--line)] bg-white px-4 py-1.5 font-sans text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)] disabled:opacity-40"
                >
                  {alternando === l.slug ? "..." : l.ativa ? "Fechar" : "Ativar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
