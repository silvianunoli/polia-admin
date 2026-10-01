import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, ImageOff, Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  alternarProduto,
  duplicarProduto,
  excluirProduto,
  listarProdutos,
  reordenarProdutos,
  type Categoria,
  type Produto,
} from "@/lib/loja.functions";
import { formatarCentavos } from "@/lib/loja";
import { btnOutline, btnPrimary, cardClass } from "@/lib/crm-ui";
import { Toggle } from "@/components/Toggle";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";

export const Route = createFileRoute("/loja/produtos/")({
  head: () => ({ meta: [{ title: "Serviços · Loja de serviços · Gestão Pólia" }] }),
  component: LojaProdutos,
});

const iconBtn =
  "flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40";

function LojaProdutos() {
  const navigate = useNavigate();
  const { confirmar, dialogo } = useConfirmacao();
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    try {
      const r = await listarProdutos();
      setProdutos(r.produtos);
      setCategorias(r.categorias);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar os serviços.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const nomeCategoria = useMemo(() => new Map(categorias.map((c) => [c.id, c.nome])), [categorias]);

  async function mover(indice: number, direcao: -1 | 1) {
    if (!produtos) return;
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= produtos.length) return;
    const nova = [...produtos];
    [nova[indice], nova[alvo]] = [nova[alvo], nova[indice]];
    const anterior = produtos;
    setProdutos(nova);
    setOcupado("ordem");
    try {
      await reordenarProdutos({ data: { ids: nova.map((p) => p.id) } });
    } catch (e) {
      setProdutos(anterior);
      toastErro(e instanceof Error ? e.message : "A ordem não salvou.");
    } finally {
      setOcupado(null);
    }
  }

  async function alternar(p: Produto, campo: "publicado" | "destaque") {
    const valor = !p[campo];
    setProdutos(
      (lista) => lista?.map((x) => (x.id === p.id ? { ...x, [campo]: valor } : x)) ?? null,
    );
    try {
      await alternarProduto({ data: { id: p.id, campo, valor } });
    } catch (e) {
      setProdutos(
        (lista) => lista?.map((x) => (x.id === p.id ? { ...x, [campo]: !valor } : x)) ?? null,
      );
      toastErro(e instanceof Error ? e.message : "Não deu pra mudar agora.");
    }
  }

  async function duplicar(p: Produto) {
    setOcupado(p.id);
    try {
      const r = await duplicarProduto({ data: { id: p.id } });
      toastSucesso("Cópia criada, escondida da vitrine.");
      navigate({ to: "/loja/produtos/$id", params: { id: r.id } });
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não deu pra duplicar.");
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(p: Produto) {
    const ok = await confirmar({
      titulo: "Excluir este serviço",
      descricao: (
        <>
          <strong>{p.nome}</strong> sai da loja agora. Pedidos antigos continuam guardados com o
          nome e o preço da época. Não tem como desfazer.
        </>
      ),
      rotuloConfirmar: "Excluir definitivamente",
      perigo: true,
    });
    if (!ok) return;
    setOcupado(p.id);
    try {
      await excluirProduto({ data: { id: p.id } });
      setProdutos((lista) => lista?.filter((x) => x.id !== p.id) ?? null);
      toastSucesso("Serviço excluído.");
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não deu pra excluir.");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      {dialogo}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-[var(--ink-soft)]">
          A ordem desta lista é a ordem da vitrine. Só aparece lá o que está publicado.
        </p>
        <Link
          to="/loja/produtos/novo"
          className={`${btnPrimary} inline-flex items-center gap-2 no-underline`}
        >
          <Plus size={16} aria-hidden="true" />
          Novo serviço
        </Link>
      </div>

      {erro ? (
        <div className={`${cardClass} p-8`}>
          <p className="text-[14px] text-[var(--ink-soft)]">{erro}</p>
          <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
            Tentar de novo
          </button>
        </div>
      ) : produtos === null ? (
        <div className="grid gap-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--surface)]" />
          ))}
        </div>
      ) : produtos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-10">
          <p className="font-cabinet text-[20px] text-[var(--ink)]">Nenhum serviço cadastrado.</p>
          <p className="mt-2 text-[14px] text-[var(--ink-soft)]">
            Cadastra o primeiro. Ele nasce escondido e só vai pra vitrine quando for publicado.
          </p>
          <Link to="/loja/produtos/novo" className={`${btnPrimary} mt-5 inline-flex no-underline`}>
            Novo serviço
          </Link>
        </div>
      ) : (
        <ul className={cardClass}>
          {produtos.map((p, i) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-4 border-b border-[var(--line)] px-4 py-3 last:border-b-0"
            >
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--ink-soft)] hover:bg-[var(--surface)] disabled:opacity-30"
                  onClick={() => mover(i, -1)}
                  disabled={i === 0 || ocupado === "ordem"}
                  aria-label={`Subir ${p.nome}`}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="flex h-6 w-6 items-center justify-center rounded text-[var(--ink-soft)] hover:bg-[var(--surface)] disabled:opacity-30"
                  onClick={() => mover(i, 1)}
                  disabled={i === produtos.length - 1 || ocupado === "ordem"}
                  aria-label={`Descer ${p.nome}`}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </div>

              {p.capa_url ? (
                <img
                  src={p.capa_url}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg border border-[var(--line)] object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-[var(--muted)]">
                  <ImageOff size={18} aria-label="Sem capa" />
                </div>
              )}

              <div className="min-w-[180px] flex-1">
                <Link
                  to="/loja/produtos/$id"
                  params={{ id: p.id }}
                  className="font-semibold text-[var(--ink)] no-underline hover:underline"
                >
                  {p.nome}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="text-[var(--ink-soft)]">
                    {formatarCentavos(p.preco_centavos)}
                  </span>
                  {p.preco_original_centavos !== null && (
                    <span className="text-[var(--muted)] line-through">
                      {formatarCentavos(p.preco_original_centavos)}
                    </span>
                  )}
                  {p.categoria_id && nomeCategoria.get(p.categoria_id) && (
                    <span className="rounded-full border border-[var(--line)] bg-[var(--bg)] px-2 py-0.5 text-[12px] text-[var(--ink-soft)]">
                      {nomeCategoria.get(p.categoria_id)}
                    </span>
                  )}
                  {p.preco_sugerido && (
                    <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[12px] font-semibold text-[var(--accent-ink)]">
                      Preço sugerido
                    </span>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-[var(--ink-soft)]">
                <Toggle
                  ligado={p.publicado}
                  onChange={() => alternar(p, "publicado")}
                  label={`a publicação de ${p.nome}`}
                />
                {p.publicado ? "Publicado" : "Escondido"}
              </label>

              <button
                type="button"
                onClick={() => alternar(p, "destaque")}
                aria-pressed={p.destaque}
                aria-label={p.destaque ? `Tirar ${p.nome} do destaque` : `Destacar ${p.nome}`}
                title={p.destaque ? "Em destaque" : "Destacar"}
                className={`${iconBtn} ${p.destaque ? "border-[var(--secondary)] bg-[var(--secondary-light)] text-[var(--ink)]" : ""}`}
              >
                <Star size={16} aria-hidden="true" fill={p.destaque ? "currentColor" : "none"} />
              </button>

              <div className="flex gap-2">
                <Link
                  to="/loja/produtos/$id"
                  params={{ id: p.id }}
                  title="Editar"
                  aria-label={`Editar ${p.nome}`}
                  className={`${iconBtn} no-underline`}
                >
                  <Pencil size={16} aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => duplicar(p)}
                  disabled={ocupado === p.id}
                  title="Duplicar"
                  aria-label={`Duplicar ${p.nome}`}
                  className={iconBtn}
                >
                  <Copy size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => excluir(p)}
                  disabled={ocupado === p.id}
                  title="Excluir"
                  aria-label={`Excluir ${p.nome}`}
                  className={`${iconBtn} hover:border-[var(--danger)] hover:text-[var(--danger)]`}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
