import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  MessageCircle,
  Mail,
  Pencil,
  Trash2,
  Plus,
  Instagram,
  Phone,
} from "lucide-react";
import {
  obterContato,
  excluirContato,
  registrarInteracao,
  enviarEmailContato,
  salvarNegocio,
  excluirNegocio,
  salvarTarefa,
  alternarTarefa,
  excluirTarefa,
  listarModelos,
  FASES_NEGOCIO,
  TIPOS_TAREFA,
  type Contato,
  type Interacao,
  type Negocio,
  type Tarefa,
  type Modelo,
} from "@/lib/crm.functions";
import { FormularioContato } from "@/components/crm/FormularioContato";
import { toastErro, toastSucesso } from "@/lib/toast";
import {
  aplicarVariaveis,
  btnDanger,
  btnOutline,
  btnPrimary,
  CANAL_LABEL,
  cardClass,
  FASE_META,
  formatarData,
  formatarDataHora,
  formatarReais,
  formatarTelefone,
  hojeISO,
  inputClass,
  labelClass,
  linkWhatsApp,
  ORIGEM_LABEL,
  rotulo,
  STATUS_META,
  TIPO_TAREFA_LABEL,
} from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/contatos/$id")({
  head: () => ({ meta: [{ title: "Contato · CRM Pólia" }] }),
  component: PerfilContato,
});

type Aba = "timeline" | "whatsapp" | "email" | "negocios" | "lembretes";

function PerfilContato() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [contato, setContato] = useState<Contato | null>(null);
  const [interacoes, setInteracoes] = useState<Interacao[]>([]);
  const [negocios, setNegocios] = useState<Negocio[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [editando, setEditando] = useState(false);
  const [aba, setAba] = useState<Aba>("timeline");

  async function carregar() {
    setCarregando(true);
    try {
      const r = await obterContato({ data: { id } });
      setContato(r.contato);
      setInteracoes(r.interacoes);
      setNegocios(r.negocios);
      setTarefas(r.tarefas);
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui abrir esse contato.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
    listarModelos()
      .then((r) => setModelos(r.modelos))
      .catch(() => setModelos([]));
  }, [id]);

  async function handleExcluir() {
    if (!contato) return;
    if (
      !window.confirm(
        `Apagar ${contato.nome} e todo o histórico dessa pessoa? Isso não volta atrás.`,
      )
    ) {
      return;
    }
    try {
      await excluirContato({ data: { id } });
      toastSucesso("Contato apagado.");
      navigate({ to: "/crm/contatos" });
    } catch {
      toastErro("Não consegui apagar.");
    }
  }

  if (carregando && !contato) {
    return <p className="font-sans text-[14px] text-[var(--muted)]">Carregando...</p>;
  }
  if (!contato) {
    return (
      <div>
        <p className="font-sans text-[14px] text-[var(--muted)]">Contato não encontrado.</p>
        <Link
          to="/crm/contatos"
          className="mt-3 inline-block font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
        >
          Voltar pros contatos
        </Link>
      </div>
    );
  }

  const meta = STATUS_META[contato.status];
  const wa = linkWhatsApp(contato.telefone);
  const negociosAbertos = negocios.filter((n) => n.fase !== "fechado" && n.fase !== "perdido");
  const totalFechado = negocios
    .filter((n) => n.fase === "fechado")
    .reduce((s, n) => s + Number(n.valor ?? 0), 0);

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/crm/contatos"
        className="inline-flex w-fit items-center gap-1.5 font-sans text-[13px] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} />
        Contatos
      </Link>

      {editando ? (
        <FormularioContato
          contato={contato}
          onSalvo={() => {
            setEditando(false);
            carregar();
          }}
          onCancelar={() => setEditando(false)}
        />
      ) : (
        <div className={`${cardClass} p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="font-cabinet text-[28px] leading-tight text-[var(--ink)]">
                  {contato.nome}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-1 font-sans text-[12px] ${meta.className}`}
                >
                  {meta.label}
                </span>
              </div>
              <p className="mt-1 font-sans text-[14px] text-[var(--muted)]">
                {contato.negocio ? `${contato.negocio} · ` : ""}
                {rotulo(ORIGEM_LABEL, contato.origem)}
                {contato.cidade ? ` · ${contato.cidade}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 font-sans text-[13px] text-[var(--ink-soft)]">
                {contato.email && (
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={14} className="text-[var(--muted)]" />
                    {contato.email}
                  </span>
                )}
                {contato.telefone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone size={14} className="text-[var(--muted)]" />
                    {formatarTelefone(contato.telefone)}
                  </span>
                )}
                {contato.instagram && (
                  <a
                    href={`https://instagram.com/${contato.instagram}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[var(--secondary-text)] no-underline hover:underline"
                  >
                    <Instagram size={14} />@{contato.instagram}
                  </a>
                )}
              </div>

              {contato.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {contato.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-[var(--surface-pink)] px-2.5 py-1 font-sans text-[12px] text-[var(--ink-soft)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-wrap gap-2">
              {wa && (
                <a
                  href={wa}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex items-center gap-2 ${btnOutline}`}
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={() => setEditando(true)}
                className={`inline-flex items-center gap-2 ${btnOutline}`}
              >
                <Pencil size={14} />
                Editar
              </button>
              <button type="button" onClick={handleExcluir} className={btnDanger}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-4 sm:grid-cols-4">
            <Dado rotulo="Último contato" valor={formatarData(contato.ultimo_contato_em)} />
            <Dado rotulo="Aniversário" valor={formatarData(contato.aniversario)} />
            <Dado
              rotulo="Já fechou"
              valor={totalFechado > 0 ? formatarReais(totalFechado) : "Nada ainda"}
            />
            <Dado
              rotulo="Recebe e-mail"
              valor={
                contato.descadastrado_em
                  ? "Se descadastrou"
                  : contato.consent_marketing
                    ? "Sim"
                    : "Não autorizou"
              }
            />
          </div>

          {contato.observacoes && (
            <p className="mt-4 whitespace-pre-wrap rounded-xl bg-[var(--surface)] p-4 font-sans text-[14px] leading-relaxed text-[var(--ink-soft)]">
              {contato.observacoes}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--line)] bg-white p-1">
        {(
          [
            ["timeline", `Histórico · ${interacoes.length}`],
            ["whatsapp", "Mandar WhatsApp"],
            ["email", "Mandar e-mail"],
            ["negocios", `Negociações · ${negociosAbertos.length}`],
            ["lembretes", `Lembretes · ${tarefas.filter((t) => !t.feito_em).length}`],
          ] as [Aba, string][]
        ).map(([chave, label]) => (
          <button
            key={chave}
            type="button"
            onClick={() => setAba(chave)}
            className={`rounded-lg px-4 py-1.5 font-sans text-[13px] ${
              aba === chave
                ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "timeline" && (
        <Timeline contato={contato} interacoes={interacoes} onMudou={carregar} />
      )}
      {aba === "whatsapp" && (
        <AbaWhatsApp contato={contato} modelos={modelos} onRegistrou={carregar} />
      )}
      {aba === "email" && <AbaEmail contato={contato} modelos={modelos} onEnviou={carregar} />}
      {aba === "negocios" && (
        <AbaNegocios contato={contato} negocios={negocios} onMudou={carregar} />
      )}
      {aba === "lembretes" && (
        <AbaLembretes contato={contato} tarefas={tarefas} onMudou={carregar} />
      )}
    </div>
  );
}

function Dado(props: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
        {props.rotulo}
      </p>
      <p className="mt-1 font-sans text-[14px] text-[var(--ink)]">{props.valor}</p>
    </div>
  );
}

function Timeline(props: { contato: Contato; interacoes: Interacao[]; onMudou: () => void }) {
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function adicionarNota(e: FormEvent) {
    e.preventDefault();
    if (!nota.trim()) return;
    setSalvando(true);
    try {
      await registrarInteracao({
        data: {
          contato_id: props.contato.id,
          canal: "nota",
          direcao: "interna",
          conteudo: nota,
        },
      });
      setNota("");
      props.onMudou();
    } catch {
      toastErro("Não consegui salvar a nota.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={adicionarNota} className={`${cardClass} p-4`}>
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          placeholder="Anotar o que aconteceu nessa conversa"
          className={inputClass}
        />
        <button type="submit" disabled={salvando || !nota.trim()} className={`mt-3 ${btnPrimary}`}>
          {salvando ? "Salvando..." : "Anotar"}
        </button>
      </form>

      <ol className={cardClass}>
        {props.interacoes.map((i) => (
          <li key={i.id} className="border-b border-[var(--line)] px-5 py-4 last:border-b-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
                {rotulo(CANAL_LABEL, i.canal)}
                {i.direcao === "entrada" ? " recebido" : i.canal === "nota" ? "" : " enviado"}
              </span>
              <span className="font-sans text-[12px] text-[var(--muted)]">
                {formatarDataHora(i.criado_em)}
              </span>
            </div>
            {i.assunto && (
              <p className="mt-1 font-sans text-[14px] font-medium text-[var(--ink)]">
                {i.assunto}
              </p>
            )}
            <p className="mt-1 whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-[var(--ink-soft)]">
              {i.conteudo}
            </p>
          </li>
        ))}
        {props.interacoes.length === 0 && (
          <li className="px-5 py-10 text-center font-sans text-[14px] text-[var(--muted)]">
            Nada registrado ainda.
          </li>
        )}
      </ol>
    </div>
  );
}

function AbaWhatsApp(props: { contato: Contato; modelos: Modelo[]; onRegistrou: () => void }) {
  const modelosWa = props.modelos.filter((m) => m.canal === "whatsapp");
  const [texto, setTexto] = useState("");
  const [registrando, setRegistrando] = useState(false);

  const mensagem = useMemo(() => aplicarVariaveis(texto, props.contato), [texto, props.contato]);
  const link = linkWhatsApp(props.contato.telefone, mensagem);

  async function abrirERegistrar() {
    if (!link) return;
    window.open(link, "_blank", "noopener");
    setRegistrando(true);
    try {
      await registrarInteracao({
        data: {
          contato_id: props.contato.id,
          canal: "whatsapp",
          direcao: "saida",
          conteudo: mensagem || "Conversa aberta pelo CRM.",
        },
      });
      toastSucesso("WhatsApp aberto e registrado no histórico.");
      props.onRegistrou();
    } catch {
      toastErro("A conversa abriu, mas não consegui registrar.");
    } finally {
      setRegistrando(false);
    }
  }

  if (!props.contato.telefone) {
    return (
      <div className={`${cardClass} p-6`}>
        <p className="font-sans text-[14px] text-[var(--ink-soft)]">
          Essa pessoa não tem WhatsApp cadastrado. Edite o contato e coloque o número com DDD.
        </p>
      </div>
    );
  }

  return (
    <div className={`${cardClass} p-5`}>
      <p className="mb-4 font-sans text-[13px] text-[var(--muted)]">
        O botão abre a conversa no WhatsApp com o texto pronto e guarda o registro aqui. A resposta
        dela chega no seu celular, não nesta tela.
      </p>

      {modelosWa.length > 0 && (
        <div className="mb-4">
          <span className={labelClass}>Começar de um modelo</span>
          <div className="flex flex-wrap gap-2">
            {modelosWa.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setTexto(m.corpo)}
                className={btnOutline}
              >
                {m.nome}
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="block">
        <span className={labelClass}>
          Mensagem. Use {"{primeiro_nome}"}, {"{nome}"} ou {"{negocio}"}
        </span>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          className={inputClass}
        />
      </label>

      {mensagem.trim() && (
        <div className="mt-4 rounded-xl bg-[var(--surface)] p-4">
          <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Vai chegar assim
          </p>
          <p className="mt-2 whitespace-pre-wrap font-sans text-[14px] text-[var(--ink)]">
            {mensagem}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={abrirERegistrar}
        disabled={registrando}
        className={`mt-4 inline-flex items-center gap-2 ${btnPrimary}`}
      >
        <MessageCircle size={15} />
        Abrir no WhatsApp
      </button>
    </div>
  );
}

function AbaEmail(props: { contato: Contato; modelos: Modelo[]; onEnviou: () => void }) {
  const modelosEmail = props.modelos.filter((m) => m.canal === "email");
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      await enviarEmailContato({
        data: {
          contato_id: props.contato.id,
          assunto: aplicarVariaveis(assunto, props.contato),
          corpo: aplicarVariaveis(corpo, props.contato),
        },
      });
      toastSucesso("E-mail enviado e registrado.");
      setAssunto("");
      setCorpo("");
      props.onEnviou();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "O e-mail não saiu.");
    } finally {
      setEnviando(false);
    }
  }

  if (!props.contato.email) {
    return (
      <div className={`${cardClass} p-6`}>
        <p className="font-sans text-[14px] text-[var(--ink-soft)]">
          Essa pessoa não tem e-mail cadastrado.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={enviar} className={`${cardClass} p-5`}>
      <p className="mb-4 font-sans text-[13px] text-[var(--muted)]">
        Sai agora pelo Resend, na casca da marca, para {props.contato.email}. A resposta vai pro
        oi@usepolia.com.br.
      </p>

      {modelosEmail.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {modelosEmail.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                setAssunto(m.assunto ?? "");
                setCorpo(m.corpo);
              }}
              className={btnOutline}
            >
              {m.nome}
            </button>
          ))}
        </div>
      )}

      <label className="mb-4 block">
        <span className={labelClass}>Assunto</span>
        <input
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          required
          maxLength={200}
          className={inputClass}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Mensagem</span>
        <textarea
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          required
          rows={8}
          className={inputClass}
        />
      </label>

      <button
        type="submit"
        disabled={enviando}
        className={`mt-4 inline-flex items-center gap-2 ${btnPrimary}`}
      >
        <Mail size={15} />
        {enviando ? "Enviando..." : "Enviar agora"}
      </button>
    </form>
  );
}

function AbaNegocios(props: { contato: Contato; negocios: Negocio[]; onMudou: () => void }) {
  const [aberto, setAberto] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [valor, setValor] = useState("");
  const [fase, setFase] = useState<(typeof FASES_NEGOCIO)[number]>("novo");
  const [produto, setProduto] = useState("");
  const [dataPrevista, setDataPrevista] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvarNegocio({
        data: {
          contato_id: props.contato.id,
          titulo,
          fase,
          valor: Number(valor.replace(",", ".")) || 0,
          produto,
          data_prevista: dataPrevista,
        },
      });
      setTitulo("");
      setValor("");
      setProduto("");
      setDataPrevista("");
      setAberto(false);
      props.onMudou();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    if (!window.confirm("Apagar essa negociação?")) return;
    try {
      await excluirNegocio({ data: { id } });
      props.onMudou();
    } catch {
      toastErro("Não consegui apagar.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`inline-flex w-fit items-center gap-2 ${btnPrimary}`}
      >
        <Plus size={15} />
        {aberto ? "Fechar" : "Nova negociação"}
      </button>

      {aberto && (
        <form onSubmit={criar} className={`${cardClass} grid gap-4 p-5 sm:grid-cols-2`}>
          <label className="block sm:col-span-2">
            <span className={labelClass}>O que está sendo negociado</span>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Valor</span>
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Produto ou serviço</span>
            <input
              value={produto}
              onChange={(e) => setProduto(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Onde está</span>
            <select
              value={fase}
              onChange={(e) => setFase(e.target.value as typeof fase)}
              className={inputClass}
            >
              {FASES_NEGOCIO.map((f) => (
                <option key={f} value={f}>
                  {FASE_META[f].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Previsão</span>
            <input
              type="date"
              value={dataPrevista}
              onChange={(e) => setDataPrevista(e.target.value)}
              className={inputClass}
            />
          </label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={salvando} className={btnPrimary}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      )}

      <ul className={cardClass}>
        {props.negocios.map((n) => (
          <li
            key={n.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="font-sans text-[14px] font-medium text-[var(--ink)]">{n.titulo}</p>
              <p className="font-sans text-[12px] text-[var(--muted)]">
                {formatarReais(Number(n.valor ?? 0))}
                {n.produto ? ` · ${n.produto}` : ""}
                {n.data_prevista ? ` · previsto ${formatarData(n.data_prevista)}` : ""}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-2.5 py-1 font-sans text-[12px] ${FASE_META[n.fase].className}`}
              >
                {FASE_META[n.fase].label}
              </span>
              <button
                type="button"
                onClick={() => remover(n.id)}
                aria-label="Apagar negociação"
                className="text-[var(--muted)] hover:text-[var(--danger)]"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </li>
        ))}
        {props.negocios.length === 0 && (
          <li className="px-5 py-10 text-center font-sans text-[14px] text-[var(--muted)]">
            Nenhuma negociação com essa pessoa.
          </li>
        )}
      </ul>
    </div>
  );
}

function AbaLembretes(props: { contato: Contato; tarefas: Tarefa[]; onMudou: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS_TAREFA)[number]>("followup");
  const [prazo, setPrazo] = useState(hojeISO());
  const [salvando, setSalvando] = useState(false);

  async function criar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      await salvarTarefa({
        data: { contato_id: props.contato.id, titulo, tipo, prazo },
      });
      setTitulo("");
      props.onMudou();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
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
        <label className="block">
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
        <label className="block">
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

      <ul className={cardClass}>
        {props.tarefas.map((t) => (
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
                  props.onMudou();
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
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={async () => {
                await excluirTarefa({ data: { id: t.id } });
                props.onMudou();
              }}
              aria-label="Apagar lembrete"
              className="text-[var(--muted)] hover:text-[var(--danger)]"
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {props.tarefas.length === 0 && (
          <li className="px-5 py-10 text-center font-sans text-[14px] text-[var(--muted)]">
            Sem lembrete pra essa pessoa.
          </li>
        )}
      </ul>
    </div>
  );
}
