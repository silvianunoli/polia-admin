import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { listarNegocios, moverNegocio, FASES_NEGOCIO, type Negocio } from "@/lib/crm.functions";
import { toastErro } from "@/lib/toast";
import { cardClass, FASE_META, formatarData, formatarReais } from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/negocios")({
  head: () => ({ meta: [{ title: "Negociações · CRM Pólia" }] }),
  component: CrmNegocios,
});

interface ContatoMini {
  id: string;
  nome: string;
}

function CrmNegocios() {
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [contatos, setContatos] = useState<ContatoMini[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [movendo, setMovendo] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await listarNegocios();
      setNegocios(r.negocios);
      setContatos(r.contatos.map((c) => ({ id: c.id, nome: c.nome })));
    } catch {
      toastErro("Não consegui carregar as negociações.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const nomePorId = useMemo(() => new Map(contatos.map((c) => [c.id, c.nome])), [contatos]);

  const porFase = useMemo(() => {
    const mapa: Record<string, Negocio[]> = {};
    for (const f of FASES_NEGOCIO) mapa[f] = [];
    for (const n of negocios) (mapa[n.fase] ??= []).push(n);
    return mapa;
  }, [negocios]);

  async function mover(id: string, fase: (typeof FASES_NEGOCIO)[number]) {
    setMovendo(id);
    // Otimista: a coluna muda na hora e volta sozinha se o servidor recusar.
    setNegocios((lista) => lista.map((n) => (n.id === id ? { ...n, fase } : n)));
    try {
      await moverNegocio({ data: { id, fase } });
    } catch {
      toastErro("Não consegui mover.");
      carregar();
    } finally {
      setMovendo(null);
    }
  }

  const emAberto = negocios.filter((n) => n.fase !== "fechado" && n.fase !== "perdido");
  const valorAberto = emAberto.reduce((s, n) => s + Number(n.valor ?? 0), 0);

  if (carregando && negocios.length === 0) {
    return <p className="font-sans text-[14px] text-[var(--muted)]">Carregando...</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="font-sans text-[14px] text-[var(--muted)]">
        {emAberto.length} negociação(ões) em aberto, somando {formatarReais(valorAberto)}. Para
        criar uma nova, abra o contato.
      </p>

      <div className="grid gap-4 lg:grid-cols-5">
        {FASES_NEGOCIO.map((fase) => {
          const lista = porFase[fase] ?? [];
          const soma = lista.reduce((s, n) => s + Number(n.valor ?? 0), 0);
          return (
            <section key={fase} className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 font-sans text-[12px] ${FASE_META[fase].className}`}
                >
                  {FASE_META[fase].label}
                </span>
                <span className="font-sans text-[12px] text-[var(--muted)]">{lista.length}</span>
              </div>
              <p className="font-cabinet text-[16px] text-[var(--ink)]">{formatarReais(soma)}</p>

              <div className="flex flex-col gap-2">
                {lista.map((n) => (
                  <article key={n.id} className={`${cardClass} p-3`}>
                    <p className="font-sans text-[14px] font-medium text-[var(--ink)]">
                      {n.titulo}
                    </p>
                    <Link
                      to="/crm/contatos/$id"
                      params={{ id: n.contato_id }}
                      className="font-sans text-[12px] text-[var(--secondary-text)] no-underline hover:underline"
                    >
                      {nomePorId.get(n.contato_id) ?? "Contato"}
                    </Link>
                    <p className="mt-1 font-sans text-[13px] text-[var(--ink-soft)]">
                      {formatarReais(Number(n.valor ?? 0))}
                    </p>
                    {n.data_prevista && (
                      <p className="font-sans text-[12px] text-[var(--muted)]">
                        Previsto {formatarData(n.data_prevista)}
                      </p>
                    )}
                    <select
                      value={n.fase}
                      disabled={movendo === n.id}
                      onChange={(e) =>
                        mover(n.id, e.target.value as (typeof FASES_NEGOCIO)[number])
                      }
                      aria-label={`Mover ${n.titulo}`}
                      className="mt-2 w-full rounded-lg border border-[var(--line)] bg-white px-2 py-1 font-sans text-[12px] text-[var(--ink-soft)] focus:border-[var(--secondary)] focus:outline-none"
                    >
                      {FASES_NEGOCIO.map((f) => (
                        <option key={f} value={f}>
                          {FASE_META[f].label}
                        </option>
                      ))}
                    </select>
                  </article>
                ))}
                {lista.length === 0 && (
                  <p className="rounded-xl border border-dashed border-[var(--line)] px-3 py-6 text-center font-sans text-[12px] text-[var(--muted)]">
                    Vazio
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
