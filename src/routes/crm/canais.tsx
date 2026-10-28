import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Instagram, MessageCircle, XCircle } from "lucide-react";
import { conectarWhatsapp, estadoDosCanais, lerWhatsapp } from "@/lib/canais.functions";
import type { ContaWhatsapp } from "@/lib/conversas-meta.server";
import { toastErro, toastSucesso } from "@/lib/toast";
import { btnOutline, btnPrimary, cardClass, inputClass, labelClass } from "@/lib/crm-ui";

// Canais conectados (CRM-26/27). O WhatsApp da Pólia entra no office SEM sair do ManyChat:
// o app da Meta do office é ligado à mesma conta do WhatsApp e os dois recebem as mensagens.
export const Route = createFileRoute("/crm/canais")({
  head: () => ({ meta: [{ title: "Canais · CRM Pólia" }] }),
  component: Canais,
});

type Estado = Awaited<ReturnType<typeof estadoDosCanais>>;

const NOME_APP_OFFICE = "Silvia Nunoli";

function Selo({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <p
      className={`flex items-center gap-1.5 font-sans text-[13px] ${
        ok ? "text-[var(--secondary-text)]" : "text-[var(--muted)]"
      }`}
    >
      {ok ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
      {children}
    </p>
  );
}

function Comando({ texto }: { texto: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--surface)] px-3 py-2">
      <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] text-[var(--ink)]">
        {texto}
      </code>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard
            .writeText(texto)
            .then(() => toastSucesso("Copiado."))
            .catch(() => toastErro("Não consegui copiar."));
        }}
        aria-label="Copiar"
        className="shrink-0 text-[var(--muted)] hover:text-[var(--ink)]"
      >
        <Copy size={14} />
      </button>
    </div>
  );
}

function Canais() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [wabaId, setWabaId] = useState("");
  const [conta, setConta] = useState<ContaWhatsapp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    estadoDosCanais()
      .then((e) => {
        setEstado(e);
        setWabaId(e.whatsapp.wabaPadrao);
      })
      .catch(() => toastErro("Não consegui ler o estado dos canais."));
  }, []);

  async function ler() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await lerWhatsapp({ data: { wabaId } });
      setConta(r.conta);
      setErro(r.erro);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falhou.");
    } finally {
      setOcupado(false);
    }
  }

  async function conectar() {
    setOcupado(true);
    setErro(null);
    try {
      const r = await conectarWhatsapp({ data: { wabaId } });
      setConta(r.conta);
      setErro(r.erro);
      if (!r.erro) toastSucesso("Office ligado à conta do WhatsApp.");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falhou.");
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return <p className="font-sans text-[14px] text-[var(--muted)]">Carregando...</p>;

  const officeLigado = conta?.apps.some((a) => a.nome === NOME_APP_OFFICE) ?? false;
  const numeroCerto =
    conta && estado.whatsapp.numeroConfigurado
      ? conta.numeros.some((n) => n.id === estado.whatsapp.numeroConfigurado)
      : false;

  return (
    <div className="flex max-w-[860px] flex-col gap-5">
      <section className={`${cardClass} flex flex-col gap-3 p-5`} aria-labelledby="t-ig">
        <h2
          id="t-ig"
          className="flex items-center gap-2 font-cabinet text-[18px] text-[var(--ink)]"
        >
          <Instagram size={17} />
          Instagram
        </h2>
        <Selo ok={Boolean(estado.instagram.username)}>
          {estado.instagram.username
            ? `Conectado como @${estado.instagram.username}`
            : `Sem conexão: ${estado.instagram.erro ?? "falta o token"}`}
        </Selo>
        <Selo ok={estado.segredos.webhook}>
          {estado.segredos.webhook ? "Recebendo pelo webhook do office" : "Webhook sem configurar"}
        </Selo>
      </section>

      <section className={`${cardClass} flex flex-col gap-4 p-5`} aria-labelledby="t-wa">
        <h2
          id="t-wa"
          className="flex items-center gap-2 font-cabinet text-[18px] text-[var(--ink)]"
        >
          <MessageCircle size={17} />
          WhatsApp
        </h2>
        <p className="font-sans text-[13px] leading-relaxed text-[var(--ink-soft)]">
          O número da Pólia continua no ManyChat. Ligar o office aqui faz os dois receberem as
          mensagens. Quem responde é a automação que estiver ligada pra palavra que chegou.
        </p>

        <div className="flex flex-col gap-2">
          <p className={labelClass}>1. Token do usuário do sistema</p>
          <Selo ok={estado.whatsapp.temToken}>
            {estado.whatsapp.temToken
              ? "O Worker tem o WHATSAPP_ACCESS_TOKEN"
              : "Falta o WHATSAPP_ACCESS_TOKEN. Gere o token e rode:"}
          </Selo>
          {!estado.whatsapp.temToken && (
            <Comando texto='cd "C:\Users\silnu\Desktop\Novo Projeto\polia-admin"; npx wrangler secret put WHATSAPP_ACCESS_TOKEN' />
          )}
        </div>

        <div className="flex flex-col gap-2">
          <p className={labelClass}>2. Conta do WhatsApp</p>
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor="waba" className="min-w-[240px] flex-1">
              <span className="sr-only">ID da conta do WhatsApp</span>
              <input
                id="waba"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value.trim())}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={ler}
              disabled={ocupado || !estado.whatsapp.temToken}
              className={btnOutline}
            >
              Ler a conta
            </button>
            <button
              type="button"
              onClick={conectar}
              disabled={ocupado || !estado.whatsapp.temToken}
              className={btnPrimary}
            >
              {ocupado ? "Aguarde..." : "Conectar WhatsApp ao office"}
            </button>
          </div>
          {erro && (
            <p className="rounded-lg bg-[var(--danger-soft)] px-3 py-2 font-sans text-[13px] text-[var(--danger)]">
              A Meta respondeu: {erro}
            </p>
          )}
        </div>

        {conta && (
          <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] p-4">
            <p className="font-sans text-[14px] text-[var(--ink)]">
              Conta <strong>{conta.nome || wabaId}</strong>
            </p>
            <div>
              <p className={labelClass}>Apps que recebem as mensagens</p>
              <ul className="flex flex-col gap-1 font-sans text-[13px] text-[var(--ink)]">
                {conta.apps.length === 0 && <li className="text-[var(--muted)]">Nenhum.</li>}
                {conta.apps.map((a) => (
                  <li key={a.id}>
                    {a.nome || a.id}
                    {a.nome === NOME_APP_OFFICE ? " · o office" : ""}
                  </li>
                ))}
              </ul>
              <div className="mt-2">
                <Selo ok={officeLigado}>
                  {officeLigado
                    ? "O office está ligado à conta."
                    : "O office ainda não está ligado. Use o botão Conectar."}
                </Selo>
              </div>
            </div>
            <div>
              <p className={labelClass}>3. Números da conta</p>
              <ul className="flex flex-col gap-2">
                {conta.numeros.map((n) => (
                  <li key={n.id} className="flex flex-col gap-1 font-sans text-[13px]">
                    <span className="text-[var(--ink)]">
                      {n.numero} · {n.nome}
                      {n.qualidade ? ` · qualidade ${n.qualidade}` : ""}
                    </span>
                    <span className="text-[var(--muted)]">ID do número: {n.id}</span>
                    {estado.whatsapp.numeroConfigurado === n.id ? (
                      <Selo ok>Este é o número que o office usa.</Selo>
                    ) : (
                      <Comando
                        texto={`cd "C:\\Users\\silnu\\Desktop\\Novo Projeto\\polia-admin"; npx wrangler secret put WHATSAPP_PHONE_NUMBER_ID`}
                      />
                    )}
                  </li>
                ))}
              </ul>
              {!numeroCerto && conta.numeros.length > 0 && (
                <p className="mt-2 font-sans text-[12px] text-[var(--muted)]">
                  Rode o comando e cole o ID do número quando ele pedir.
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <p className={labelClass}>4. Webhook no app da Meta</p>
          <p className="font-sans text-[13px] leading-relaxed text-[var(--ink-soft)]">
            No app "Silvia Nunoli", em Casos de uso, WhatsApp, Configuração: URL de callback{" "}
            <code className="font-mono text-[12px]">
              https://office.usepolia.com.br/api/meta/webhook
            </code>
            , a mesma senha de verificação do Instagram, e assinar o campo messages.
          </p>
        </div>
      </section>
    </div>
  );
}
