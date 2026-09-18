import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Trash2, Pencil } from "lucide-react";
import { listarModelos, salvarModelo, excluirModelo, type Modelo } from "@/lib/crm.functions";
import { toastErro, toastSucesso } from "@/lib/toast";
import { btnOutline, btnPrimary, cardClass, inputClass, labelClass } from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/modelos")({
  head: () => ({ meta: [{ title: "Modelos · CRM Pólia" }] }),
  component: CrmModelos,
});

const SUGESTOES = [
  {
    nome: "Primeiro contato",
    canal: "whatsapp" as const,
    corpo:
      "Oi, {primeiro_nome}. Aqui é a Sil, da Pólia.\nVi que você entrou na lista de espera. Posso te contar em dois minutos o que a Pólia resolve?",
  },
  {
    nome: "Retomar quem sumiu",
    canal: "whatsapp" as const,
    corpo:
      "Oi, {primeiro_nome}. A gente conversou faz um tempo sobre o {negocio} e eu fiquei com isso na cabeça.\nMudou alguma coisa por aí?",
  },
  {
    nome: "Depois da compra",
    canal: "whatsapp" as const,
    corpo:
      "Oi, {primeiro_nome}. Passando pra saber como está indo a primeira semana.\nTravou em alguma parte?",
  },
];

function CrmModelos() {
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [editando, setEditando] = useState<Modelo | null>(null);
  const [aberto, setAberto] = useState(false);

  async function carregar() {
    try {
      const r = await listarModelos();
      setModelos(r.modelos);
    } catch {
      toastErro("Não consegui carregar os modelos.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function remover(id: string) {
    if (!window.confirm("Apagar esse modelo?")) return;
    try {
      await excluirModelo({ data: { id } });
      carregar();
    } catch {
      toastErro("Não consegui apagar.");
    }
  }

  const whatsapp = modelos.filter((m) => m.canal === "whatsapp");
  const email = modelos.filter((m) => m.canal === "email");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[640px] font-sans text-[14px] text-[var(--muted)]">
          Texto pronto pra não escrever a mesma coisa toda vez. Use {"{primeiro_nome}"}, {"{nome}"}{" "}
          e {"{negocio}"}: o CRM troca pelos dados da pessoa antes de mandar.
        </p>
        <button
          type="button"
          onClick={() => {
            setEditando(null);
            setAberto((v) => !v);
          }}
          className={`inline-flex items-center gap-2 ${btnPrimary}`}
        >
          <Plus size={15} />
          {aberto && !editando ? "Fechar" : "Novo modelo"}
        </button>
      </div>

      {(aberto || editando) && (
        <Formulario
          modelo={editando}
          onSalvo={() => {
            setAberto(false);
            setEditando(null);
            carregar();
          }}
          onCancelar={() => {
            setAberto(false);
            setEditando(null);
          }}
        />
      )}

      {modelos.length === 0 && (
        <div className={`${cardClass} p-5`}>
          <p className="mb-3 font-sans text-[14px] text-[var(--ink-soft)]">
            Nenhum modelo ainda. Três que quase todo CRM precisa:
          </p>
          <div className="flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <button
                key={s.nome}
                type="button"
                onClick={async () => {
                  try {
                    await salvarModelo({
                      data: { nome: s.nome, canal: s.canal, corpo: s.corpo, assunto: "" },
                    });
                    toastSucesso("Modelo criado. Ajuste o texto pro seu jeito.");
                    carregar();
                  } catch {
                    toastErro("Não consegui criar.");
                  }
                }}
                className={btnOutline}
              >
                Criar {s.nome.toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      )}

      {[
        { titulo: "WhatsApp", lista: whatsapp },
        { titulo: "E-mail", lista: email },
      ].map(
        (grupo) =>
          grupo.lista.length > 0 && (
            <section key={grupo.titulo} className={cardClass}>
              <h2 className="border-b border-[var(--line)] px-5 py-3 font-cabinet text-[17px] text-[var(--ink)]">
                {grupo.titulo}
              </h2>
              <ul>
                {grupo.lista.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="font-sans text-[14px] font-medium text-[var(--ink)]">
                        {m.nome}
                      </p>
                      {m.assunto && (
                        <p className="font-sans text-[12px] text-[var(--muted)]">
                          Assunto: {m.assunto}
                        </p>
                      )}
                      <p className="mt-1 whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-[var(--ink-soft)]">
                        {m.corpo}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditando(m);
                          setAberto(true);
                        }}
                        aria-label="Editar modelo"
                        className="text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(m.id)}
                        aria-label="Apagar modelo"
                        className="text-[var(--muted)] hover:text-[var(--danger)]"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ),
      )}
    </div>
  );
}

function Formulario(props: { modelo: Modelo | null; onSalvo: () => void; onCancelar: () => void }) {
  const m = props.modelo;
  const [nome, setNome] = useState(m?.nome ?? "");
  const [canal, setCanal] = useState<"whatsapp" | "email">(m?.canal ?? "whatsapp");
  const [assunto, setAssunto] = useState(m?.assunto ?? "");
  const [corpo, setCorpo] = useState(m?.corpo ?? "");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    setNome(m?.nome ?? "");
    setCanal(m?.canal ?? "whatsapp");
    setAssunto(m?.assunto ?? "");
    setCorpo(m?.corpo ?? "");
  }, [m]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvarModelo({
        data: { ...(m ? { id: m.id } : {}), nome, canal, assunto, corpo },
      });
      toastSucesso("Modelo salvo.");
      props.onSalvo();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className={`${cardClass} grid gap-4 p-5 sm:grid-cols-2`}>
      <label className="block">
        <span className={labelClass}>Nome do modelo</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Canal</span>
        <select
          value={canal}
          onChange={(e) => setCanal(e.target.value as typeof canal)}
          className={inputClass}
        >
          <option value="whatsapp">WhatsApp</option>
          <option value="email">E-mail</option>
        </select>
      </label>
      {canal === "email" && (
        <label className="block sm:col-span-2">
          <span className={labelClass}>Assunto</span>
          <input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            className={inputClass}
          />
        </label>
      )}
      <label className="block sm:col-span-2">
        <span className={labelClass}>Texto</span>
        <textarea
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          required
          rows={6}
          className={inputClass}
        />
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={salvando} className={btnPrimary}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={props.onCancelar} className={btnOutline}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
