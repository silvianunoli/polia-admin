import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { excluirCupom, listarCupons, salvarCupom, type Cupom } from "@/lib/loja.functions";
import {
  centavosParaCampo,
  cupomSchema,
  formatarCentavos,
  normalizarCodigoCupom,
  primeiroErro,
  reaisParaCentavos,
  situacaoCupom,
  type TipoCupom,
} from "@/lib/loja";
import { saoPauloLocalInputToUtcIso, utcIsoToSaoPauloLocalInput } from "@/lib/timezone";
import {
  btnOutline,
  btnPrimary,
  cardClass,
  inputClass,
  labelClass,
  tdClass,
  tdMuted,
  thClass,
} from "@/lib/crm-ui";
import { Toggle } from "@/components/Toggle";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";

export const Route = createFileRoute("/loja/cupons")({
  head: () => ({ meta: [{ title: "Cupons · Loja de serviços · Gestão Pólia" }] }),
  component: LojaCupons,
});

interface Form {
  id: string | null;
  codigo: string;
  tipo: TipoCupom;
  /** Percentual ("10") ou reais ("50,00"), conforme o tipo. */
  valor: string;
  /** "AAAA-MM-DD", vale até 23h59 desse dia em Brasília. Vazio = sem validade. */
  validoAte: string;
  usosMaximos: string;
  ativo: boolean;
}

const VAZIO: Form = {
  id: null,
  codigo: "",
  tipo: "percentual",
  valor: "",
  validoAte: "",
  usosMaximos: "",
  ativo: true,
};

const SITUACAO: Record<ReturnType<typeof situacaoCupom>, { label: string; className: string }> = {
  ativo: { label: "Valendo", className: "bg-[var(--secondary-light)] text-[var(--secondary-ink)]" },
  inativo: { label: "Desligado", className: "bg-[var(--line)] text-[var(--ink-soft)]" },
  vencido: { label: "Vencido", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  esgotado: { label: "Esgotado", className: "bg-[var(--accent)] text-[var(--accent-ink)]" },
};

function descontoLegivel(c: Pick<Cupom, "tipo" | "valor">): string {
  return c.tipo === "percentual"
    ? `${c.valor}% de desconto`
    : `${formatarCentavos(c.valor)} de desconto`;
}

function cupomParaForm(c: Cupom): Form {
  return {
    id: c.id,
    codigo: c.codigo,
    tipo: c.tipo,
    valor: c.tipo === "percentual" ? String(c.valor) : centavosParaCampo(c.valor),
    validoAte: c.valido_ate ? utcIsoToSaoPauloLocalInput(c.valido_ate).slice(0, 10) : "",
    usosMaximos: c.usos_maximos === null ? "" : String(c.usos_maximos),
    ativo: c.ativo,
  };
}

/** Converte o formulário no payload do schema, ou devolve a mensagem de erro. */
function montarCupom(f: Form): { ok: true; dados: unknown } | { ok: false; erro: string } {
  let valor: number;
  if (f.tipo === "percentual") {
    const n = Number(f.valor.replace(",", ".").replace("%", "").trim());
    if (!Number.isInteger(n))
      return { ok: false, erro: "Percentual em número inteiro, de 1 a 100." };
    valor = n;
  } else {
    const r = reaisParaCentavos(f.valor);
    if (!r.ok) return { ok: false, erro: r.erro };
    if (r.centavos === null) return { ok: false, erro: "Coloca o valor do desconto." };
    valor = r.centavos;
  }
  let usos: number | null = null;
  if (f.usosMaximos.trim()) {
    const n = Number(f.usosMaximos.trim());
    if (!Number.isInteger(n) || n < 1)
      return { ok: false, erro: "Limite de usos é um número inteiro." };
    usos = n;
  }
  const dados = {
    codigo: f.codigo,
    tipo: f.tipo,
    valor,
    ativo: f.ativo,
    valido_ate: f.validoAte ? saoPauloLocalInputToUtcIso(`${f.validoAte}T23:59`) : null,
    usos_maximos: usos,
  };
  const v = cupomSchema.safeParse(dados);
  if (!v.success) return { ok: false, erro: primeiroErro(v.error) };
  return { ok: true, dados };
}

function LojaCupons() {
  const { confirmar, dialogo } = useConfirmacao();
  const [cupons, setCupons] = useState<Cupom[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setErro(null);
    try {
      setCupons((await listarCupons()).cupons);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar os cupons.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const m = montarCupom(form);
    if (!m.ok) {
      toastErro(m.erro);
      return;
    }
    setSalvando(true);
    try {
      await salvarCupom({ data: { id: form.id, dados: m.dados } });
      toastSucesso(form.id ? "Cupom salvo." : "Cupom criado.");
      setForm(null);
      await carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não deu pra salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(c: Cupom) {
    // Manda a validade exatamente como está no banco (sem passar pelo campo
    // de data, que arredondaria pra 23h59).
    const dados = {
      codigo: c.codigo,
      tipo: c.tipo,
      valor: c.valor,
      ativo: !c.ativo,
      valido_ate: c.valido_ate,
      usos_maximos: c.usos_maximos,
    };
    setCupons((l) => l?.map((x) => (x.id === c.id ? { ...x, ativo: !c.ativo } : x)) ?? null);
    try {
      await salvarCupom({ data: { id: c.id, dados } });
    } catch (err) {
      setCupons((l) => l?.map((x) => (x.id === c.id ? { ...x, ativo: c.ativo } : x)) ?? null);
      toastErro(err instanceof Error ? err.message : "Não deu pra mudar agora.");
    }
  }

  async function excluir(c: Cupom) {
    const ok = await confirmar({
      titulo: "Excluir este cupom",
      descricao: `${c.codigo} deixa de existir. Não tem como desfazer.`,
      rotuloConfirmar: "Excluir cupom",
      perigo: true,
    });
    if (!ok) return;
    try {
      await excluirCupom({ data: { id: c.id } });
      toastSucesso("Cupom excluído.");
      await carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não deu pra excluir.");
    }
  }

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      {dialogo}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-[var(--ink-soft)]">
          O desconto nunca passa do valor do pedido. Cupom já usado não pode ser excluído, só
          desligado.
        </p>
        {!form && (
          <button
            type="button"
            onClick={() => setForm({ ...VAZIO })}
            className={`${btnPrimary} inline-flex items-center gap-2`}
          >
            <Plus size={16} aria-hidden="true" />
            Novo cupom
          </button>
        )}
      </div>

      {form && (
        <form onSubmit={enviar} className={`${cardClass} flex flex-col gap-4 p-5`}>
          <h2 className="font-cabinet text-[17px] text-[var(--ink)]">
            {form.id ? "Editar cupom" : "Novo cupom"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="cup-codigo" className={labelClass}>
                Código
              </label>
              <input
                id="cup-codigo"
                value={form.codigo}
                maxLength={40}
                autoFocus
                onChange={(e) =>
                  setForm({ ...form, codigo: normalizarCodigoCupom(e.target.value) })
                }
                placeholder="BEMVINDA10"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cup-tipo" className={labelClass}>
                Tipo de desconto
              </label>
              <select
                id="cup-tipo"
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value as TipoCupom, valor: "" })}
                className={inputClass}
              >
                <option value="percentual">Percentual (%)</option>
                <option value="valor_fixo">Valor fixo (R$)</option>
              </select>
            </div>
            <div>
              <label htmlFor="cup-valor" className={labelClass}>
                {form.tipo === "percentual" ? "Quantos por cento" : "Quantos reais"}
              </label>
              <input
                id="cup-valor"
                inputMode={form.tipo === "percentual" ? "numeric" : "decimal"}
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: e.target.value })}
                placeholder={form.tipo === "percentual" ? "10" : "50,00"}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="cup-validade" className={labelClass}>
                Vale até (opcional)
              </label>
              <input
                id="cup-validade"
                type="date"
                value={form.validoAte}
                onChange={(e) => setForm({ ...form, validoAte: e.target.value })}
                className={inputClass}
              />
              <p className="mt-1 text-[12px] text-[var(--muted)]">Até 23h59 desse dia, Brasília.</p>
            </div>
            <div>
              <label htmlFor="cup-usos" className={labelClass}>
                Limite de usos (opcional)
              </label>
              <input
                id="cup-usos"
                inputMode="numeric"
                value={form.usosMaximos}
                onChange={(e) => setForm({ ...form, usosMaximos: e.target.value })}
                placeholder="Sem limite"
                className={inputClass}
              />
            </div>
            <label className="inline-flex items-center gap-2 self-end pb-2 text-[14px] text-[var(--ink)]">
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                className="h-4 w-4 accent-[var(--secondary-text)]"
              />
              Ligado
            </label>
          </div>
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
      ) : cupons === null ? (
        <div className="h-32 animate-pulse rounded-2xl bg-[var(--surface)]" aria-busy="true" />
      ) : cupons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--line)] bg-white p-8">
          <p className="text-[14px] text-[var(--ink-soft)]">Nenhum cupom criado.</p>
        </div>
      ) : (
        <div className={`${cardClass} overflow-x-auto`}>
          <table className="w-full min-w-[720px]">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={thClass}>Código</th>
                <th className={thClass}>Desconto</th>
                <th className={thClass}>Vale até</th>
                <th className={thClass}>Usos</th>
                <th className={thClass}>Situação</th>
                <th className={thClass}>Ligado</th>
                <th className={thClass}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cupons.map((c) => {
                const s = SITUACAO[situacaoCupom(c)];
                return (
                  <tr key={c.id} className="border-b border-[var(--line)] last:border-b-0">
                    <td className={`${tdClass} font-semibold`}>{c.codigo}</td>
                    <td className={tdClass}>{descontoLegivel(c)}</td>
                    <td className={tdMuted}>
                      {c.valido_ate
                        ? new Date(c.valido_ate).toLocaleDateString("pt-BR", {
                            timeZone: "America/Sao_Paulo",
                          })
                        : "Sem validade"}
                    </td>
                    <td className={tdMuted}>
                      {c.usos}
                      {c.usos_maximos !== null ? ` de ${c.usos_maximos}` : ""}
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${s.className}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className={tdClass}>
                      <Toggle
                        ligado={c.ativo}
                        onChange={() => alternarAtivo(c)}
                        label={`o cupom ${c.codigo}`}
                      />
                    </td>
                    <td className={`${tdClass} text-right`}>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setForm(cupomParaForm(c))}
                          aria-label={`Editar ${c.codigo}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--secondary)]"
                        >
                          <Pencil size={14} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => excluir(c)}
                          disabled={c.usos > 0}
                          title={
                            c.usos > 0 ? "Já foi usado: desligue em vez de excluir" : "Excluir"
                          }
                          aria-label={`Excluir ${c.codigo}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--danger)] hover:text-[var(--danger)] disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
