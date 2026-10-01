import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  excluirCategoria,
  listarCategorias,
  reordenarCategorias,
  salvarCategoria,
  type Categoria,
} from "@/lib/loja.functions";
import { categoriaSchema, primeiroErro, slugify } from "@/lib/loja";
import { btnOutline, btnPrimary, cardClass, inputClass, labelClass } from "@/lib/crm-ui";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";

export const Route = createFileRoute("/loja/categorias")({
  head: () => ({ meta: [{ title: "Categorias · Loja de serviços · Gestão Pólia" }] }),
  component: LojaCategorias,
});

const iconBtn =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--secondary)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-30";

interface Form {
  id: string | null;
  nome: string;
  slug: string;
  slugManual: boolean;
  descricao: string;
  ativo: boolean;
}

const VAZIO: Form = { id: null, nome: "", slug: "", slugManual: false, descricao: "", ativo: true };

function LojaCategorias() {
  const { confirmar, dialogo } = useConfirmacao();
  const [categorias, setCategorias] = useState<Categoria[] | null>(null);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setErro(null);
    try {
      const r = await listarCategorias();
      setCategorias(r.categorias);
      setContagem(r.contagem);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar as categorias.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const dados = {
      nome: form.nome,
      slug: form.slug || slugify(form.nome),
      descricao: form.descricao,
      ativo: form.ativo,
    };
    const v = categoriaSchema.safeParse(dados);
    if (!v.success) {
      toastErro(primeiroErro(v.error));
      return;
    }
    setSalvando(true);
    try {
      await salvarCategoria({ data: { id: form.id, dados } });
      toastSucesso(form.id ? "Categoria salva." : "Categoria criada.");
      setForm(null);
      await carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não deu pra salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function mover(i: number, direcao: -1 | 1) {
    if (!categorias) return;
    const alvo = i + direcao;
    if (alvo < 0 || alvo >= categorias.length) return;
    const nova = [...categorias];
    [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
    const anterior = categorias;
    setCategorias(nova);
    try {
      await reordenarCategorias({ data: { ids: nova.map((c) => c.id) } });
    } catch (err) {
      setCategorias(anterior);
      toastErro(err instanceof Error ? err.message : "A ordem não salvou.");
    }
  }

  async function excluir(c: Categoria) {
    const qtd = contagem[c.id] ?? 0;
    const ok = await confirmar({
      titulo: "Excluir esta categoria",
      descricao:
        qtd > 0
          ? `${c.nome} tem ${qtd} ${qtd === 1 ? "serviço" : "serviços"}. Eles continuam na loja, só ficam sem categoria.`
          : `${c.nome} sai da loja. Não tem como desfazer.`,
      rotuloConfirmar: "Excluir categoria",
      perigo: true,
    });
    if (!ok) return;
    try {
      await excluirCategoria({ data: { id: c.id } });
      toastSucesso("Categoria excluída.");
      await carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não deu pra excluir.");
    }
  }

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      {dialogo}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-[var(--ink-soft)]">
          Categoria agrupa os serviços na vitrine. A ordem daqui é a ordem de lá.
        </p>
        {!form && (
          <button
            type="button"
            onClick={() => setForm({ ...VAZIO })}
            className={`${btnPrimary} inline-flex items-center gap-2`}
          >
            <Plus size={16} aria-hidden="true" />
            Nova categoria
          </button>
        )}
      </div>

      {form && (
        <form onSubmit={enviar} className={`${cardClass} flex flex-col gap-4 p-5`}>
          <h2 className="font-cabinet text-[17px] text-[var(--ink)]">
            {form.id ? "Editar categoria" : "Nova categoria"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cat-nome" className={labelClass}>
                Nome
              </label>
              <input
                id="cat-nome"
                value={form.nome}
                maxLength={80}
                autoFocus
                onChange={(e) =>
                  setForm({
                    ...form,
                    nome: e.target.value,
                    slug: form.slugManual ? form.slug : slugify(e.target.value),
                  })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cat-slug" className={labelClass}>
                Endereço
              </label>
              <input
                id="cat-slug"
                value={form.slug}
                maxLength={80}
                onChange={(e) =>
                  setForm({ ...form, slug: e.target.value.toLowerCase(), slugManual: true })
                }
                onBlur={() => setForm((f) => (f ? { ...f, slug: slugify(f.slug) } : f))}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="cat-descricao" className={labelClass}>
              Descrição (opcional)
            </label>
            <textarea
              id="cat-descricao"
              value={form.descricao}
              maxLength={300}
              rows={2}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              className={inputClass}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-[14px] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
              className="h-4 w-4 accent-[var(--secondary-text)]"
            />
            Ligada (aparece na vitrine)
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={salvando} className={btnPrimary}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" onClick={() => setForm(null)} className={btnOutline}>
              Cancelar
            </button>
          </div>
        </form>
      )}

      {erro ? (
        <div className={`${cardClass} p-8`}>
          <p className="text-[14px] text-[var(--ink-soft)]">{erro}</p>
          <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
            Tentar de novo
          </button>
        </div>
      ) : categorias === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--surface)]" aria-busy="true" />
      ) : categorias.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-8">
          <p className="text-[14px] text-[var(--ink-soft)]">
            Nenhuma categoria ainda. Dá pra vender sem categoria; ela só ajuda a organizar a
            vitrine.
          </p>
        </div>
      ) : (
        <ul className={cardClass}>
          {categorias.map((c, i) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0"
            >
              <div className="flex gap-1">
                <button
                  type="button"
                  className={iconBtn}
                  onClick={() => mover(i, -1)}
                  disabled={i === 0}
                  aria-label={`Subir ${c.nome}`}
                >
                  <ArrowUp size={14} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={iconBtn}
                  onClick={() => mover(i, 1)}
                  disabled={i === categorias.length - 1}
                  aria-label={`Descer ${c.nome}`}
                >
                  <ArrowDown size={14} aria-hidden="true" />
                </button>
              </div>
              <div className="min-w-[160px] flex-1">
                <p className="font-semibold text-[var(--ink)]">{c.nome}</p>
                <p className="text-[12px] text-[var(--muted)]">
                  /{c.slug} · {contagem[c.id] ?? 0}{" "}
                  {(contagem[c.id] ?? 0) === 1 ? "serviço" : "serviços"}
                </p>
              </div>
              {!c.ativo && (
                <span className="rounded-full bg-[var(--line)] px-2.5 py-0.5 text-[12px] font-semibold text-[var(--ink-soft)]">
                  Desligada
                </span>
              )}
              <button
                type="button"
                className={iconBtn}
                onClick={() =>
                  setForm({
                    id: c.id,
                    nome: c.nome,
                    slug: c.slug,
                    slugManual: true,
                    descricao: c.descricao ?? "",
                    ativo: c.ativo,
                  })
                }
                aria-label={`Editar ${c.nome}`}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`${iconBtn} hover:border-[var(--danger)] hover:text-[var(--danger)]`}
                onClick={() => excluir(c)}
                aria-label={`Excluir ${c.nome}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
