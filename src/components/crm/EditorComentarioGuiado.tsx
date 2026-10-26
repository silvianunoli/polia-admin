import { useEffect, useMemo, useState } from "react";
import { Link2, Plus, Trash2 } from "lucide-react";
import { postsDoInstagram } from "@/lib/automacoes.functions";
import {
  guiadoParaPassos,
  passosParaGuiado,
  type AutomacaoEntrada,
  type ComentarioGuiado,
  type Gatilho,
} from "@/lib/automacoes";
import type { PostInstagram } from "@/lib/conversas-meta.server";
import { btnOutline, cardClass, inputClass, labelClass } from "@/lib/crm-ui";

// Tela "Comentário → Direct": o construtor de comentário do ManyChat, bloco por bloco, na
// mesma ordem e com as mesmas opções (lido na conta dela em 26/10/2026):
//   Quando alguém faz um comentário → E esse comentário possui → Eles receberão → E então
// À direita, a prévia no celular muda junto com o que se escreve.

type GatilhoComentario = Extract<Gatilho, { tipo: "comentario" }>;

const MAX_RESPOSTAS = 3;
const MAX_LINKS = 3;

function Interruptor(props: {
  id: string;
  rotulo: string;
  ligado: boolean;
  onMudar: (v: boolean) => void;
  desabilitado?: boolean;
}) {
  return (
    <label
      htmlFor={props.id}
      className={`flex items-center justify-between gap-3 font-sans text-[14px] ${
        props.desabilitado ? "text-[var(--muted)]" : "text-[var(--ink)]"
      }`}
    >
      {props.rotulo}
      <input
        id={props.id}
        type="checkbox"
        role="switch"
        checked={props.ligado}
        disabled={props.desabilitado}
        onChange={(e) => props.onMudar(e.target.checked)}
        className="h-4 w-4 shrink-0 accent-[var(--secondary)]"
      />
    </label>
  );
}

function Opcao(props: {
  nome: string;
  rotulo: string;
  ajuda?: string;
  marcada: boolean;
  onMarcar: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        props.marcada ? "border-[var(--secondary)] bg-white" : "border-[var(--line)] bg-white"
      }`}
    >
      <label className="flex items-center gap-2 font-sans text-[14px] text-[var(--ink)]">
        <input
          type="radio"
          name={props.nome}
          checked={props.marcada}
          onChange={props.onMarcar}
          className="accent-[var(--secondary)]"
        />
        {props.rotulo}
      </label>
      {props.ajuda && (
        <p className="mt-1 pl-6 font-sans text-[12px] text-[var(--muted)]">{props.ajuda}</p>
      )}
      {props.marcada && props.children && <div className="mt-3">{props.children}</div>}
    </div>
  );
}

function Bloco(props: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-cabinet text-[18px] text-[var(--ink)]">{props.titulo}</h2>
      {props.children}
    </section>
  );
}

export function EditorComentarioGuiado(props: {
  automacao: AutomacaoEntrada;
  onMudar: (patch: Partial<AutomacaoEntrada>) => void;
}) {
  const g = props.automacao.gatilho as GatilhoComentario;
  const guiado = useMemo(() => passosParaGuiado(props.automacao.passos), [props.automacao.passos]);
  const [posts, setPosts] = useState<PostInstagram[] | null>(null);
  const [erroPosts, setErroPosts] = useState<string | null>(null);
  const [todosPosts, setTodosPosts] = useState(false);
  const [palavraEspecifica, setPalavraEspecifica] = useState(g.palavras.length > 0);
  const [textoPalavras, setTextoPalavras] = useState(g.palavras.join(", "));

  useEffect(() => {
    postsDoInstagram()
      .then((r) => {
        setPosts(r.posts);
        setErroPosts(r.erro);
      })
      .catch(() => setErroPosts("Não consegui ler os posts."));
  }, []);

  const modoPost: "especifico" | "qualquer" | "proximo" = g.proximo_post
    ? "proximo"
    : g.posts.length > 0
      ? "especifico"
      : "qualquer";

  function mudarGatilho(patch: Partial<GatilhoComentario>) {
    props.onMudar({ gatilho: { ...g, ...patch } });
  }

  function mudarGuiado(novo: ComentarioGuiado) {
    props.onMudar({ passos: guiadoParaPassos(novo) });
  }

  const respostas = [...g.respostas_publicas];
  while (respostas.length < MAX_RESPOSTAS) respostas.push("");
  const interagir = g.respostas_publicas.length > 0;

  const postsVisiveis = posts ? (todosPosts ? posts : posts.slice(0, 8)) : [];
  const postEscolhido = posts?.find((p) => g.posts.includes(p.id)) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className={`${cardClass} flex flex-col gap-6 p-5`}>
        <Bloco titulo="Quando alguém faz um comentário">
          <Opcao
            nome="modo-post"
            rotulo="uma publicação ou Reels específico"
            marcada={modoPost === "especifico"}
            onMarcar={() =>
              mudarGatilho({
                proximo_post: false,
                proximo_desde: null,
                posts: g.posts.length ? g.posts : posts?.[0] ? [posts[0].id] : [],
              })
            }
          >
            {erroPosts && <p className="font-sans text-[13px] text-[var(--danger)]">{erroPosts}</p>}
            {!posts && !erroPosts && (
              <p className="font-sans text-[13px] text-[var(--muted)]">
                Lendo os posts do @hub.polia...
              </p>
            )}
            {posts && (
              <>
                <ul className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                  {postsVisiveis.map((p) => {
                    const on = g.posts.includes(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          title={p.legenda}
                          onClick={() => mudarGatilho({ posts: [p.id] })}
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
                {posts.length > 8 && (
                  <button
                    type="button"
                    onClick={() => setTodosPosts((v) => !v)}
                    className="mt-2 font-sans text-[13px] text-[var(--secondary-text)] hover:underline"
                  >
                    {todosPosts ? "Mostrar menos" : "Mostrar todos"}
                  </button>
                )}
              </>
            )}
          </Opcao>
          <Opcao
            nome="modo-post"
            rotulo="qualquer publicação ou Reel"
            marcada={modoPost === "qualquer"}
            onMarcar={() => mudarGatilho({ posts: [], proximo_post: false, proximo_desde: null })}
          />
          <Opcao
            nome="modo-post"
            rotulo="próxima publicação ou Reel"
            ajuda="Vale para o primeiro post publicado depois de salvar."
            marcada={modoPost === "proximo"}
            onMarcar={() => mudarGatilho({ posts: [], proximo_post: true, proximo_desde: null })}
          />
        </Bloco>

        <Bloco titulo="E esse comentário possui">
          <Opcao
            nome="modo-palavra"
            rotulo="uma palavra ou expressão específica"
            marcada={palavraEspecifica}
            onMarcar={() => setPalavraEspecifica(true)}
          >
            <label htmlFor="palavras-guiado">
              <span className={labelClass}>Palavras (separe por vírgula)</span>
              <input
                id="palavras-guiado"
                value={textoPalavras}
                onChange={(e) => setTextoPalavras(e.target.value)}
                onBlur={() =>
                  mudarGatilho({
                    palavras: textoPalavras
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
                placeholder="FALA, quero, preço"
                className={inputClass}
              />
              <span className="mt-1 block font-sans text-[12px] text-[var(--muted)]">
                Não diferencia maiúscula nem acento.
              </span>
            </label>
          </Opcao>
          <Opcao
            nome="modo-palavra"
            rotulo="qualquer palavra"
            marcada={!palavraEspecifica}
            onMarcar={() => {
              setPalavraEspecifica(false);
              setTextoPalavras("");
              mudarGatilho({ palavras: [] });
            }}
          />
          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
            <Interruptor
              id="interagir"
              rotulo="interagir com os comentários deles na publicação"
              ligado={interagir}
              onMudar={(v) =>
                mudarGatilho({
                  respostas_publicas: v
                    ? ["Te mandei no Direct.", "Olha o Direct.", "Mandei no seu Direct."]
                    : [],
                })
              }
            />
            {interagir && (
              <div className="mt-3 flex flex-col gap-2">
                <p className="font-sans text-[12px] text-[var(--muted)]">
                  Uma das respostas é sorteada e publicada no comentário.
                </p>
                {respostas.map((r, i) => (
                  <input
                    key={i}
                    aria-label={`Resposta pública ${i + 1}`}
                    value={r}
                    onChange={(e) => {
                      const novas = [...respostas];
                      novas[i] = e.target.value;
                      mudarGatilho({ respostas_publicas: novas.filter((x) => x.trim()) });
                    }}
                    className={inputClass}
                  />
                ))}
              </div>
            )}
          </div>
        </Bloco>

        <Bloco titulo="Eles receberão">
          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
            <Interruptor
              id="boas-vindas"
              rotulo="uma mensagem de boas-vindas"
              ligado={guiado.boasVindas.ativo}
              onMudar={(ativo) =>
                mudarGuiado({ ...guiado, boasVindas: { ...guiado.boasVindas, ativo } })
              }
            />
            {guiado.boasVindas.ativo && (
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  aria-label="Texto da mensagem de boas-vindas"
                  rows={5}
                  value={guiado.boasVindas.texto}
                  onChange={(e) =>
                    mudarGuiado({
                      ...guiado,
                      boasVindas: { ...guiado.boasVindas, texto: e.target.value },
                    })
                  }
                  className={`${inputClass} resize-y`}
                />
                <input
                  aria-label="Texto do botão de boas-vindas"
                  value={guiado.boasVindas.botao}
                  maxLength={20}
                  onChange={(e) =>
                    mudarGuiado({
                      ...guiado,
                      boasVindas: { ...guiado.boasVindas, botao: e.target.value },
                    })
                  }
                  placeholder='Texto do botão, ex.: "Sim, mande o link"'
                  className={inputClass}
                />
                <p className="font-sans text-[12px] text-[var(--muted)]">
                  O Instagram só deixa mandar o link depois que a pessoa responde. O toque nesse
                  botão conta como resposta e libera a próxima mensagem.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
            <Interruptor
              id="seguir"
              rotulo="uma DM solicitando que sigam seu perfil antes de receberem o link"
              ligado={guiado.seguir.ativo}
              onMudar={(ativo) => mudarGuiado({ ...guiado, seguir: { ...guiado.seguir, ativo } })}
            />
            {guiado.seguir.ativo && (
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  aria-label="Texto do pedido pra seguir"
                  rows={3}
                  value={guiado.seguir.texto}
                  onChange={(e) =>
                    mudarGuiado({ ...guiado, seguir: { ...guiado.seguir, texto: e.target.value } })
                  }
                  className={`${inputClass} resize-y`}
                />
                <input
                  aria-label="Texto do botão de já segui"
                  value={guiado.seguir.botao}
                  maxLength={20}
                  onChange={(e) =>
                    mudarGuiado({ ...guiado, seguir: { ...guiado.seguir, botao: e.target.value } })
                  }
                  className={inputClass}
                />
                <label htmlFor="nao-segue">
                  <span className={labelClass}>Se ainda não seguir</span>
                  <textarea
                    id="nao-segue"
                    rows={2}
                    value={guiado.seguir.textoNaoSegue}
                    onChange={(e) =>
                      mudarGuiado({
                        ...guiado,
                        seguir: { ...guiado.seguir, textoNaoSegue: e.target.value },
                      })
                    }
                    className={`${inputClass} resize-y`}
                  />
                </label>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
            <Interruptor
              id="email"
              rotulo="uma DM solicitando o endereço de e-mail"
              ligado={guiado.email.ativo}
              onMudar={(ativo) => mudarGuiado({ ...guiado, email: { ...guiado.email, ativo } })}
            />
            {guiado.email.ativo && (
              <div className="mt-3 flex flex-col gap-2">
                <textarea
                  aria-label="Texto do pedido de e-mail"
                  rows={2}
                  value={guiado.email.texto}
                  onChange={(e) =>
                    mudarGuiado({ ...guiado, email: { ...guiado.email, texto: e.target.value } })
                  }
                  className={`${inputClass} resize-y`}
                />
                <p className="font-sans text-[12px] text-[var(--muted)]">
                  O e-mail vai pra ficha do contato e passa a valer pras listas de e-mail do CRM.
                </p>
              </div>
            )}
          </div>
        </Bloco>

        <Bloco titulo="E então, eles vão receber">
          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
            <p className="font-sans text-[14px] text-[var(--ink)]">uma DM contendo um link</p>
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                aria-label="Texto da DM com link"
                rows={4}
                value={guiado.link.texto}
                onChange={(e) =>
                  mudarGuiado({ ...guiado, link: { ...guiado.link, texto: e.target.value } })
                }
                className={`${inputClass} resize-y`}
              />
              {guiado.link.botoes.map((b, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[180px_1fr_auto]">
                  <input
                    aria-label={`Texto do botão de link ${i + 1}`}
                    value={b.titulo}
                    maxLength={20}
                    onChange={(e) => {
                      const botoes = guiado.link.botoes.map((x, j) =>
                        j === i ? { ...x, titulo: e.target.value } : x,
                      );
                      mudarGuiado({ ...guiado, link: { ...guiado.link, botoes } });
                    }}
                    placeholder="Abrir o WhatsApp"
                    className={inputClass}
                  />
                  <input
                    aria-label={`Link do botão ${i + 1}`}
                    value={b.url}
                    onChange={(e) => {
                      const botoes = guiado.link.botoes.map((x, j) =>
                        j === i ? { ...x, url: e.target.value.trim() } : x,
                      );
                      mudarGuiado({ ...guiado, link: { ...guiado.link, botoes } });
                    }}
                    placeholder="https://..."
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      mudarGuiado({
                        ...guiado,
                        link: {
                          ...guiado.link,
                          botoes: guiado.link.botoes.filter((_, j) => j !== i),
                        },
                      })
                    }
                    aria-label={`Tirar o botão de link ${i + 1}`}
                    className="rounded p-2 text-[var(--muted)] hover:text-[var(--danger)]"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              {guiado.link.botoes.length < MAX_LINKS && (
                <button
                  type="button"
                  onClick={() =>
                    mudarGuiado({
                      ...guiado,
                      link: {
                        ...guiado.link,
                        botoes: [...guiado.link.botoes, { titulo: "", url: "" }],
                      },
                    })
                  }
                  className={`inline-flex w-fit items-center gap-1.5 ${btnOutline}`}
                >
                  <Plus size={14} />
                  Adicionar um link
                </button>
              )}
              <p className="font-sans text-[12px] text-[var(--muted)]">
                O office conta quem toca no link: aparece como cliques na lista de automações.
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-3">
            <Interruptor
              id="lembrete"
              rotulo="uma DM de lembrete, caso o link não tenha sido acessado"
              ligado={false}
              desabilitado
              onMudar={() => undefined}
            />
            <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">
              Chega junto com as esperas programadas (fase 3). Os cliques já estão sendo contados
              pra isso.
            </p>
          </div>

          <label htmlFor="tags-guiado" className="block">
            <span className={labelClass}>
              Marcar quem passou por aqui com as tags (separe por vírgula)
            </span>
            <input
              id="tags-guiado"
              defaultValue={guiado.tags.join(", ")}
              onBlur={(e) =>
                mudarGuiado({
                  ...guiado,
                  tags: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              className={inputClass}
            />
          </label>
        </Bloco>
      </div>

      <Previa gatilho={g} guiado={guiado} post={postEscolhido} />
    </div>
  );
}

// ---------------------------------------------------------------- prévia

function Balao(props: { children: React.ReactNode; botoes?: string[]; link?: boolean }) {
  return (
    <div className="max-w-[85%] rounded-2xl bg-[var(--surface)] px-3 py-2">
      <p className="whitespace-pre-wrap font-sans text-[12px] leading-snug text-[var(--ink)]">
        {props.children}
      </p>
      {props.botoes && props.botoes.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {props.botoes.map((b, i) => (
            <span
              key={i}
              className="flex items-center justify-center gap-1 rounded-lg bg-white px-2 py-1 font-sans text-[11px] font-medium text-[var(--secondary-text)]"
            >
              {props.link && <Link2 size={10} aria-hidden />}
              {b || "Botão"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Previa(props: {
  gatilho: GatilhoComentario;
  guiado: ComentarioGuiado;
  post: PostInstagram | null;
}) {
  const { gatilho: g, guiado } = props;
  const palavra = g.palavras[0] ?? "Quero";
  return (
    <aside aria-label="Prévia" className="lg:sticky lg:top-6 lg:self-start">
      <p className={labelClass}>Prévia</p>
      <div className="mx-auto w-full max-w-[300px] rounded-[32px] border-[6px] border-[var(--ink)] bg-white p-3">
        <div className="overflow-hidden rounded-xl border border-[var(--line)]">
          {props.post?.imagem ? (
            <img src={props.post.imagem} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center bg-[var(--surface)] font-sans text-[12px] text-[var(--muted)]">
              {g.proximo_post ? "Próxima publicação" : "Qualquer publicação"}
            </div>
          )}
          <div className="flex flex-col gap-1 px-3 py-2 font-sans text-[11px]">
            <p>
              <strong>cliente</strong> {palavra}
            </p>
            {g.respostas_publicas[0] && (
              <p className="pl-3 text-[var(--ink-soft)]">
                <strong>hub.polia</strong> {g.respostas_publicas[0]}
              </p>
            )}
          </div>
        </div>

        <p className="mb-2 mt-4 text-center font-sans text-[10px] uppercase tracking-[1.5px] text-[var(--muted)]">
          Direct
        </p>
        <div className="flex flex-col gap-2">
          {guiado.boasVindas.ativo && (
            <Balao botoes={[guiado.boasVindas.botao]}>{guiado.boasVindas.texto}</Balao>
          )}
          {guiado.seguir.ativo && (
            <Balao botoes={[guiado.seguir.botao]}>{guiado.seguir.texto}</Balao>
          )}
          {guiado.email.ativo && <Balao>{guiado.email.texto}</Balao>}
          <Balao botoes={guiado.link.botoes.map((b) => b.titulo)} link>
            {guiado.link.texto}
          </Balao>
        </div>
      </div>
    </aside>
  );
}
