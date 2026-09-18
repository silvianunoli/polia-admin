import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Send, Eye, RefreshCcw, Save } from "lucide-react";
import {
  obterCampanha,
  salvarCampanha,
  enviarCampanha,
  enviarTeste,
  atualizarMetricas,
  previaPublico,
  type Campanha,
  type Lista,
} from "@/lib/crm-campanhas.functions";
import { EditorEmail } from "@/components/crm/EditorEmail";
import { montarHtmlCampanha } from "@/lib/crm-email-html";
import { toastErro, toastSucesso } from "@/lib/toast";
import {
  btnOutline,
  btnPrimary,
  cardClass,
  formatarDataHora,
  inputClass,
  labelClass,
} from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/campanhas/$id")({
  head: () => ({ meta: [{ title: "Campanha · CRM Pólia" }] }),
  component: EditorCampanha,
});

function EditorCampanha() {
  const { id } = Route.useParams();
  const navigate = useNavigate();

  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [listas, setListas] = useState<Lista[]>([]);
  const [carregando, setCarregando] = useState(true);

  const [nome, setNome] = useState("");
  const [assunto, setAssunto] = useState("");
  const [preheader, setPreheader] = useState("");
  const [corpo, setCorpo] = useState("");
  const [listaId, setListaId] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [previa, setPrevia] = useState<number | null>(null);
  const [verPrevia, setVerPrevia] = useState(false);
  const [emailTeste, setEmailTeste] = useState("");
  const [agendarPara, setAgendarPara] = useState("");

  async function carregar() {
    setCarregando(true);
    try {
      const r = await obterCampanha({ data: { id } });
      setCampanha(r.campanha);
      setListas(r.listas);
      setNome(r.campanha.nome);
      setAssunto(r.campanha.assunto);
      setPreheader(r.campanha.preheader ?? "");
      setCorpo(r.campanha.corpo_html);
      setListaId(r.campanha.lista_id ?? "");
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui abrir essa campanha.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [id]);

  const listaEscolhida = listas.find((l) => l.id === listaId) ?? null;

  useEffect(() => {
    if (!listaEscolhida) {
      setPrevia(null);
      return;
    }
    let vivo = true;
    previaPublico({ data: { filtro: listaEscolhida.filtro ?? {} } })
      .then((r) => vivo && setPrevia(r.total))
      .catch(() => vivo && setPrevia(null));
    return () => {
      vivo = false;
    };
  }, [listaEscolhida]);

  const htmlPrevia = useMemo(
    () =>
      montarHtmlCampanha({ assunto, preheader: preheader || null, corpo }).replace(
        "{{{RESEND_UNSUBSCRIBE_URL}}}",
        "#",
      ),
    [assunto, preheader, corpo],
  );

  const jaSaiu = campanha?.status === "enviada" || campanha?.status === "enviando";

  async function salvar() {
    setSalvando(true);
    try {
      await salvarCampanha({
        data: {
          id,
          nome,
          assunto,
          preheader,
          corpo_html: corpo,
          lista_id: listaId || null,
        },
      });
      toastSucesso("Rascunho salvo.");
      carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function handleEnviar() {
    if (!listaEscolhida) {
      toastErro("Escolha quem recebe antes de enviar.");
      return;
    }
    if (!listaEscolhida.resend_segment_id) {
      toastErro("Sincronize a lista antes. Ela ainda não existe no Resend.");
      return;
    }
    const quantos = previa ?? listaEscolhida.total_sincronizado;
    const quando = agendarPara ? `agendada para ${formatarDataHora(agendarPara)}` : "enviada agora";
    if (
      !window.confirm(
        `A campanha "${nome}" vai ser ${quando} para cerca de ${quantos} pessoa(s). Isso não tem como desfazer. Confirma?`,
      )
    ) {
      return;
    }

    setEnviando(true);
    try {
      await salvarCampanha({
        data: { id, nome, assunto, preheader, corpo_html: corpo, lista_id: listaId },
      });
      const r = await enviarCampanha({
        data: { id, agendada_para: agendarPara ? new Date(agendarPara).toISOString() : "" },
      });
      toastSucesso(
        r.agendada
          ? `Agendada para ${r.destinatarios} pessoa(s).`
          : `Saiu para ${r.destinatarios} pessoa(s).`,
      );
      carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "A campanha não saiu.");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando && !campanha) {
    return <p className="font-sans text-[14px] text-[var(--muted)]">Carregando...</p>;
  }
  if (!campanha) {
    return (
      <div>
        <p className="font-sans text-[14px] text-[var(--muted)]">Campanha não encontrada.</p>
        <Link
          to="/crm/campanhas"
          className="mt-3 inline-block font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
        >
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <Link
        to="/crm/campanhas"
        className="inline-flex w-fit items-center gap-1.5 font-sans text-[13px] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
      >
        <ArrowLeft size={14} />
        Campanhas
      </Link>

      {jaSaiu && (
        <section className={`${cardClass} p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-cabinet text-[20px] text-[var(--ink)]">Como foi</h2>
              <p className="font-sans text-[13px] text-[var(--muted)]">
                {campanha.enviada_em
                  ? `Enviada ${formatarDataHora(campanha.enviada_em)}`
                  : "Ainda saindo"}
                {campanha.metricas_em
                  ? ` · números de ${formatarDataHora(campanha.metricas_em)}`
                  : " · números ainda não buscados"}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await atualizarMetricas({ data: { id } });
                  toastSucesso("Números atualizados.");
                  carregar();
                } catch (err) {
                  toastErro(err instanceof Error ? err.message : "Não consegui buscar.");
                }
              }}
              className={`inline-flex items-center gap-2 ${btnOutline}`}
            >
              <RefreshCcw size={14} />
              Atualizar números
            </button>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-5">
            <Metrica rotulo="Enviados" valor={campanha.destinatarios} />
            <Metrica rotulo="Chegaram" valor={campanha.entregues} base={campanha.destinatarios} />
            <Metrica rotulo="Abriram" valor={campanha.abertos} base={campanha.entregues} />
            <Metrica rotulo="Clicaram" valor={campanha.cliques} base={campanha.entregues} />
            <Metrica rotulo="Saíram da lista" valor={campanha.descadastros} />
          </div>
          {campanha.rejeitados > 0 && (
            <p className="mt-3 font-sans text-[13px] text-[var(--danger)]">
              {campanha.rejeitados} endereço(s) voltaram. Vale conferir se estão escritos certo.
            </p>
          )}
        </section>
      )}

      {campanha.status === "erro" && campanha.erro && (
        <div className="rounded-2xl border border-[var(--danger)] bg-[var(--danger-soft)] p-4">
          <p className="font-sans text-[14px] text-[var(--danger)]">
            A última tentativa falhou: {campanha.erro}
          </p>
        </div>
      )}

      <div className={`${cardClass} grid gap-4 p-5 sm:grid-cols-2`}>
        <label className="block">
          <span className={labelClass}>Nome interno</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            disabled={jaSaiu}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Quem recebe</span>
          <select
            value={listaId}
            onChange={(e) => setListaId(e.target.value)}
            disabled={jaSaiu}
            className={inputClass}
          >
            <option value="">Escolher</option>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nome} ({l.total_sincronizado})
              </option>
            ))}
          </select>
          {listaEscolhida && (
            <span className="mt-1 block font-sans text-[12px] text-[var(--muted)]">
              {previa === null ? "Contando o público..." : `${previa} pessoa(s) se encaixam agora.`}
              {!listaEscolhida.resend_segment_id && " Sincronize a lista antes de enviar."}
            </span>
          )}
        </label>
        <label className="block">
          <span className={labelClass}>Assunto</span>
          <input
            value={assunto}
            onChange={(e) => setAssunto(e.target.value)}
            disabled={jaSaiu}
            maxLength={200}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Primeira linha da caixa de entrada</span>
          <input
            value={preheader}
            onChange={(e) => setPreheader(e.target.value)}
            disabled={jaSaiu}
            maxLength={200}
            placeholder="O trecho que aparece depois do assunto"
            className={inputClass}
          />
        </label>
      </div>

      {jaSaiu ? (
        <div className={`${cardClass} p-5`}>
          <p className={labelClass}>O que foi enviado</p>
          <div
            className="rounded-xl border border-[var(--line)] p-4 font-sans text-[15px] leading-relaxed text-[var(--ink)]"
            // Conteúdo escrito por ela mesma no editor, não vem de fora.
            dangerouslySetInnerHTML={{ __html: corpo }}
          />
        </div>
      ) : (
        <EditorEmail html={corpo} onChange={setCorpo} />
      )}

      {!jaSaiu && (
        <>
          <div className={`${cardClass} flex flex-wrap items-end gap-3 p-5`}>
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className={`inline-flex items-center gap-2 ${btnOutline}`}
            >
              <Save size={14} />
              {salvando ? "Salvando..." : "Salvar rascunho"}
            </button>
            <button
              type="button"
              onClick={() => setVerPrevia((v) => !v)}
              className={`inline-flex items-center gap-2 ${btnOutline}`}
            >
              <Eye size={14} />
              {verPrevia ? "Fechar prévia" : "Ver como vai chegar"}
            </button>

            <div className="flex items-end gap-2">
              <label className="block">
                <span className={labelClass}>Mandar um teste pra</span>
                <input
                  type="email"
                  value={emailTeste}
                  onChange={(e) => setEmailTeste(e.target.value)}
                  placeholder="seu@email.com"
                  className={inputClass}
                />
              </label>
              <button
                type="button"
                disabled={!emailTeste}
                onClick={async () => {
                  try {
                    await salvarCampanha({
                      data: {
                        id,
                        nome,
                        assunto,
                        preheader,
                        corpo_html: corpo,
                        lista_id: listaId || null,
                      },
                    });
                    await enviarTeste({ data: { id, para: emailTeste } });
                    toastSucesso("Teste enviado.");
                  } catch (err) {
                    toastErro(err instanceof Error ? err.message : "O teste não saiu.");
                  }
                }}
                className={btnOutline}
              >
                Enviar teste
              </button>
            </div>
          </div>

          {verPrevia && (
            <iframe
              title="Prévia do e-mail"
              srcDoc={htmlPrevia}
              className="h-[640px] w-full rounded-2xl border border-[var(--line)] bg-white"
            />
          )}

          <div className={`${cardClass} flex flex-wrap items-end justify-between gap-4 p-5`}>
            <label className="block">
              <span className={labelClass}>Sair depois, em vez de agora</span>
              <input
                type="datetime-local"
                value={agendarPara}
                onChange={(e) => setAgendarPara(e.target.value)}
                className={inputClass}
              />
              <span className="mt-1 block font-sans text-[12px] text-[var(--muted)]">
                Em branco, a campanha sai assim que você confirmar.
              </span>
            </label>
            <button
              type="button"
              onClick={handleEnviar}
              disabled={enviando || !listaId}
              className={`inline-flex items-center gap-2 ${btnPrimary}`}
            >
              <Send size={15} />
              {enviando ? "Mandando..." : agendarPara ? "Agendar" : "Enviar agora"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Metrica(props: { rotulo: string; valor: number; base?: number }) {
  const pct = props.base && props.base > 0 ? Math.round((props.valor / props.base) * 100) : null;
  return (
    <div>
      <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
        {props.rotulo}
      </p>
      <p className="mt-1 font-cabinet text-[24px] leading-none text-[var(--ink)]">{props.valor}</p>
      {pct !== null && <p className="font-sans text-[12px] text-[var(--muted)]">{pct}%</p>}
    </div>
  );
}
