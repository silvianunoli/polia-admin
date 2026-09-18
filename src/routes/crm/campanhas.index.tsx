import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCcw, Trash2, Copy, Users, Pencil } from "lucide-react";
import {
  listarCampanhas,
  salvarCampanha,
  excluirCampanha,
  duplicarCampanha,
  salvarLista,
  excluirLista,
  sincronizarLista,
  previaPublico,
  opcoesDeFiltro,
  type OpcaoFiltro,
  type Campanha,
  type Lista,
  type FiltroLista,
} from "@/lib/crm-campanhas.functions";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";
import {
  btnOutline,
  btnPrimary,
  cardClass,
  formatarDataHora,
  inputClass,
  labelClass,
  ORIGEM_LABEL,
  STATUS_META,
  tdClass,
  tdMuted,
  thClass,
} from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/campanhas/")({
  head: () => ({ meta: [{ title: "Campanhas · CRM Pólia" }] }),
  component: CrmCampanhas,
});

const STATUS_CAMPANHA: Record<string, { label: string; className: string }> = {
  rascunho: { label: "Rascunho", className: "bg-[var(--line)] text-[var(--ink-soft)]" },
  agendada: { label: "Agendada", className: "bg-[var(--accent)] text-[var(--accent-ink)]" },
  enviando: {
    label: "Saindo",
    className: "bg-[var(--secondary-light)] text-[var(--secondary-text)]",
  },
  enviada: { label: "Enviada", className: "bg-[var(--secondary)] text-[var(--secondary-ink)]" },
  erro: { label: "Deu erro", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

function CrmCampanhas() {
  const navigate = useNavigate();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [listas, setListas] = useState<Lista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novaAberta, setNovaAberta] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const [listaEditando, setListaEditando] = useState<Lista | null>(null);
  const [sincronizando, setSincronizando] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmacao();

  async function carregar() {
    setCarregando(true);
    try {
      const r = await listarCampanhas();
      setCampanhas(r.campanhas);
      setListas(r.listas);
    } catch {
      toastErro("Não consegui carregar as campanhas.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSincronizar(lista: Lista) {
    setSincronizando(lista.id);
    try {
      const r = await sincronizarLista({ data: { id: lista.id } });
      const extras = [
        r.adicionados > 0 ? `${r.adicionados} entraram` : null,
        r.removidos > 0 ? `${r.removidos} saíram` : null,
        r.descadastrados > 0 ? `${r.descadastrados} se descadastraram` : null,
      ]
        .filter(Boolean)
        .join(", ");
      if (r.total === 0) {
        // Sincronizou sem erro e mesmo assim veio vazia: o filtro não bate com
        // ninguém. Dizer "0 pessoas" e mais nada mandava ela procurar erro onde
        // não tinha.
        toastErro(
          "A lista sincronizou vazia: ninguém se encaixa nesses filtros. Abra Editar pra ver quanta gente cada escolha alcança.",
        );
      } else {
        toastSucesso(`${r.total} pessoa(s) na lista${extras ? `. ${extras}` : ""}.`);
      }
      if (r.falhas.length > 0) {
        toastErro(`O Resend recusou ${r.falhas.length} endereço(s).`);
      }
      carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "A sincronização falhou.");
    } finally {
      setSincronizando(null);
    }
  }

  if (carregando && campanhas.length === 0 && listas.length === 0) {
    return <p className="font-sans text-[14px] text-[var(--muted)]">Carregando...</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-cabinet text-[20px] text-[var(--ink)]">Listas</h2>
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Uma lista é um filtro salvo. Só entra quem autorizou receber e-mail e não se
              descadastrou.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setListaAberta((v) => !v)}
            className={`inline-flex items-center gap-2 ${btnOutline}`}
          >
            <Users size={14} />
            {listaAberta ? "Fechar" : "Nova lista"}
          </button>
        </div>

        {(listaAberta || listaEditando) && (
          <FormularioLista
            lista={listaEditando}
            onSalvo={() => {
              setListaAberta(false);
              setListaEditando(null);
              carregar();
            }}
            onCancelar={() => {
              setListaAberta(false);
              setListaEditando(null);
            }}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {listas.map((l) => (
            <article key={l.id} className={`${cardClass} p-4`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-sans text-[15px] font-medium text-[var(--ink)]">{l.nome}</p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setListaAberta(false);
                      setListaEditando(l);
                    }}
                    aria-label={`Editar a lista ${l.nome}`}
                    className="text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await confirmar({
                        titulo: "Apagar esta lista",
                        perigo: true,
                        rotuloConfirmar: "Apagar lista",
                        descricao: (
                          <>
                            <strong className="text-[var(--ink)]">{l.nome}</strong> sai do CRM. As
                            campanhas que já saíram por ela continuam no histórico, e ninguém é
                            apagado do CRM nem descadastrado.
                          </>
                        ),
                      });
                      if (!ok) return;
                      await excluirLista({ data: { id: l.id } });
                      carregar();
                    }}
                    aria-label="Apagar lista"
                    className="text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              {l.descricao && (
                <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">{l.descricao}</p>
              )}
              <p className="mt-3 font-cabinet text-[22px] leading-none text-[var(--ink)]">
                {l.total_sincronizado}
              </p>
              <p className="font-sans text-[12px] text-[var(--muted)]">
                {l.sincronizada_em
                  ? `Sincronizada ${formatarDataHora(l.sincronizada_em)}`
                  : "Nunca sincronizada"}
              </p>
              <button
                type="button"
                onClick={() => handleSincronizar(l)}
                disabled={sincronizando === l.id}
                className={`mt-3 inline-flex items-center gap-2 ${btnOutline}`}
              >
                <RefreshCcw size={13} />
                {sincronizando === l.id ? "Sincronizando..." : "Sincronizar"}
              </button>
            </article>
          ))}
          {listas.length === 0 && (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Nenhuma lista ainda. Crie uma antes de escrever a primeira campanha.
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-cabinet text-[20px] text-[var(--ink)]">Campanhas</h2>
          <button
            type="button"
            onClick={() => setNovaAberta((v) => !v)}
            className={`inline-flex items-center gap-2 ${btnPrimary}`}
          >
            <Plus size={15} />
            {novaAberta ? "Fechar" : "Nova campanha"}
          </button>
        </div>

        {novaAberta && (
          <FormularioCampanha
            listas={listas}
            onCriada={(id) => navigate({ to: "/crm/campanhas/$id", params: { id } })}
            onCancelar={() => setNovaAberta(false)}
          />
        )}

        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-[var(--line)]">
                {["Campanha", "Situação", "Enviados", "Abriram", "Clicaram", ""].map((h) => (
                  <th key={h} className={thClass}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campanhas.map((c) => {
                const st = STATUS_CAMPANHA[c.status] ?? STATUS_CAMPANHA.rascunho;
                const pctAbriu =
                  c.entregues > 0 ? Math.round((c.abertos / c.entregues) * 100) : null;
                const pctClicou =
                  c.entregues > 0 ? Math.round((c.cliques / c.entregues) * 100) : null;
                return (
                  <tr
                    key={c.id}
                    className="border-b border-[var(--line)] hover:bg-[var(--surface)]"
                  >
                    <td className={tdClass}>
                      <Link
                        to="/crm/campanhas/$id"
                        params={{ id: c.id }}
                        className="font-medium text-[var(--ink)] no-underline hover:underline"
                      >
                        {c.nome}
                      </Link>
                      <p className="font-sans text-[12px] text-[var(--muted)]">{c.assunto}</p>
                    </td>
                    <td className={tdClass}>
                      <span
                        className={`inline-block rounded-full px-2.5 py-1 font-sans text-[12px] ${st.className}`}
                      >
                        {st.label}
                      </span>
                    </td>
                    <td className={tdMuted}>{c.destinatarios || "—"}</td>
                    <td className={tdMuted}>
                      {pctAbriu === null ? "—" : `${c.abertos} · ${pctAbriu}%`}
                    </td>
                    <td className={tdMuted}>
                      {pctClicou === null ? "—" : `${c.cliques} · ${pctClicou}%`}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            const r = await duplicarCampanha({ data: { id: c.id } });
                            navigate({ to: "/crm/campanhas/$id", params: { id: r.id } });
                          }}
                          aria-label="Duplicar campanha"
                          className="text-[var(--muted)] hover:text-[var(--ink)]"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await confirmar({
                              titulo: "Apagar esta campanha",
                              perigo: true,
                              rotuloConfirmar: "Apagar campanha",
                              descricao: (
                                <>
                                  <strong className="text-[var(--ink)]">{c.nome}</strong> some da
                                  lista, junto com os números de quem abriu e clicou.
                                  {c.status === "enviada" && (
                                    <span className="mt-2 block text-[var(--muted)]">
                                      Essa já foi enviada. Apagar aqui não desfaz o envio, só apaga
                                      o registro dele.
                                    </span>
                                  )}
                                </>
                              ),
                            });
                            if (!ok) return;
                            await excluirCampanha({ data: { id: c.id } });
                            carregar();
                          }}
                          aria-label="Apagar campanha"
                          className="text-[var(--muted)] hover:text-[var(--danger)]"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {campanhas.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center font-sans text-[14px] text-[var(--muted)]"
                  >
                    Nenhuma campanha ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {dialogo}
    </div>
  );
}

function FormularioLista(props: {
  lista?: Lista | null;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const l = props.lista ?? null;
  const [nome, setNome] = useState(l?.nome ?? "");
  const [descricao, setDescricao] = useState(l?.descricao ?? "");
  const [status, setStatus] = useState<string[]>(l?.filtro?.status ?? []);
  const [origem, setOrigem] = useState<string[]>(l?.filtro?.origem ?? []);
  const [tags, setTags] = useState<string[]>(l?.filtro?.tags ?? []);
  const [opcoes, setOpcoes] = useState<Awaited<ReturnType<typeof opcoesDeFiltro>> | null>(null);
  const [previa, setPrevia] = useState<{ total: number } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const filtro: FiltroLista = {
    ...(status.length ? { status } : {}),
    ...(origem.length ? { origem } : {}),
    ...(tags.length ? { tags } : {}),
  };

  useEffect(() => {
    opcoesDeFiltro()
      .then(setOpcoes)
      .catch(() => setOpcoes(null));
  }, []);

  useEffect(() => {
    let vivo = true;
    previaPublico({ data: { filtro } })
      .then((r) => vivo && setPrevia({ total: r.total }))
      .catch(() => vivo && setPrevia(null));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.join(","), origem.join(","), tags.join(",")]);

  function alternar(lista: string[], set: (v: string[]) => void, valor: string) {
    set(lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor]);
  }

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvarLista({ data: { ...(l ? { id: l.id } : {}), nome, descricao, filtro } });
      toastSucesso(
        l ? "Lista salva. Sincronize pra valer no Resend." : "Lista criada. Agora sincronize.",
      );
      props.onSalvo();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // Só o que existe em crm_contatos, com quantas pessoas cada escolha alcança.
  // Escolha que alcança zero fica visível, mas avisada.
  function Grupo(props: {
    titulo: string;
    itens: OpcaoFiltro[] | undefined;
    rotulos: Record<string, string>;
    selecionados: string[];
    set: (v: string[]) => void;
    classeAtiva?: (chave: string) => string;
  }) {
    if (!props.itens || props.itens.length === 0) return null;
    return (
      <div>
        <span className={labelClass}>{props.titulo}</span>
        <div className="flex flex-wrap gap-2">
          {props.itens.map((o) => {
            const ativo = props.selecionados.includes(o.chave);
            return (
              <button
                key={o.chave}
                type="button"
                onClick={() => alternar(props.selecionados, props.set, o.chave)}
                className={`rounded-full px-3 py-1.5 font-sans text-[13px] ${
                  ativo
                    ? (props.classeAtiva?.(o.chave) ??
                      "bg-[var(--secondary-light)] text-[var(--secondary-text)]")
                    : "border border-[var(--line)] bg-white text-[var(--muted)]"
                }`}
              >
                {props.rotulos[o.chave] ?? o.chave}
                <span className={ativo ? "" : "text-[var(--muted)]"}> · {o.elegiveis}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const vazia = previa !== null && previa.total === 0;

  return (
    <form onSubmit={salvar} className={`${cardClass} p-5`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelClass}>Nome da lista</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            placeholder="Quem está na fila do beta"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Pra que serve</span>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <p className="mt-4 font-sans text-[12px] text-[var(--muted)]">
        O número ao lado de cada escolha é quanta gente ela alcança hoje, já descontando quem não
        autorizou receber e-mail.
      </p>

      <div className="mt-2 grid gap-4 sm:grid-cols-2">
        <Grupo
          titulo="Onde estão"
          itens={opcoes?.status}
          rotulos={Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.label]))}
          selecionados={status}
          set={setStatus}
          classeAtiva={(c) => STATUS_META[c]?.className ?? ""}
        />
        <Grupo
          titulo="De onde vieram"
          itens={opcoes?.origem}
          rotulos={ORIGEM_LABEL}
          selecionados={origem}
          set={setOrigem}
        />
        <Grupo
          titulo="Com o marcador"
          itens={opcoes?.tags}
          rotulos={{}}
          selecionados={tags}
          set={setTags}
        />
      </div>

      <p
        className={`mt-4 font-sans text-[13px] ${vazia ? "text-[var(--danger)]" : "text-[var(--ink-soft)]"}`}
      >
        {previa === null
          ? "Calculando o público..."
          : vazia
            ? "Ninguém se encaixa nesses filtros. Do jeito que está, a lista sincroniza vazia."
            : `${previa.total} pessoa(s) se encaixam agora.`}
        <span className="block font-sans text-[12px] text-[var(--muted)]">
          Sem filtro nenhum, a lista pega todo mundo que autorizou receber e-mail
          {opcoes ? ` (${opcoes.totalElegiveis} hoje)` : ""}.
        </span>
      </p>

      <div className="mt-5 flex gap-2">
        <button type="submit" disabled={salvando} className={btnPrimary}>
          {salvando ? "Salvando..." : l ? "Salvar lista" : "Criar lista"}
        </button>
        <button type="button" onClick={props.onCancelar} className={btnOutline}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function FormularioCampanha(props: {
  listas: Lista[];
  onCriada: (id: string) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [assunto, setAssunto] = useState("");
  const [listaId, setListaId] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await salvarCampanha({
        data: { nome, assunto, lista_id: listaId || null, corpo_html: "" },
      });
      props.onCriada(r.id);
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui criar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={criar} className={`${cardClass} grid gap-4 p-5 sm:grid-cols-3`}>
      <label className="block">
        <span className={labelClass}>Nome interno</span>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
          placeholder="Novidade de outubro"
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Assunto do e-mail</span>
        <input
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          required
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Quem recebe</span>
        <select value={listaId} onChange={(e) => setListaId(e.target.value)} className={inputClass}>
          <option value="">Escolher depois</option>
          {props.listas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 sm:col-span-3">
        <button type="submit" disabled={salvando} className={btnPrimary}>
          {salvando ? "Criando..." : "Criar e escrever"}
        </button>
        <button type="button" onClick={props.onCancelar} className={btnOutline}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
