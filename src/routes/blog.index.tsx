import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { BlogPost } from "@/lib/blog-types";

export const Route = createFileRoute("/blog/")({
  head: () => ({ meta: [{ title: "Blog · Gestão Pólia" }] }),
  component: BlogAdminIndex,
});

type StatusPost = "publicado" | "agendado" | "rascunho";
type StatusFiltro = "todos" | StatusPost;

function statusDoPost(post: BlogPost): StatusPost {
  if (post.publicado) return "publicado";
  if (post.agendado_para) return "agendado";
  return "rascunho";
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatarAgendado(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function editadoHa(iso: string): string {
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (dias <= 0) return "editado hoje";
  return `editado há ${dias} ${dias === 1 ? "dia" : "dias"}`;
}

const FILTROS: { key: StatusFiltro; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "publicado", label: "Publicados" },
  { key: "agendado", label: "Agendados" },
  { key: "rascunho", label: "Rascunhos" },
];

function BlogAdminIndex() {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<StatusFiltro>("todos");

  async function carregar() {
    setErro(false);
    setPosts(null);
    const { data, error } = await supabase
      .from("blog_posts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) {
      setErro(true);
      return;
    }
    setPosts((data ?? []) as BlogPost[]);
  }

  useEffect(() => {
    carregar();
  }, []);

  const contagens = useMemo(() => {
    const lista = posts ?? [];
    return {
      publicado: lista.filter((p) => statusDoPost(p) === "publicado").length,
      agendado: lista.filter((p) => statusDoPost(p) === "agendado").length,
      rascunho: lista.filter((p) => statusDoPost(p) === "rascunho").length,
    };
  }, [posts]);

  const filtrados = useMemo(() => {
    let lista = posts ?? [];
    if (filtro !== "todos") lista = lista.filter((p) => statusDoPost(p) === filtro);
    const termo = busca.trim().toLowerCase();
    if (termo) lista = lista.filter((p) => p.titulo.toLowerCase().includes(termo));
    return lista;
  }, [posts, filtro, busca]);

  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <div className="mx-auto max-w-[1000px] px-6 py-10 md:py-14">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-cabinet text-[28px] text-[var(--ink)]">Blog</h1>
            <p className="mt-1 text-[14px] text-[var(--muted)]">
              Gerencie os posts do blog da Pólia.
            </p>
          </div>
          <a
            href="/blog/novo"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--secondary)] px-5 py-3 text-[15px] font-semibold text-[var(--secondary-ink)] no-underline transition-[filter] hover:brightness-95"
          >
            <Plus size={18} aria-hidden="true" />
            Novo post
          </a>
        </div>

        {erro ? (
          <div className="mt-10 rounded-xl border border-[var(--line)] bg-white p-8 text-center">
            <p className="text-[var(--ink-soft)]">Não deu pra carregar os posts.</p>
            <button
              type="button"
              onClick={carregar}
              className="mt-4 rounded-lg border border-[var(--line)] px-5 py-2.5 text-[14px] font-semibold text-[var(--ink)] hover:border-[var(--secondary)]"
            >
              Recarregar
            </button>
          </div>
        ) : posts === null ? (
          <div className="mt-8 grid gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface)]" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="mt-10 rounded-xl border border-dashed border-[var(--line)] bg-white p-10 text-center">
            <p className="text-[20px] text-[var(--ink)]">Nenhum post ainda.</p>
            <p className="mt-2 text-[var(--ink-soft)]">Escreva o primeiro.</p>
            <a
              href="/blog/novo"
              className="mt-5 inline-flex rounded-lg bg-[var(--secondary)] px-6 py-3 text-[15px] font-semibold text-[var(--secondary-ink)] no-underline transition-[filter] hover:brightness-95"
            >
              Novo post
            </a>
          </div>
        ) : (
          <>
            <div className="mt-8 flex flex-wrap gap-3">
              <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-[14px] text-[var(--ink-soft)]">
                <strong className="font-cabinet text-[18px] text-[var(--ink)]">
                  {contagens.publicado}
                </strong>{" "}
                publicados
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-[14px] text-[var(--ink-soft)]">
                <strong className="font-cabinet text-[18px] text-[var(--ink)]">
                  {contagens.agendado}
                </strong>{" "}
                agendados
              </div>
              <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-[14px] text-[var(--ink-soft)]">
                <strong className="font-cabinet text-[18px] text-[var(--ink)]">
                  {contagens.rascunho}
                </strong>{" "}
                rascunhos
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="relative max-w-[320px] flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por título..."
                  className="w-full rounded-lg border border-[var(--line)] bg-white py-2.5 pl-9 pr-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)]"
                />
              </div>
              <div
                role="group"
                aria-label="Filtrar por status"
                className="inline-flex gap-1 rounded-lg border border-[var(--line)] bg-white p-1"
              >
                {FILTROS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={filtro === f.key}
                    onClick={() => setFiltro(f.key)}
                    className={`rounded-[4px] px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                      filtro === f.key
                        ? "bg-[var(--secondary-light)] text-[var(--secondary-ink)]"
                        : "text-[var(--ink-soft)]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filtrados.length === 0 ? (
              <div className="mt-8 rounded-xl border border-[var(--line)] bg-white p-8 text-center">
                <p className="text-[var(--ink-soft)]">Nenhum post nesse filtro.</p>
                <button
                  type="button"
                  onClick={() => {
                    setFiltro("todos");
                    setBusca("");
                  }}
                  className="mt-3 text-[14px] font-semibold text-[var(--secondary-text)] hover:underline"
                >
                  Limpar filtro
                </button>
              </div>
            ) : (
              <div className="mt-5 overflow-hidden rounded-xl border border-[var(--line)] bg-white">
                {filtrados.map((post) => {
                  const status = statusDoPost(post);
                  return (
                    <div
                      key={post.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 last:border-b-0 hover:bg-[var(--bg)]"
                    >
                      <div className="min-w-0">
                        <a
                          href={`/blog/${post.id}`}
                          className="font-semibold text-[var(--ink)] no-underline hover:underline hover:decoration-[var(--secondary)] hover:decoration-2 hover:underline-offset-[3px]"
                        >
                          {post.titulo}
                        </a>
                        <div className="mt-1 flex flex-wrap gap-2 text-[13px] text-[var(--muted)]">
                          {post.categoria && <span>{post.categoria}</span>}
                          {post.categoria && post.tempo_leitura ? <span>·</span> : null}
                          {post.tempo_leitura && <span>{post.tempo_leitura} min</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold ${
                            status === "publicado"
                              ? "bg-[var(--secondary-light)] text-[var(--secondary-ink)]"
                              : status === "agendado"
                                ? "bg-[var(--highlight)] text-[var(--highlight-ink)]"
                                : "bg-[var(--bg)] text-[var(--muted)]"
                          }`}
                        >
                          {status === "publicado"
                            ? "Publicado"
                            : status === "agendado"
                              ? "Agendado"
                              : "Rascunho"}
                        </span>
                        <span className="min-w-[110px] text-right text-[13px] text-[var(--muted)]">
                          {status === "publicado" && post.publicado_em
                            ? formatarData(post.publicado_em)
                            : status === "agendado" && post.agendado_para
                              ? formatarAgendado(post.agendado_para)
                              : editadoHa(post.updated_at)}
                        </span>
                        <div className="flex gap-2">
                          <a
                            href={`/blog/${post.id}`}
                            title="Editar"
                            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink-soft)] no-underline hover:border-[var(--secondary)] hover:text-[var(--ink)]"
                          >
                            <Pencil size={16} aria-hidden="true" />
                          </a>
                          {status === "publicado" && (
                            <a
                              href={`https://usepolia.com.br/blog/${post.slug}`}
                              target="_blank"
                              rel="noreferrer"
                              title="Ver no blog"
                              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink-soft)] no-underline hover:border-[var(--secondary)] hover:text-[var(--ink)]"
                            >
                              <Eye size={16} aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
