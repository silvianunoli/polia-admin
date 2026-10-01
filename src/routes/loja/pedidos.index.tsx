import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { listarPedidos } from "@/lib/loja.functions";
import {
  formatarCentavos,
  STATUS_A_ENTREGAR,
  STATUS_PEDIDO,
  STATUS_PEDIDO_META,
  type StatusPedido,
} from "@/lib/loja";
import { btnOutline, cardClass, formatarDataHora, tdClass, tdMuted, thClass } from "@/lib/crm-ui";

export const Route = createFileRoute("/loja/pedidos/")({
  head: () => ({ meta: [{ title: "Pedidos · Loja de serviços · Gestão Pólia" }] }),
  component: LojaPedidos,
});

type Linha = Awaited<ReturnType<typeof listarPedidos>>["pedidos"][number];
type Filtro = "a_entregar" | "todos" | StatusPedido;

function LojaPedidos() {
  const [pedidos, setPedidos] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("a_entregar");
  const [busca, setBusca] = useState("");

  async function carregar() {
    setErro(null);
    try {
      setPedidos((await listarPedidos()).pedidos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar os pedidos.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todos: pedidos?.length ?? 0, a_entregar: 0 };
    for (const p of pedidos ?? []) {
      c[p.status] = (c[p.status] ?? 0) + 1;
      if (STATUS_A_ENTREGAR.includes(p.status)) c.a_entregar += 1;
    }
    return c;
  }, [pedidos]);

  const filtrados = useMemo(() => {
    let lista = pedidos ?? [];
    if (filtro === "a_entregar") lista = lista.filter((p) => STATUS_A_ENTREGAR.includes(p.status));
    else if (filtro !== "todos") lista = lista.filter((p) => p.status === filtro);
    const termo = busca.trim().toLowerCase();
    if (termo) {
      lista = lista.filter(
        (p) =>
          p.nome.toLowerCase().includes(termo) ||
          p.email.toLowerCase().includes(termo) ||
          String(p.numero) === termo.replace("#", ""),
      );
    }
    return lista;
  }, [pedidos, filtro, busca]);

  const filtros: { key: Filtro; label: string }[] = [
    { key: "a_entregar", label: "A entregar" },
    { key: "todos", label: "Todos" },
    ...STATUS_PEDIDO.map((s) => ({ key: s, label: STATUS_PEDIDO_META[s].label })),
  ];

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-[300px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, e-mail ou número"
            aria-label="Buscar pedido"
            className="w-full rounded-xl border border-[var(--line)] bg-white py-2 pl-9 pr-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)]"
          />
        </div>
        <div role="group" aria-label="Filtrar por status" className="flex flex-wrap gap-1">
          {filtros.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filtro === f.key}
              onClick={() => setFiltro(f.key)}
              className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors ${
                filtro === f.key
                  ? "border-[var(--secondary)] bg-[var(--secondary-light)] text-[var(--secondary-ink)]"
                  : "border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--secondary)]"
              }`}
            >
              {f.label} ({contagem[f.key] ?? 0})
            </button>
          ))}
        </div>
      </div>

      {erro ? (
        <div className={`${cardClass} p-8`}>
          <p className="text-[14px] text-[var(--ink-soft)]">{erro}</p>
          <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
            Tentar de novo
          </button>
        </div>
      ) : pedidos === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface)]" aria-busy="true" />
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-8">
          <p className="text-[14px] text-[var(--ink-soft)]">
            {pedidos.length === 0 ? "Nenhum pedido ainda." : "Nenhum pedido nesse filtro."}
          </p>
        </div>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full min-w-[760px]">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={thClass}>Pedido</th>
                <th className={thClass}>Cliente</th>
                <th className={thClass}>Total</th>
                <th className={thClass}>Status</th>
                <th className={thClass}>Feito em</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((p) => (
                <tr
                  key={p.id}
                  className="border-b border-[var(--line)] last:border-b-0 hover:bg-[var(--bg)]"
                >
                  <td className={tdClass}>
                    <Link
                      to="/loja/pedidos/$id"
                      params={{ id: p.id }}
                      className="font-semibold text-[var(--ink)] no-underline hover:underline"
                    >
                      #{p.numero}
                    </Link>
                  </td>
                  <td className={tdClass}>
                    <p>{p.nome}</p>
                    <p className="text-[12px] text-[var(--muted)]">{p.email}</p>
                  </td>
                  <td className={tdClass}>
                    {formatarCentavos(p.total_centavos)}
                    {p.cupom_codigo && (
                      <p className="text-[12px] text-[var(--muted)]">cupom {p.cupom_codigo}</p>
                    )}
                  </td>
                  <td className={tdClass}>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS_PEDIDO_META[p.status].className}`}
                    >
                      {STATUS_PEDIDO_META[p.status].label}
                    </span>
                  </td>
                  <td className={tdMuted}>{formatarDataHora(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
