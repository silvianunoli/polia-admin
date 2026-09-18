import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Trash2, MessageCircle } from "lucide-react";
import {
  listarTarefas,
  salvarTarefa,
  alternarTarefa,
  excluirTarefa,
  TIPOS_TAREFA,
  type Tarefa,
} from "@/lib/crm.functions";
import { toastErro } from "@/lib/toast";
import {
  btnPrimary,
  cardClass,
  formatarData,
  hojeISO,
  inputClass,
  labelClass,
  linkWhatsApp,
  TIPO_TAREFA_LABEL,
} from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/tarefas")({
  head: () => ({ meta: [{ title: "Lembretes · CRM Pólia" }] }),
  component: CrmTarefas,
});

interface ContatoMini {
  id: string;
  nome: string;
  telefone: string | null;
}

function CrmTarefas() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [contatos, setContatos] = useState<ContatoMini[]>([]);
  const [mostrarFeitas, setMostrarFeitas] = useState(false);

  const [titulo, setTitulo] = useState("");
  const [contatoId, setContatoId] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS_TAREFA)[number]>("followup");
  const [prazo, setPrazo] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      const r = await listarTarefas();
      setTarefas(r.tarefas);
      setContatos(r.contatos.map((c) => ({ id: c.id, nome: c.nome, telefone: c.telefone })));
    } catch {
      toastErro("Não consegui carregar os lembretes.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const contatoPorId = useMemo(() => new Map(contatos.map((c) => [c.id, c])), [contatos]);
  const hoje = hojeISO();

  const grupos = useMemo(() => {
    const abertas = tarefas.filter((t) => !t.feito_em);
    return {
      vencidas: abertas.filter((t) => t.prazo < hoje),
      hoje: abertas.filter((t) => t.prazo === hoje),
      proximas: abertas.filter((t) => t.prazo > hoje),
      feitas: tarefas.filter((t) => t.feito_em).slice(0, 50),
    };
  }, [tarefas, hoje]);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvarTarefa({
        data: { contato_id: contatoId || null, titulo, tipo, prazo },
      });
      setTitulo("");
      carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  function Lista(props: { titulo: string; itens: Tarefa[]; alerta?: boolean; vazio: string }) {
    return (
      <section className={cardClass}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <h2 className="font-cabinet text-[17px] text-[var(--ink)]">{props.titulo}</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 font-sans text-[12px] ${
              props.alerta && props.itens.length > 0
                ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                : "bg-[var(--line)] text-[var(--ink-soft)]"
            }`}
          >
            {props.itens.length}
          </span>
        </div>
        <ul>
          {props.itens.map((t) => {
            const contato = t.contato_id ? contatoPorId.get(t.contato_id) : null;
            const wa = contato ? linkWhatsApp(contato.telefone) : null;
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-b-0"
              >
                <label className="flex min-w-0 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={Boolean(t.feito_em)}
                    onChange={async (e) => {
                      await alternarTarefa({ data: { id: t.id, feito: e.target.checked } });
                      carregar();
                    }}
                    className="accent-[var(--secondary)]"
                  />
                  <span className="min-w-0">
                    <span
                      className={`block font-sans text-[14px] ${
                        t.feito_em ? "text-[var(--muted)] line-through" : "text-[var(--ink)]"
                      }`}
                    >
                      {t.titulo}
                    </span>
                    <span className="font-sans text-[12px] text-[var(--muted)]">
                      {TIPO_TAREFA_LABEL[t.tipo] ?? t.tipo} · {formatarData(t.prazo)}
                      {contato ? " · " : ""}
                      {contato && (
                        <Link
                          to="/crm/contatos/$id"
                          params={{ id: contato.id }}
                          className="text-[var(--secondary-text)] no-underline hover:underline"
                        >
                          {contato.nome}
                        </Link>
                      )}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-3">
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Abrir WhatsApp"
                      className="text-[var(--muted)] hover:text-[var(--secondary-text)]"
                    >
                      <MessageCircle size={15} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      await excluirTarefa({ data: { id: t.id } });
                      carregar();
                    }}
                    aria-label="Apagar lembrete"
                    className="text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            );
          })}
          {props.itens.length === 0 && (
            <li className="px-5 py-6 font-sans text-[13px] text-[var(--muted)]">{props.vazio}</li>
          )}
        </ul>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={criar} className={`${cardClass} flex flex-wrap items-end gap-3 p-5`}>
        <label className="min-w-[220px] flex-1">
          <span className={labelClass}>O que precisa ser feito</span>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <label className="min-w-[180px]">
          <span className={labelClass}>Com quem</span>
          <select
            value={contatoId}
            onChange={(e) => setContatoId(e.target.value)}
            className={inputClass}
          >
            <option value="">Sem contato</option>
            {contatos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as typeof tipo)}
            className={inputClass}
          >
            {TIPOS_TAREFA.map((t) => (
              <option key={t} value={t}>
                {TIPO_TAREFA_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={labelClass}>Quando</span>
          <input
            type="date"
            value={prazo}
            onChange={(e) => setPrazo(e.target.value)}
            required
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={salvando} className={btnPrimary}>
          Criar
        </button>
      </form>

      <Lista titulo="Passou do prazo" itens={grupos.vencidas} alerta vazio="Nada atrasado." />
      <Lista titulo="Hoje" itens={grupos.hoje} vazio="Nada pra hoje." />
      <Lista titulo="Mais pra frente" itens={grupos.proximas} vazio="Nada agendado." />

      <button
        type="button"
        onClick={() => setMostrarFeitas((v) => !v)}
        className="w-fit font-sans text-[13px] text-[var(--secondary-text)] hover:underline"
      >
        {mostrarFeitas
          ? "Esconder o que já foi feito"
          : `Ver o que já foi feito (${grupos.feitas.length})`}
      </button>
      {mostrarFeitas && (
        <Lista titulo="Feitos" itens={grupos.feitas} vazio="Nada concluído ainda." />
      )}
    </div>
  );
}
