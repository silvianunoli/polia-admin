import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Instagram, MessageCircle, MessageSquareReply, Plus, Workflow } from "lucide-react";
import {
  alternarAutomacao,
  criarDoModelo,
  listarAutomacoes,
  salvarAutomacao,
  type AutomacaoItem,
} from "@/lib/automacoes.functions";
import { resumoGatilho } from "@/lib/automacoes";
import { toastErro, toastSucesso } from "@/lib/toast";
import { btnOutline, btnPrimary, cardClass } from "@/lib/crm-ui";

// Lista de automações (CRM-27): o "Minhas automações" do ManyChat, dentro do CRM.
export const Route = createFileRoute("/crm/automacoes/")({
  head: () => ({ meta: [{ title: "Automações · CRM Pólia" }] }),
  component: ListaAutomacoes,
});

const ROTULO_CANAL: Record<string, string> = {
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  ambos: "Instagram e WhatsApp",
};

function IconesCanal({ canal }: { canal: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[var(--muted)]"
      aria-label={ROTULO_CANAL[canal]}
    >
      {canal !== "whatsapp" && <Instagram size={14} aria-hidden />}
      {canal !== "instagram" && <MessageCircle size={14} aria-hidden />}
    </span>
  );
}

function ListaAutomacoes() {
  const navigate = useNavigate();
  const [automacoes, setAutomacoes] = useState<AutomacaoItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);

  async function carregar() {
    try {
      const r = await listarAutomacoes();
      setAutomacoes(r.automacoes);
    } catch {
      toastErro("Não consegui carregar as automações.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criarEmBranco() {
    setCriando(true);
    try {
      const r = await salvarAutomacao({
        data: {
          automacao: {
            nome: "Nova automação",
            canal: "instagram",
            ativa: false,
            gatilho: { tipo: "palavra_chave", palavras: ["oi"], modo: "contem" },
            passos: [
              {
                id: "p1",
                tipo: "mensagem",
                texto: "Oi, {primeiro_nome}. Como a Pólia pode ajudar?",
                botoes: [],
                salvar_em: null,
              },
            ],
          },
        },
      });
      navigate({ to: "/crm/automacoes/$id", params: { id: r.id } });
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui criar.");
      setCriando(false);
    }
  }

  async function criarModelo(modelo: "comentario" | "fala_instagram" | "fala_whatsapp") {
    setCriando(true);
    try {
      const r = await criarDoModelo({ data: { modelo } });
      toastSucesso("Modelo criado desligado. Revise e ligue quando quiser.");
      navigate({ to: "/crm/automacoes/$id", params: { id: r.id } });
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui criar do modelo.");
      setCriando(false);
    }
  }

  async function alternar(a: AutomacaoItem) {
    try {
      await alternarAutomacao({ data: { id: a.id, ativa: !a.ativa } });
      await carregar();
    } catch {
      toastErro("Não consegui ligar ou desligar.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-4 p-5`}>
        <p className="max-w-[620px] font-sans text-[14px] leading-relaxed text-[var(--ink-soft)]">
          Cada automação tem um gatilho e uma lista de passos. Quando chega comentário ou mensagem,
          a primeira automação ligada que combina começa a conversa. Quem está no meio de uma
          automação continua nela até o fim. Conversa pausada na caixa de entrada não recebe nada
          automático.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => criarModelo("comentario")}
            disabled={criando}
            className={`inline-flex items-center gap-1.5 ${btnPrimary}`}
          >
            <MessageSquareReply size={15} />
            Comentário → Direct
          </button>
          <button
            type="button"
            onClick={() => criarModelo("fala_instagram")}
            disabled={criando}
            className={btnOutline}
          >
            Modelo FALA: comentário
          </button>
          <button
            type="button"
            onClick={() => criarModelo("fala_whatsapp")}
            disabled={criando}
            className={btnOutline}
          >
            Modelo FALA: briefing
          </button>
          <button
            type="button"
            onClick={criarEmBranco}
            disabled={criando}
            className={`inline-flex items-center gap-1.5 ${btnOutline}`}
          >
            <Plus size={15} />
            Automação em lista
          </button>
        </div>
      </div>

      <section className={cardClass} aria-label="Automações">
        {carregando && (
          <p className="px-5 py-6 font-sans text-[13px] text-[var(--muted)]">Carregando...</p>
        )}
        {!carregando && automacoes.length === 0 && (
          <div className="flex flex-col items-start gap-2 px-5 py-8">
            <Workflow size={20} className="text-[var(--muted)]" />
            <p className="font-sans text-[14px] text-[var(--ink)]">Nenhuma automação ainda.</p>
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Comece pelos modelos do FALA: eles recriam o que roda hoje no ManyChat.
            </p>
          </div>
        )}
        <ul>
          {automacoes.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <IconesCanal canal={a.canal} />
                  <Link
                    to="/crm/automacoes/$id"
                    params={{ id: a.id }}
                    className="truncate font-sans text-[15px] font-medium text-[var(--ink)] no-underline hover:underline"
                  >
                    {a.nome}
                  </Link>
                </div>
                <p className="mt-0.5 font-sans text-[13px] text-[var(--muted)]">
                  {resumoGatilho(a.gatilho)} · {a.passos.length}{" "}
                  {a.passos.length === 1 ? "passo" : "passos"}
                </p>
              </div>
              <div className="flex items-center gap-5">
                <p className="font-sans text-[12px] text-[var(--muted)]">
                  {a.execucoes} {a.execucoes === 1 ? "vez" : "vezes"} · {a.cliques}{" "}
                  {a.cliques === 1 ? "clique" : "cliques"}
                  {a.execucoes > 0 ? ` (${Math.round((a.cliques / a.execucoes) * 100)}%)` : ""}
                  {a.ativas_agora > 0 ? ` · ${a.ativas_agora} em andamento` : ""}
                </p>
                <label className="inline-flex cursor-pointer items-center gap-2 font-sans text-[13px] text-[var(--ink-soft)]">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={a.ativa}
                    onChange={() => alternar(a)}
                    className="h-4 w-4 accent-[var(--secondary)]"
                  />
                  {a.ativa ? "Ligada" : "Desligada"}
                </label>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
