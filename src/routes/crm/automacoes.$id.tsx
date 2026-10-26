import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Bell,
  Briefcase,
  HelpCircle,
  MessageSquare,
  Paperclip,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import {
  excluirAutomacao,
  obterAutomacao,
  postsDoInstagram,
  salvarAutomacao,
} from "@/lib/automacoes.functions";
import {
  automacaoSchema,
  novoId,
  resumoGatilho,
  type AutomacaoEntrada,
  type Gatilho,
  type Passo,
  type TipoPasso,
} from "@/lib/automacoes";
import type { PostInstagram } from "@/lib/conversas-meta.server";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";
import {
  btnDanger,
  btnOutline,
  btnPrimary,
  cardClass,
  formatarDataHora,
  inputClass,
  labelClass,
} from "@/lib/crm-ui";

// Editor de automação em lista (CRM-27). Construtor escolhido pela Sil em 26/10: lista de
// passos agora, canvas depois lendo o mesmo JSON. Ramificação só por botão.
export const Route = createFileRoute("/crm/automacoes/$id")({
  head: () => ({ meta: [{ title: "Automação · CRM Pólia" }] }),
  component: EditorAutomacao,
});

const TIPOS_PASSO: {
  tipo: TipoPasso;
  rotulo: string;
  icone: typeof MessageSquare;
  ajuda: string;
}[] = [
  {
    tipo: "mensagem",
    rotulo: "Mensagem",
    icone: MessageSquare,
    ajuda: "Texto, com botões opcionais",
  },
  { tipo: "pergunta", rotulo: "Pergunta", icone: HelpCircle, ajuda: "Espera a resposta e guarda" },
  {
    tipo: "midia",
    rotulo: "Arquivo ou foto",
    icone: Paperclip,
    ajuda: "PDF, foto, vídeo ou áudio",
  },
  { tipo: "tag", rotulo: "Tag", icone: Tag, ajuda: "Põe ou tira tag do contato" },
  { tipo: "crm", rotulo: "Ação no CRM", icone: Briefcase, ajuda: "Negócio, lembrete, status" },
  { tipo: "notificar", rotulo: "Avisar a equipe", icone: Bell, ajuda: "E-mail pro oi@" },
];

const ROTULO_ESTADO: Record<string, string> = {
  rodando: "Rodando",
  aguardando: "Esperando a pessoa",
  concluida: "Terminou",
  cancelada: "Parada",
  expirada: "Expirou",
  erro: "Deu erro",
};

function passoNovo(tipo: TipoPasso): Passo {
  const id = novoId();
  switch (tipo) {
    case "mensagem":
      return { id, tipo, texto: "", botoes: [], salvar_em: null };
    case "pergunta":
      return { id, tipo, texto: "", salvar_em: "", validacao: "texto" };
    case "midia":
      return { id, tipo, midia: "arquivo", url: "", nome: "", legenda: "" };
    case "tag":
      return { id, tipo, adicionar: [], remover: [] };
    case "crm":
      return { id, tipo, negocio: null, lembrete: null, status: null };
    case "notificar":
      return { id, tipo, texto: "" };
  }
}

function resumoPasso(p: Passo): string {
  if (p.tipo === "mensagem" || p.tipo === "pergunta" || p.tipo === "notificar") {
    return p.texto.split("\n")[0].slice(0, 50) || "(sem texto)";
  }
  if (p.tipo === "midia") return p.nome || p.midia;
  if (p.tipo === "tag")
    return [...p.adicionar.map((t) => `+${t}`), ...p.remover.map((t) => `-${t}`)].join(" ");
  return "Ação no CRM";
}

// Lista separada por vírgula, mas que deixa digitar a vírgula sem engolir.
function CampoLista(props: {
  id: string;
  rotulo: string;
  valor: string[];
  onMudar: (v: string[]) => void;
  ajuda?: string;
}) {
  const [texto, setTexto] = useState(props.valor.join(", "));
  useEffect(() => setTexto(props.valor.join(", ")), [props.valor.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="block" htmlFor={props.id}>
      <span className={labelClass}>{props.rotulo}</span>
      <input
        id={props.id}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() =>
          props.onMudar(
            texto
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        className={inputClass}
      />
      {props.ajuda && (
        <span className="mt-1 block font-sans text-[12px] text-[var(--muted)]">{props.ajuda}</span>
      )}
    </label>
  );
}

function EditorAutomacao() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { confirmar, dialogo } = useConfirmacao();

  const [a, setA] = useState<AutomacaoEntrada | null>(null);
  const [execucoes, setExecucoes] = useState<
    Awaited<ReturnType<typeof obterAutomacao>>["execucoes"]
  >([]);
  const [contagem, setContagem] = useState(0);
  const [alterado, setAlterado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    try {
      const r = await obterAutomacao({ data: { id } });
      const { id: _id, execucoes: n, ativas_agora: _x, atualizado_em: _t, ...resto } = r.automacao;
      setA(resto);
      setContagem(n);
      setExecucoes(r.execucoes);
      setAlterado(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui abrir a automação.");
    }
  }

  useEffect(() => {
    carregar();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  function mudar(patch: Partial<AutomacaoEntrada>) {
    setA((atual) => (atual ? { ...atual, ...patch } : atual));
    setAlterado(true);
  }

  function mudarPasso(i: number, passo: Passo) {
    if (!a) return;
    const passos = [...a.passos];
    passos[i] = passo;
    mudar({ passos });
  }

  function moverPasso(i: number, delta: number) {
    if (!a) return;
    const j = i + delta;
    if (j < 0 || j >= a.passos.length) return;
    const passos = [...a.passos];
    [passos[i], passos[j]] = [passos[j], passos[i]];
    mudar({ passos });
  }

  async function salvar() {
    if (!a) return;
    const valido = automacaoSchema.safeParse(a);
    if (!valido.success) {
      toastErro(valido.error.issues[0]?.message ?? "Tem algo incompleto na automação.");
      return;
    }
    setSalvando(true);
    try {
      await salvarAutomacao({ data: { id, automacao: valido.data } });
      toastSucesso(
        a.ativa ? "Salvo. A automação está ligada." : "Salvo. A automação está desligada.",
      );
      await carregar();
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar() {
    if (!a) return;
    const ok = await confirmar({
      titulo: "Apagar esta automação",
      perigo: true,
      rotuloConfirmar: "Apagar automação",
      descricao: (
        <>
          <strong className="text-[var(--ink)]">{a.nome}</strong> some junto com o histórico de
          execuções. As mensagens que ela já mandou continuam nas conversas.
        </>
      ),
    });
    if (!ok) return;
    try {
      await excluirAutomacao({ data: { id } });
      navigate({ to: "/crm/automacoes" });
    } catch {
      toastErro("Não consegui apagar.");
    }
  }

  if (erro) return <p className="font-sans text-[14px] text-[var(--danger)]">{erro}</p>;
  if (!a) return <p className="font-sans text-[14px] text-[var(--muted)]">Carregando...</p>;

  const deComentario = a.gatilho.tipo === "comentario";

  return (
    <div className="flex flex-col gap-5 pb-24">
      <Link
        to="/crm/automacoes"
        className="inline-flex w-fit items-center gap-1.5 font-sans text-[13px] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} />
        Automações
      </Link>

      {/* Cabeçalho */}
      <section className={`${cardClass} grid gap-4 p-5 md:grid-cols-[1fr_200px_auto]`}>
        <label htmlFor="nome-automacao">
          <span className={labelClass}>Nome</span>
          <input
            id="nome-automacao"
            value={a.nome}
            onChange={(e) => mudar({ nome: e.target.value })}
            className={inputClass}
          />
        </label>
        <label htmlFor="canal-automacao">
          <span className={labelClass}>Canal</span>
          <select
            id="canal-automacao"
            value={a.canal}
            onChange={(e) => {
              const canal = e.target.value as AutomacaoEntrada["canal"];
              // Comentário só existe no Instagram.
              const gatilho: Gatilho =
                canal !== "instagram" && a.gatilho.tipo === "comentario"
                  ? { tipo: "palavra_chave", palavras: ["oi"], modo: "contem" }
                  : a.gatilho;
              mudar({ canal, gatilho });
            }}
            className={inputClass}
          >
            <option value="instagram">Instagram</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="ambos">Os dois</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 font-sans text-[14px] text-[var(--ink)]">
          <input
            type="checkbox"
            role="switch"
            checked={a.ativa}
            onChange={(e) => mudar({ ativa: e.target.checked })}
            className="h-4 w-4 accent-[var(--secondary)]"
          />
          {a.ativa ? "Ligada" : "Desligada"}
        </label>
      </section>

      {/* Gatilho */}
      <section className={`${cardClass} flex flex-col gap-4 p-5`} aria-labelledby="titulo-gatilho">
        <div>
          <h2 id="titulo-gatilho" className="font-cabinet text-[18px] text-[var(--ink)]">
            Quando começa
          </h2>
          <p className="font-sans text-[13px] text-[var(--muted)]">{resumoGatilho(a.gatilho)}</p>
        </div>
        <EditorGatilho
          gatilho={a.gatilho}
          canal={a.canal}
          onMudar={(gatilho) => mudar({ gatilho })}
        />
      </section>

      {/* Passos */}
      <section className="flex flex-col gap-3" aria-labelledby="titulo-passos">
        <div className="flex items-baseline justify-between">
          <h2 id="titulo-passos" className="font-cabinet text-[18px] text-[var(--ink)]">
            O que acontece, em ordem
          </h2>
          <p className="font-sans text-[12px] text-[var(--muted)]">
            Variáveis: {"{primeiro_nome}"}, {"{nome}"} e qualquer resposta guardada, como{" "}
            {"{marca_instagram}"}
          </p>
        </div>
        {deComentario && (
          <p className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
            A primeira mensagem vai como resposta privada ao comentário. O Instagram só deixa mandar
            a próxima depois que a pessoa responder no Direct: se tiver mais mensagens na lista, a
            automação espera ela escrever. Botões ajudam, porque um toque já conta como resposta.
          </p>
        )}

        <ol className="flex flex-col gap-3">
          {a.passos.map((p, i) => (
            <CartaoPasso
              key={p.id}
              passo={p}
              indice={i}
              total={a.passos.length}
              todos={a.passos}
              canal={a.canal}
              onMudar={(novo) => mudarPasso(i, novo)}
              onMover={(d) => moverPasso(i, d)}
              onApagar={() => mudar({ passos: a.passos.filter((_, j) => j !== i) })}
            />
          ))}
        </ol>

        <div className={`${cardClass} p-4`}>
          <p className={labelClass}>Adicionar passo</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {TIPOS_PASSO.map((t) => {
              const Icone = t.icone;
              return (
                <button
                  key={t.tipo}
                  type="button"
                  onClick={() => mudar({ passos: [...a.passos, passoNovo(t.tipo)] })}
                  className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-left hover:border-[var(--secondary)]"
                >
                  <Icone size={15} className="mt-0.5 text-[var(--muted)]" />
                  <span>
                    <span className="block font-sans text-[13px] font-medium text-[var(--ink)]">
                      {t.rotulo}
                    </span>
                    <span className="block font-sans text-[12px] text-[var(--muted)]">
                      {t.ajuda}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Execuções */}
      <section className={cardClass} aria-labelledby="titulo-execucoes">
        <div className="border-b border-[var(--line)] px-5 py-3">
          <h2 id="titulo-execucoes" className="font-cabinet text-[17px] text-[var(--ink)]">
            Quem passou por aqui
          </h2>
          <p className="font-sans text-[12px] text-[var(--muted)]">
            {contagem} {contagem === 1 ? "vez" : "vezes"} no total. As 30 mais recentes:
          </p>
        </div>
        <ul>
          {execucoes.length === 0 && (
            <li className="px-5 py-5 font-sans text-[13px] text-[var(--muted)]">Ninguém ainda.</li>
          )}
          {execucoes.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3 last:border-b-0"
            >
              <Link
                to="/crm/conversas"
                search={{ c: e.conversa_id }}
                className="font-sans text-[14px] text-[var(--secondary-text)] no-underline hover:underline"
              >
                {e.contato?.nome ?? "Contato"}
              </Link>
              <span className="font-sans text-[12px] text-[var(--muted)]">
                {ROTULO_ESTADO[e.estado] ?? e.estado} · passo {e.passo_idx + 1} ·{" "}
                {formatarDataHora(e.iniciado_em)}
                {e.erro ? ` · ${e.erro}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Barra de salvar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-white px-8 py-3">
        <div className="flex items-center justify-end gap-3">
          {alterado && (
            <span className="mr-auto font-sans text-[13px] text-[var(--muted)]">
              Tem mudança sem salvar.
            </span>
          )}
          <button type="button" onClick={apagar} className={btnDanger}>
            <Trash2 size={14} />
          </button>
          <button type="button" onClick={salvar} disabled={salvando} className={btnPrimary}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
      {dialogo}
    </div>
  );
}

// ---------------------------------------------------------------- gatilho

function EditorGatilho(props: {
  gatilho: Gatilho;
  canal: AutomacaoEntrada["canal"];
  onMudar: (g: Gatilho) => void;
}) {
  const g = props.gatilho;
  const tipos: { valor: Gatilho["tipo"]; rotulo: string }[] = [
    ...(props.canal === "instagram"
      ? [{ valor: "comentario" as const, rotulo: "Alguém comenta num post" }]
      : []),
    { valor: "palavra_chave", rotulo: "Mensagem com palavra-chave" },
    { valor: "resposta_padrao", rotulo: "Resposta padrão (nada mais combinou)" },
  ];

  function trocarTipo(tipo: Gatilho["tipo"]) {
    if (tipo === g.tipo) return;
    if (tipo === "comentario") {
      props.onMudar({ tipo, posts: [], palavras: [], respostas_publicas: [] });
    } else if (tipo === "palavra_chave") {
      props.onMudar({ tipo, palavras: ["oi"], modo: "contem" });
    } else {
      props.onMudar({ tipo });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <label htmlFor="tipo-gatilho" className="max-w-[360px]">
        <span className={labelClass}>Gatilho</span>
        <select
          id="tipo-gatilho"
          value={g.tipo}
          onChange={(e) => trocarTipo(e.target.value as Gatilho["tipo"])}
          className={inputClass}
        >
          {tipos.map((t) => (
            <option key={t.valor} value={t.valor}>
              {t.rotulo}
            </option>
          ))}
        </select>
      </label>

      {g.tipo === "comentario" && (
        <>
          <EscolherPosts
            selecionados={g.posts}
            onMudar={(posts) => props.onMudar({ ...g, posts })}
          />
          <CampoLista
            id="palavras-comentario"
            rotulo="Só se o comentário tiver (separe por vírgula)"
            valor={g.palavras}
            onMudar={(palavras) => props.onMudar({ ...g, palavras })}
            ajuda="Vazio = qualquer comentário. Não diferencia maiúscula nem acento."
          />
          <label htmlFor="respostas-publicas">
            <span className={labelClass}>
              Resposta pública no comentário (uma por linha, sorteia)
            </span>
            <textarea
              id="respostas-publicas"
              rows={2}
              value={g.respostas_publicas.join("\n")}
              onChange={(e) =>
                props.onMudar({
                  ...g,
                  respostas_publicas: e.target.value.split("\n").filter((l) => l.trim()),
                })
              }
              className={inputClass}
              placeholder="Te mandei no Direct."
            />
          </label>
        </>
      )}

      {g.tipo === "palavra_chave" && (
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <CampoLista
            id="palavras-chave"
            rotulo="Palavras-chave (separe por vírgula)"
            valor={g.palavras}
            onMudar={(palavras) => props.onMudar({ ...g, palavras })}
            ajuda="Não diferencia maiúscula nem acento."
          />
          <label htmlFor="modo-palavra">
            <span className={labelClass}>A mensagem</span>
            <select
              id="modo-palavra"
              value={g.modo}
              onChange={(e) => props.onMudar({ ...g, modo: e.target.value as "contem" | "exata" })}
              className={inputClass}
            >
              <option value="contem">contém a palavra</option>
              <option value="exata">é exatamente a palavra</option>
            </select>
          </label>
        </div>
      )}

      {g.tipo === "resposta_padrao" && (
        <p className="font-sans text-[13px] text-[var(--muted)]">
          Responde quem manda mensagem e não cai em nenhuma outra automação. Para não insistir, só
          dispara uma vez a cada 24h na mesma conversa.
        </p>
      )}
    </div>
  );
}

function EscolherPosts(props: { selecionados: string[]; onMudar: (ids: string[]) => void }) {
  const [posts, setPosts] = useState<PostInstagram[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(props.selecionados.length > 0);

  useEffect(() => {
    if (!aberto || posts) return;
    postsDoInstagram()
      .then((r) => {
        setPosts(r.posts);
        setErro(r.erro);
      })
      .catch(() => setErro("Não consegui ler os posts."));
  }, [aberto, posts]);

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={labelClass}>Em qual post</legend>
      <div className="flex gap-4 font-sans text-[14px] text-[var(--ink)]">
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="posts"
            checked={!aberto}
            onChange={() => {
              setAberto(false);
              props.onMudar([]);
            }}
            className="accent-[var(--secondary)]"
          />
          Qualquer post
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="radio"
            name="posts"
            checked={aberto}
            onChange={() => setAberto(true)}
            className="accent-[var(--secondary)]"
          />
          Posts escolhidos
        </label>
      </div>
      {aberto && (
        <>
          {erro && <p className="font-sans text-[13px] text-[var(--danger)]">{erro}</p>}
          {!posts && !erro && (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Lendo os posts do @hub.polia...
            </p>
          )}
          {posts && (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
              {posts.map((p) => {
                const on = props.selecionados.includes(p.id);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      aria-pressed={on}
                      title={p.legenda}
                      onClick={() =>
                        props.onMudar(
                          on
                            ? props.selecionados.filter((x) => x !== p.id)
                            : [...props.selecionados, p.id],
                        )
                      }
                      className={`block aspect-square w-full overflow-hidden rounded-lg border-2 ${
                        on ? "border-[var(--secondary)]" : "border-transparent"
                      }`}
                    >
                      {p.imagem ? (
                        <img
                          src={p.imagem}
                          alt={p.legenda || "Post"}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="block p-1 font-sans text-[10px] text-[var(--muted)]">
                          {p.legenda}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="font-sans text-[12px] text-[var(--muted)]">
            {props.selecionados.length}{" "}
            {props.selecionados.length === 1 ? "post escolhido" : "posts escolhidos"}
          </p>
        </>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------- passos

function CartaoPasso(props: {
  passo: Passo;
  indice: number;
  total: number;
  todos: Passo[];
  canal: AutomacaoEntrada["canal"];
  onMudar: (p: Passo) => void;
  onMover: (delta: number) => void;
  onApagar: () => void;
}) {
  const { passo: p } = props;
  const meta = TIPOS_PASSO.find((t) => t.tipo === p.tipo)!;
  const Icone = meta.icone;
  const prefixo = `passo-${p.id}`;

  return (
    <li className={`${cardClass} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-sans text-[13px] font-medium text-[var(--ink)]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface)] text-[12px]">
            {props.indice + 1}
          </span>
          <Icone size={14} className="text-[var(--muted)]" />
          {meta.rotulo}
        </p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => props.onMover(-1)}
            disabled={props.indice === 0}
            aria-label="Subir passo"
            className="rounded p-1 text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-30"
          >
            <ArrowUp size={15} />
          </button>
          <button
            type="button"
            onClick={() => props.onMover(1)}
            disabled={props.indice === props.total - 1}
            aria-label="Descer passo"
            className="rounded p-1 text-[var(--muted)] hover:text-[var(--ink)] disabled:opacity-30"
          >
            <ArrowDown size={15} />
          </button>
          <button
            type="button"
            onClick={props.onApagar}
            aria-label="Apagar passo"
            className="rounded p-1 text-[var(--muted)] hover:text-[var(--danger)]"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {(p.tipo === "mensagem" || p.tipo === "pergunta" || p.tipo === "notificar") && (
        <label htmlFor={`${prefixo}-texto`} className="block">
          <span className="sr-only">Texto</span>
          <textarea
            id={`${prefixo}-texto`}
            rows={p.tipo === "notificar" ? 2 : 4}
            value={p.texto}
            onChange={(e) => props.onMudar({ ...p, texto: e.target.value })}
            placeholder={
              p.tipo === "notificar"
                ? "O que o e-mail de aviso diz"
                : "O que a Pólia escreve pra pessoa"
            }
            className={`${inputClass} resize-y`}
          />
        </label>
      )}

      {p.tipo === "mensagem" && (
        <EditorBotoes passo={p} todos={props.todos} canal={props.canal} onMudar={props.onMudar} />
      )}

      {p.tipo === "pergunta" && (
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label htmlFor={`${prefixo}-campo`}>
            <span className={labelClass}>Guardar a resposta em</span>
            <input
              id={`${prefixo}-campo`}
              value={p.salvar_em}
              onChange={(e) => props.onMudar({ ...p, salvar_em: limparCampo(e.target.value) })}
              placeholder="ex.: marca_instagram"
              className={inputClass}
            />
          </label>
          <label htmlFor={`${prefixo}-validacao`}>
            <span className={labelClass}>Formato esperado</span>
            <select
              id={`${prefixo}-validacao`}
              value={p.validacao}
              onChange={(e) =>
                props.onMudar({ ...p, validacao: e.target.value as typeof p.validacao })
              }
              className={inputClass}
            >
              <option value="texto">Qualquer texto</option>
              <option value="email">E-mail</option>
              <option value="telefone">Telefone</option>
              <option value="numero">Número</option>
            </select>
          </label>
        </div>
      )}

      {p.tipo === "midia" && (
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <label htmlFor={`${prefixo}-midia`}>
            <span className={labelClass}>Tipo</span>
            <select
              id={`${prefixo}-midia`}
              value={p.midia}
              onChange={(e) => props.onMudar({ ...p, midia: e.target.value as typeof p.midia })}
              className={inputClass}
            >
              <option value="arquivo">Arquivo (PDF)</option>
              <option value="imagem">Foto</option>
              <option value="video">Vídeo</option>
              <option value="audio">Áudio</option>
            </select>
          </label>
          <label htmlFor={`${prefixo}-url`}>
            <span className={labelClass}>Link público do arquivo</span>
            <input
              id={`${prefixo}-url`}
              value={p.url}
              onChange={(e) => props.onMudar({ ...p, url: e.target.value.trim() })}
              placeholder="https://..."
              className={inputClass}
            />
          </label>
          <label htmlFor={`${prefixo}-nome`}>
            <span className={labelClass}>Nome do arquivo</span>
            <input
              id={`${prefixo}-nome`}
              value={p.nome}
              onChange={(e) => props.onMudar({ ...p, nome: e.target.value })}
              className={inputClass}
            />
          </label>
          <label htmlFor={`${prefixo}-legenda`}>
            <span className={labelClass}>Legenda (opcional)</span>
            <input
              id={`${prefixo}-legenda`}
              value={p.legenda}
              onChange={(e) => props.onMudar({ ...p, legenda: e.target.value })}
              className={inputClass}
            />
          </label>
          {!p.url && (
            <p className="font-sans text-[12px] text-[var(--danger)] md:col-span-2">
              Sem link, este passo é pulado. Cole o link do arquivo pra ele sair.
            </p>
          )}
          {props.canal === "instagram" && p.midia !== "imagem" && (
            <p className="font-sans text-[12px] text-[var(--muted)] md:col-span-2">
              No Instagram só sai foto. Arquivo, vídeo e áudio funcionam no WhatsApp.
            </p>
          )}
        </div>
      )}

      {p.tipo === "tag" && (
        <div className="grid gap-3 md:grid-cols-2">
          <CampoLista
            id={`${prefixo}-add`}
            rotulo="Pôr as tags"
            valor={p.adicionar}
            onMudar={(adicionar) => props.onMudar({ ...p, adicionar })}
          />
          <CampoLista
            id={`${prefixo}-rem`}
            rotulo="Tirar as tags"
            valor={p.remover}
            onMudar={(remover) => props.onMudar({ ...p, remover })}
          />
        </div>
      )}

      {p.tipo === "crm" && (
        <div className="flex flex-col gap-3">
          <label className="inline-flex items-center gap-2 font-sans text-[14px] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={p.negocio !== null}
              onChange={(e) =>
                props.onMudar({
                  ...p,
                  negocio: e.target.checked ? { titulo: "Novo negócio", produto: "" } : null,
                })
              }
              className="accent-[var(--secondary)]"
            />
            Abrir negociação em "Chegou agora"
          </label>
          {p.negocio && (
            <div className="grid gap-3 pl-6 md:grid-cols-2">
              <label htmlFor={`${prefixo}-neg`}>
                <span className={labelClass}>Título</span>
                <input
                  id={`${prefixo}-neg`}
                  value={p.negocio.titulo}
                  onChange={(e) =>
                    props.onMudar({ ...p, negocio: { ...p.negocio!, titulo: e.target.value } })
                  }
                  className={inputClass}
                />
              </label>
              <label htmlFor={`${prefixo}-prod`}>
                <span className={labelClass}>Produto</span>
                <input
                  id={`${prefixo}-prod`}
                  value={p.negocio.produto}
                  onChange={(e) =>
                    props.onMudar({ ...p, negocio: { ...p.negocio!, produto: e.target.value } })
                  }
                  className={inputClass}
                />
              </label>
            </div>
          )}
          <label className="inline-flex items-center gap-2 font-sans text-[14px] text-[var(--ink)]">
            <input
              type="checkbox"
              checked={p.lembrete !== null}
              onChange={(e) =>
                props.onMudar({
                  ...p,
                  lembrete: e.target.checked ? { titulo: "Retomar a conversa", dias: 1 } : null,
                })
              }
              className="accent-[var(--secondary)]"
            />
            Criar lembrete
          </label>
          {p.lembrete && (
            <div className="grid gap-3 pl-6 md:grid-cols-[1fr_160px]">
              <label htmlFor={`${prefixo}-lem`}>
                <span className={labelClass}>Lembrete</span>
                <input
                  id={`${prefixo}-lem`}
                  value={p.lembrete.titulo}
                  onChange={(e) =>
                    props.onMudar({ ...p, lembrete: { ...p.lembrete!, titulo: e.target.value } })
                  }
                  className={inputClass}
                />
              </label>
              <label htmlFor={`${prefixo}-dias`}>
                <span className={labelClass}>Pra daqui a (dias)</span>
                <input
                  id={`${prefixo}-dias`}
                  type="number"
                  min={0}
                  max={60}
                  value={p.lembrete.dias}
                  onChange={(e) =>
                    props.onMudar({
                      ...p,
                      lembrete: {
                        ...p.lembrete!,
                        dias: Math.max(0, Math.min(60, Number(e.target.value) || 0)),
                      },
                    })
                  }
                  className={inputClass}
                />
              </label>
            </div>
          )}
          <label htmlFor={`${prefixo}-status`} className="max-w-[300px]">
            <span className={labelClass}>Mudar o status do contato</span>
            <select
              id={`${prefixo}-status`}
              value={p.status ?? ""}
              onChange={(e) =>
                props.onMudar({ ...p, status: (e.target.value || null) as typeof p.status })
              }
              className={inputClass}
            >
              <option value="">Não mudar</option>
              <option value="lead">Lead</option>
              <option value="conversando">Conversando</option>
              <option value="cliente">Cliente</option>
              <option value="inativa">Sumiu</option>
              <option value="perdida">Perdida</option>
            </select>
          </label>
        </div>
      )}
    </li>
  );
}

function limparCampo(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 40);
}

function EditorBotoes(props: {
  passo: Extract<Passo, { tipo: "mensagem" }>;
  todos: Passo[];
  canal: AutomacaoEntrada["canal"];
  onMudar: (p: Passo) => void;
}) {
  const p = props.passo;
  const destinos = useMemo(
    () =>
      props.todos
        .filter((x) => x.id !== p.id)
        .map((x) => ({ id: x.id, rotulo: resumoPasso(x), num: props.todos.indexOf(x) + 1 })),
    [props.todos, p.id],
  );

  function mudarBotao(i: number, patch: Partial<(typeof p.botoes)[number]>) {
    const botoes = p.botoes.map((b, j) => (j === i ? { ...b, ...patch } : b));
    props.onMudar({ ...p, botoes });
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      {p.botoes.map((b, i) => (
        <div key={b.id} className="grid items-end gap-2 md:grid-cols-[1fr_1fr_auto]">
          <label htmlFor={`b-${p.id}-${b.id}`}>
            <span className={labelClass}>Botão {i + 1} (até 20 letras)</span>
            <input
              id={`b-${p.id}-${b.id}`}
              value={b.titulo}
              maxLength={20}
              onChange={(e) => mudarBotao(i, { titulo: e.target.value })}
              className={inputClass}
            />
          </label>
          <label htmlFor={`d-${p.id}-${b.id}`}>
            <span className={labelClass}>Depois vai para</span>
            <select
              id={`d-${p.id}-${b.id}`}
              value={b.ir_para ?? ""}
              onChange={(e) => mudarBotao(i, { ir_para: e.target.value || null })}
              className={inputClass}
            >
              <option value="">O próximo passo</option>
              {destinos.map((d) => (
                <option key={d.id} value={d.id}>
                  Passo {d.num}: {d.rotulo}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => props.onMudar({ ...p, botoes: p.botoes.filter((_, j) => j !== i) })}
            aria-label={`Tirar o botão ${i + 1}`}
            className="mb-2 rounded p-1 text-[var(--muted)] hover:text-[var(--danger)]"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={() =>
            props.onMudar({
              ...p,
              botoes: [...p.botoes, { id: novoId(), titulo: "", ir_para: null }],
            })
          }
          disabled={p.botoes.length >= 10}
          className={`inline-flex items-center gap-1.5 ${btnOutline}`}
        >
          <Plus size={14} />
          Botão
        </button>
        {p.botoes.length > 0 && (
          <label htmlFor={`salvar-${p.id}`} className="min-w-[220px]">
            <span className={labelClass}>Guardar o botão tocado em</span>
            <input
              id={`salvar-${p.id}`}
              value={p.salvar_em ?? ""}
              onChange={(e) =>
                props.onMudar({ ...p, salvar_em: limparCampo(e.target.value) || null })
              }
              placeholder="ex.: faturamento"
              className={inputClass}
            />
          </label>
        )}
      </div>
      {p.botoes.length > 3 && props.canal !== "instagram" && (
        <p className="font-sans text-[12px] text-[var(--muted)]">
          No WhatsApp, com mais de 3 botões a mensagem vira uma lista pra escolher.
        </p>
      )}
      {p.botoes.length > 0 && (
        <p className="font-sans text-[12px] text-[var(--muted)]">
          Com botões, a automação espera a pessoa tocar (ou escrever) antes de seguir.
        </p>
      )}
    </div>
  );
}
