import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  Instagram,
  MessageCircle,
  Paperclip,
  Send,
  FileText,
  PauseCircle,
  PlayCircle,
  CheckCircle2,
  RotateCcw,
  UserRound,
  Workflow,
} from "lucide-react";
import {
  alterarConversa,
  enviarAnexo,
  enviarMensagem,
  listarConversas,
  marcarConversaLida,
  obterConversa,
  pararAutomacaoDaConversa,
  registrarNota,
  statusCanais,
  type AutomacaoEmCurso,
  type ConversaItem,
  type MensagemItem,
} from "@/lib/conversas.functions";
import { listarModelos, type Modelo } from "@/lib/crm.functions";
import { Respostas } from "@/components/crm/Respostas";
import type { Janela } from "@/lib/conversas-meta";
import { toastErro } from "@/lib/toast";
import {
  aplicarVariaveis,
  btnOutline,
  btnPrimary,
  cardClass,
  formatarTelefone,
  inputClass,
} from "@/lib/crm-ui";

// Caixa de entrada do CRM (fase 1 do "ManyChat próprio", CRM-26). Lista à esquerda, conversa
// no meio, contato à direita. Sem Realtime: as tabelas conv_* não têm policy pro navegador,
// então a tela pergunta de novo a cada poucos segundos enquanto a aba está visível.

export const Route = createFileRoute("/crm/conversas")({
  head: () => ({ meta: [{ title: "Conversas · CRM Pólia" }] }),
  validateSearch: (busca: Record<string, unknown>): { c?: string } => ({
    c: typeof busca.c === "string" ? busca.c : undefined,
  }),
  component: CaixaDeEntrada,
});

const INTERVALO_LISTA_MS = 8000;
const INTERVALO_CONVERSA_MS = 5000;

function useRepetir(fn: () => void, ms: number, ativo = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!ativo) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") ref.current();
    }, ms);
    return () => clearInterval(t);
  }, [ms, ativo]);
}

function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  if (d.toDateString() === hoje.toDateString()) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function IconeCanal({ canal, size = 14 }: { canal: string; size?: number }) {
  return canal === "instagram" ? (
    <Instagram size={size} aria-label="Instagram" />
  ) : (
    <MessageCircle size={size} aria-label="WhatsApp" />
  );
}

function CaixaDeEntrada() {
  const { c: selecionada } = Route.useSearch();
  const navigate = useNavigate({ from: "/crm/conversas" });

  const [status, setStatus] = useState<"aberta" | "fechada">("aberta");
  const [canal, setCanal] = useState<"" | "instagram" | "whatsapp">("");
  const [conversas, setConversas] = useState<ConversaItem[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [canais, setCanais] = useState<{
    instagram: boolean;
    whatsapp: boolean;
    webhook: boolean;
  } | null>(null);

  const carregarLista = useCallback(async () => {
    try {
      const r = await listarConversas({ data: { status, canal: canal || undefined } });
      setConversas(r.conversas);
    } catch {
      toastErro("Não consegui carregar as conversas.");
    } finally {
      setCarregandoLista(false);
    }
  }, [status, canal]);

  useEffect(() => {
    setCarregandoLista(true);
    carregarLista();
  }, [carregarLista]);

  useEffect(() => {
    statusCanais()
      .then(setCanais)
      .catch(() => setCanais(null));
  }, []);

  useRepetir(carregarLista, INTERVALO_LISTA_MS);

  function abrir(id: string | undefined) {
    navigate({ search: { c: id } });
  }

  const faltando = canais
    ? [!canais.instagram && "Instagram", !canais.whatsapp && "WhatsApp"].filter(Boolean)
    : [];

  return (
    <div className="flex flex-col gap-4">
      {faltando.length > 0 && (
        <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
          {faltando.join(" e ")} ainda sem conexão com a Meta. A caixa mostra o que já chegou, mas
          não recebe nem envia por {faltando.length > 1 ? "esses canais" : "esse canal"} até os
          secrets do app Pólia Office entrarem no Worker (card CRM-25).
        </p>
      )}

      <div
        className={`${cardClass} grid h-[calc(100vh-190px)] min-h-[560px] grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_280px]`}
      >
        <section
          aria-label="Lista de conversas"
          className={`min-h-0 flex-col border-r border-[var(--line)] ${selecionada ? "hidden lg:flex" : "flex"}`}
        >
          <div className="flex flex-col gap-2 border-b border-[var(--line)] p-3">
            <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
              {(["aberta", "fechada"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  aria-pressed={status === s}
                  className={`flex-1 rounded-md px-3 py-1.5 font-sans text-[13px] ${
                    status === s
                      ? "bg-white text-[var(--ink)]"
                      : "text-[var(--muted)] hover:text-[var(--ink)]"
                  }`}
                >
                  {s === "aberta" ? "Abertas" : "Fechadas"}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="filtro-canal">
              Canal
            </label>
            <select
              id="filtro-canal"
              value={canal}
              onChange={(e) => setCanal(e.target.value as typeof canal)}
              className={inputClass}
            >
              <option value="">Todos os canais</option>
              <option value="instagram">Instagram</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {carregandoLista && conversas.length === 0 && (
              <li className="px-4 py-6 font-sans text-[13px] text-[var(--muted)]">Carregando...</li>
            )}
            {!carregandoLista && conversas.length === 0 && (
              <li className="px-4 py-6 font-sans text-[13px] text-[var(--muted)]">
                {status === "aberta"
                  ? "Nenhuma conversa aberta. Quando alguém mandar Direct, comentar ou escrever no WhatsApp, aparece aqui."
                  : "Nenhuma conversa fechada."}
              </li>
            )}
            {conversas.map((cv) => {
              const on = cv.id === selecionada;
              return (
                <li key={cv.id}>
                  <button
                    type="button"
                    onClick={() => abrir(cv.id)}
                    className={`flex w-full items-start gap-3 border-b border-[var(--line)] px-4 py-3 text-left ${
                      on ? "bg-[var(--surface)]" : "hover:bg-[var(--surface)]/60"
                    }`}
                  >
                    <span className="mt-0.5 text-[var(--muted)]">
                      <IconeCanal canal={cv.canal} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={`truncate font-sans text-[14px] ${
                            cv.nao_lidas > 0
                              ? "font-semibold text-[var(--ink)]"
                              : "text-[var(--ink)]"
                          }`}
                        >
                          {cv.contato.nome}
                        </span>
                        <span className="shrink-0 font-sans text-[11px] text-[var(--muted)]">
                          {horaCurta(cv.ultima_mensagem_em)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate font-sans text-[12px] text-[var(--muted)]">
                          {cv.ultima_mensagem_resumo ?? ""}
                        </span>
                        {cv.nao_lidas > 0 && (
                          <span
                            className="shrink-0 rounded-full bg-[var(--secondary)] px-2 py-0.5 font-sans text-[11px] font-semibold text-[var(--secondary-ink)]"
                            aria-label={`${cv.nao_lidas} não lidas`}
                          >
                            {cv.nao_lidas}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {selecionada ? (
          <PainelConversa
            key={selecionada}
            id={selecionada}
            onVoltar={() => abrir(undefined)}
            onMudou={carregarLista}
          />
        ) : (
          <div className="hidden items-center justify-center p-8 lg:flex xl:col-span-2">
            <p className="max-w-[320px] text-center font-sans text-[14px] text-[var(--muted)]">
              Escolha uma conversa na lista pra ler e responder.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

interface DadosConversa {
  conversa: ConversaItem;
  mensagens: MensagemItem[];
  janela: Janela;
  comentario: { commentId: string; texto: string | null } | null;
  automacao: AutomacaoEmCurso | null;
}

function PainelConversa(props: { id: string; onVoltar: () => void; onMudou: () => void }) {
  const [dados, setDados] = useState<DadosConversa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);
  const ultimaQtd = useRef(0);

  const carregar = useCallback(async () => {
    try {
      const r = await obterConversa({ data: { id: props.id } });
      setDados(r as DadosConversa);
      setErro(null);
      if (r.conversa.nao_lidas > 0) {
        await marcarConversaLida({ data: { id: props.id } });
        props.onMudou();
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui abrir a conversa.");
    }
    // props.onMudou muda a cada render do pai; o id é o que importa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useRepetir(carregar, INTERVALO_CONVERSA_MS);

  // Desce até o fim só quando chega mensagem nova, não a cada consulta.
  useEffect(() => {
    const qtd = dados?.mensagens.length ?? 0;
    if (qtd !== ultimaQtd.current) {
      fimRef.current?.scrollIntoView({ block: "end" });
      ultimaQtd.current = qtd;
    }
  }, [dados?.mensagens.length]);

  async function mudar(patch: { status?: "aberta" | "fechada"; automacao_pausada?: boolean }) {
    try {
      await alterarConversa({ data: { id: props.id, ...patch } });
      await carregar();
      props.onMudou();
    } catch {
      toastErro("Não consegui atualizar a conversa.");
    }
  }

  if (erro && !dados) {
    return (
      <div className="flex flex-col items-start gap-3 p-6 xl:col-span-2">
        <p className="font-sans text-[14px] text-[var(--danger)]">{erro}</p>
        <button type="button" onClick={props.onVoltar} className={btnOutline}>
          Voltar pra lista
        </button>
      </div>
    );
  }
  if (!dados) {
    return (
      <p className="p-6 font-sans text-[14px] text-[var(--muted)] xl:col-span-2">Carregando...</p>
    );
  }

  const { conversa, mensagens, janela, comentario, automacao } = dados;
  const contato = conversa.contato;

  async function pararAutomacao() {
    try {
      await pararAutomacaoDaConversa({ data: { id: props.id } });
      await carregar();
    } catch {
      toastErro("Não consegui parar a automação.");
    }
  }

  return (
    <>
      <section aria-label={`Conversa com ${contato.nome}`} className="flex min-h-0 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={props.onVoltar}
              aria-label="Voltar pra lista"
              className="text-[var(--muted)] hover:text-[var(--ink)] lg:hidden"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="text-[var(--muted)]">
              <IconeCanal canal={conversa.canal} size={16} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-cabinet text-[18px] leading-tight text-[var(--ink)]">
                {contato.nome}
              </p>
              <SeloJanela janela={janela} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => mudar({ automacao_pausada: !conversa.automacao_pausada })}
              className={`inline-flex items-center gap-1.5 ${btnOutline}`}
              title="Com a automação pausada, nenhuma automação fala com essa pessoa. Use quando você assumir a conversa."
            >
              {conversa.automacao_pausada ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
              {conversa.automacao_pausada ? "Retomar automação" : "Pausar automação"}
            </button>
            <button
              type="button"
              onClick={() => mudar({ status: conversa.status === "aberta" ? "fechada" : "aberta" })}
              className={`inline-flex items-center gap-1.5 ${btnOutline}`}
            >
              {conversa.status === "aberta" ? <CheckCircle2 size={14} /> : <RotateCcw size={14} />}
              {conversa.status === "aberta" ? "Fechar" : "Reabrir"}
            </button>
          </div>
        </header>

        {automacao && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2">
            <p className="flex items-center gap-2 font-sans text-[13px] text-[var(--ink-soft)]">
              <Workflow size={14} className="text-[var(--muted)]" />
              <span>
                <Link
                  to="/crm/automacoes/$id"
                  params={{ id: automacao.automacao_id }}
                  className="font-medium text-[var(--secondary-text)] no-underline hover:underline"
                >
                  {automacao.nome}
                </Link>{" "}
                · passo {automacao.passo} de {automacao.total} ·{" "}
                {automacao.aguardando === "janela"
                  ? "esperando a pessoa escrever no Direct"
                  : automacao.aguardando === "resposta"
                    ? "esperando a resposta"
                    : "rodando"}
              </span>
            </p>
            <button
              type="button"
              onClick={pararAutomacao}
              className="font-sans text-[12px] text-[var(--danger)] hover:underline"
            >
              Parar automação
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--bg)] px-4 py-4">
          <ol className="flex flex-col gap-2">
            {mensagens.map((m) => (
              <Bolha key={m.id} m={m} />
            ))}
          </ol>
          <div ref={fimRef} />
        </div>

        <Compositor
          conversa={conversa}
          janela={janela}
          comentario={comentario}
          onEnviou={async () => {
            await carregar();
            props.onMudou();
          }}
        />
      </section>

      <aside
        aria-label="Contato"
        className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l border-[var(--line)] p-4 xl:flex"
      >
        <div className="flex items-center gap-2 text-[var(--muted)]">
          <UserRound size={16} />
          <span className="font-accent text-[10px] font-bold uppercase tracking-[1.5px]">
            Contato
          </span>
        </div>
        <p className="font-cabinet text-[20px] leading-tight text-[var(--ink)]">{contato.nome}</p>
        <dl className="flex flex-col gap-3 font-sans text-[13px]">
          {contato.instagram && (
            <div>
              <dt className="text-[var(--muted)]">Instagram</dt>
              <dd>
                <a
                  href={`https://instagram.com/${contato.instagram}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--secondary-text)] no-underline hover:underline"
                >
                  @{contato.instagram}
                </a>
              </dd>
            </div>
          )}
          {contato.telefone && (
            <div>
              <dt className="text-[var(--muted)]">WhatsApp</dt>
              <dd className="text-[var(--ink)]">{formatarTelefone(contato.telefone)}</dd>
            </div>
          )}
        </dl>
        {contato.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {contato.tags.map((t) => (
              <li
                key={t}
                className="rounded-full bg-[var(--surface-pink)] px-2.5 py-1 font-sans text-[12px] text-[var(--ink-soft)]"
              >
                {t}
              </li>
            ))}
          </ul>
        )}
        <Respostas campos={contato.campos} />
        <Link
          to="/crm/contatos/$id"
          params={{ id: contato.id }}
          className={`inline-flex w-fit items-center gap-1.5 no-underline ${btnOutline}`}
        >
          Abrir ficha completa
        </Link>
        <p className="font-sans text-[12px] leading-relaxed text-[var(--muted)]">
          Negociações, lembretes e histórico ficam na ficha.
        </p>
      </aside>
    </>
  );
}

function SeloJanela({ janela }: { janela: Janela }) {
  if (!janela.fechaEm) {
    return (
      <p className="font-sans text-[12px] text-[var(--muted)]">Sem mensagem da pessoa ainda</p>
    );
  }
  if (!janela.aberta) {
    return <p className="font-sans text-[12px] text-[var(--muted)]">Janela de 24h fechada</p>;
  }
  const horas = Math.max(
    0,
    Math.floor((new Date(janela.fechaEm).getTime() - Date.now()) / 3_600_000),
  );
  return (
    <p className="font-sans text-[12px] text-[var(--secondary-text)]">
      Janela aberta, fecha em {horas < 1 ? "menos de 1h" : `${horas}h`}
    </p>
  );
}

const ROTULO_TIPO: Record<string, string> = {
  story_mencao: "Mencionou a Pólia no story",
  story_resposta: "Respondeu ao story",
  comentario: "Comentou num post",
  reacao: "Reagiu",
  botao: "Tocou no botão",
};

const ROTULO_STATUS: Record<string, string> = {
  enviando: "Enviando",
  enviada: "Enviada",
  entregue: "Entregue",
  lida: "Lida",
};

function Midia({ m }: { m: MensagemItem }) {
  if (!m.midia_url) {
    const erroMidia = typeof m.dados.midia_erro === "string" ? m.dados.midia_erro : null;
    return erroMidia ? (
      <p className="font-sans text-[12px] text-[var(--muted)]">Mídia não guardada: {erroMidia}</p>
    ) : null;
  }
  const mime = m.midia_mime ?? "";
  if (m.tipo === "imagem" || m.tipo === "figurinha" || mime.startsWith("image/")) {
    return (
      <a href={m.midia_url} target="_blank" rel="noreferrer">
        <img
          src={m.midia_url}
          alt={m.midia_nome ?? "Imagem da conversa"}
          className="max-h-[260px] max-w-full rounded-lg"
        />
      </a>
    );
  }
  if (m.tipo === "video" || mime.startsWith("video/")) {
    return <video src={m.midia_url} controls className="max-h-[260px] max-w-full rounded-lg" />;
  }
  if (m.tipo === "audio" || mime.startsWith("audio/")) {
    return <audio src={m.midia_url} controls className="max-w-full" />;
  }
  return (
    <a
      href={m.midia_url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-[var(--secondary-text)] no-underline hover:underline"
    >
      <FileText size={14} />
      {m.midia_nome ?? "Arquivo"}
    </a>
  );
}

function Bolha({ m }: { m: MensagemItem }) {
  if (m.direcao === "interna") {
    return (
      <li className="mx-auto w-full max-w-[560px] rounded-xl border border-dashed border-[var(--line)] bg-[var(--surface)] px-4 py-2">
        <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
          Nota interna · {horaCurta(m.criado_em)}
        </p>
        <p className="whitespace-pre-wrap font-sans text-[14px] text-[var(--ink-soft)]">
          {m.texto}
        </p>
      </li>
    );
  }

  const saida = m.direcao === "saida";
  const rotulo = ROTULO_TIPO[m.tipo];
  const storyUrl = typeof m.dados.story_url === "string" ? m.dados.story_url : null;
  const link = typeof m.dados.link === "string" ? m.dados.link : null;
  const botoes = Array.isArray(m.dados.botoes)
    ? m.dados.botoes.filter((b): b is string => typeof b === "string")
    : [];
  const daAutomacao = saida && typeof m.dados.automacao_id === "string";

  return (
    <li className={`flex ${saida ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex max-w-[78%] flex-col gap-1.5 rounded-2xl px-4 py-2.5 ${
          saida
            ? "bg-[var(--secondary-light)] text-[var(--ink)]"
            : "border border-[var(--line)] bg-white text-[var(--ink)]"
        }`}
      >
        {daAutomacao && (
          <p className="flex items-center gap-1 font-sans text-[11px] font-medium text-[var(--muted)]">
            <Workflow size={11} aria-hidden />
            Automação
          </p>
        )}
        {rotulo && (
          <p className="font-sans text-[11px] font-medium text-[var(--muted)]">
            {rotulo}
            {storyUrl && (
              <>
                {" · "}
                <a
                  href={storyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--secondary-text)] no-underline hover:underline"
                >
                  ver story
                </a>
              </>
            )}
          </p>
        )}
        <Midia m={m} />
        {m.texto && (
          <p className="whitespace-pre-wrap break-words font-sans text-[14px] leading-relaxed">
            {m.texto}
          </p>
        )}
        {botoes.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Botões enviados">
            {botoes.map((b) => (
              <li
                key={b}
                className="rounded-full border border-[var(--line)] bg-white px-3 py-1 font-sans text-[12px] text-[var(--secondary-text)]"
              >
                {b}
              </li>
            ))}
          </ul>
        )}
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
          >
            Abrir o que foi compartilhado
          </a>
        )}
        <p className="font-sans text-[11px] text-[var(--muted)]">
          {horaCurta(m.criado_em)}
          {saida && m.status !== "falhou" && ROTULO_STATUS[m.status]
            ? ` · ${ROTULO_STATUS[m.status]}`
            : ""}
        </p>
        {m.status === "falhou" && (
          <p className="font-sans text-[12px] text-[var(--danger)]">
            Não foi enviada{m.erro ? `: ${m.erro}` : "."}
          </p>
        )}
      </div>
    </li>
  );
}

const ANEXO_MAX_BYTES = 8 * 1024 * 1024;
const ACEITA = {
  instagram: "image/jpeg,image/png",
  whatsapp: "image/jpeg,image/png,video/mp4,audio/mpeg,audio/ogg,application/pdf",
};

function lerBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const url = String(leitor.result);
      resolve(url.slice(url.indexOf(",") + 1));
    };
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

function Compositor(props: {
  conversa: ConversaItem;
  janela: Janela;
  comentario: DadosConversa["comentario"];
  onEnviou: () => Promise<void>;
}) {
  const { conversa, janela, comentario } = props;
  const [modo, setModo] = useState<"responder" | "nota">("responder");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [modelos, setModelos] = useState<Modelo[]>([]);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listarModelos()
      .then((r) => setModelos(r.modelos.filter((m) => m.canal === "whatsapp")))
      .catch(() => setModelos([]));
  }, []);

  // Sem janela aberta, o Instagram ainda deixa uma resposta privada ao último comentário.
  const viaComentario = conversa.canal === "instagram" && !janela.aberta && comentario !== null;
  const podeResponder = janela.aberta || viaComentario;

  const avisoFechada = useMemo(() => {
    if (podeResponder) return null;
    return conversa.canal === "whatsapp"
      ? "A janela de 24h fechou. No WhatsApp, fora dela, só sai modelo aprovado pela Meta (chega na fase 3). Dá pra deixar nota interna."
      : "A janela de 24h fechou. O Instagram só libera responder quando a pessoa mandar mensagem de novo. Dá pra deixar nota interna.";
  }, [podeResponder, conversa.canal]);

  async function enviar(e?: FormEvent) {
    e?.preventDefault();
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    try {
      if (modo === "nota") {
        await registrarNota({ data: { conversaId: conversa.id, texto: t } });
      } else {
        const r = await enviarMensagem({
          data: {
            conversaId: conversa.id,
            texto: t,
            comentarioId: viaComentario ? comentario?.commentId : undefined,
          },
        });
        if (!r.ok) toastErro(`A Meta recusou: ${r.erro}`);
      }
      setTexto("");
      await props.onEnviou();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui enviar.");
    } finally {
      setEnviando(false);
    }
  }

  async function anexar(arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.size > ANEXO_MAX_BYTES) {
      toastErro("Arquivo maior que 8 MB.");
      return;
    }
    setEnviando(true);
    try {
      const base64 = await lerBase64(arquivo);
      const r = await enviarAnexo({
        data: {
          conversaId: conversa.id,
          nome: arquivo.name,
          mime: arquivo.type,
          base64,
          legenda: texto.trim() || undefined,
        },
      });
      if (!r.ok) toastErro(`A Meta recusou: ${r.erro}`);
      setTexto("");
      await props.onEnviou();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui enviar o arquivo.");
    } finally {
      setEnviando(false);
      if (arquivoRef.current) arquivoRef.current.value = "";
    }
  }

  const desabilitado = modo === "responder" && !podeResponder;

  return (
    <form
      onSubmit={enviar}
      className="flex flex-col gap-2 border-t border-[var(--line)] bg-white p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          {(
            [
              ["responder", "Responder"],
              ["nota", "Nota interna"],
            ] as const
          ).map(([chave, label]) => (
            <button
              key={chave}
              type="button"
              onClick={() => setModo(chave)}
              aria-pressed={modo === chave}
              className={`rounded-lg px-3 py-1 font-sans text-[13px] ${
                modo === chave
                  ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {modo === "responder" && modelos.length > 0 && podeResponder && (
          <select
            aria-label="Usar modelo de mensagem"
            value=""
            onChange={(e) => {
              const m = modelos.find((x) => x.id === e.target.value);
              if (m) setTexto(aplicarVariaveis(m.corpo, { nome: conversa.contato.nome }));
            }}
            className="max-w-[200px] rounded-lg border border-[var(--line)] bg-white px-2 py-1 font-sans text-[12px] text-[var(--ink-soft)]"
          >
            <option value="">Usar modelo</option>
            {modelos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {modo === "responder" && viaComentario && (
        <p className="rounded-lg bg-[var(--surface)] px-3 py-2 font-sans text-[12px] text-[var(--ink-soft)]">
          Resposta privada ao comentário{comentario?.texto ? ` "${comentario.texto}"` : ""}. Vai pro
          Direct da pessoa e só dá pra mandar uma.
        </p>
      )}
      {modo === "responder" && avisoFechada && (
        <p className="rounded-lg bg-[var(--surface)] px-3 py-2 font-sans text-[12px] text-[var(--ink-soft)]">
          {avisoFechada}
        </p>
      )}

      <div className="flex items-end gap-2">
        <label className="sr-only" htmlFor="texto-mensagem">
          {modo === "nota" ? "Nota interna" : "Mensagem"}
        </label>
        <textarea
          id="texto-mensagem"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          disabled={desabilitado || enviando}
          rows={2}
          placeholder={
            modo === "nota"
              ? "Só a equipe vê. Ex.: pediu proposta até sexta."
              : "Escreva a resposta. Enter envia, Shift+Enter quebra linha."
          }
          className={`${inputClass} min-h-[44px] resize-y`}
        />
        {modo === "responder" && !viaComentario && (
          <>
            <input
              ref={arquivoRef}
              type="file"
              accept={ACEITA[conversa.canal]}
              className="hidden"
              onChange={(e) => anexar(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => arquivoRef.current?.click()}
              disabled={desabilitado || enviando}
              aria-label="Anexar arquivo"
              title={
                conversa.canal === "instagram"
                  ? "Foto (JPG ou PNG, até 8 MB)"
                  : "Foto, vídeo, áudio ou PDF, até 8 MB"
              }
              className={`${btnOutline} px-3`}
            >
              <Paperclip size={16} />
            </button>
          </>
        )}
        <button
          type="submit"
          disabled={desabilitado || enviando || !texto.trim()}
          className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
        >
          <Send size={15} />
          {enviando ? "Enviando..." : modo === "nota" ? "Salvar nota" : "Enviar"}
        </button>
      </div>
    </form>
  );
}
