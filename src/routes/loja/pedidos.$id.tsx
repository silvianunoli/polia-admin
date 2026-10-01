import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import {
  mudarStatusPedido,
  obterPedido,
  salvarObservacoesPedido,
  type Pedido,
  type PedidoItem,
} from "@/lib/loja.functions";
import {
  briefingEmLinhas,
  formatarCentavos,
  linkWhatsAppPedido,
  STATUS_PEDIDO_META,
  TRANSICOES_STATUS,
  type StatusPedido,
} from "@/lib/loja";
import {
  btnOutline,
  btnPrimary,
  cardClass,
  formatarDataHora,
  inputClass,
  labelClass,
} from "@/lib/crm-ui";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";

export const Route = createFileRoute("/loja/pedidos/$id")({
  head: () => ({ meta: [{ title: "Pedido · Loja de serviços · Gestão Pólia" }] }),
  component: LojaPedido,
});

const secao = "rounded-2xl border border-[var(--line)] bg-white p-5";
const tituloSecao = "font-cabinet text-[17px] text-[var(--ink)]";

// Texto do botão pra cada destino, do ponto de vista de quem está trabalhando.
const ACAO_STATUS: Record<StatusPedido, string> = {
  aguardando_pagamento: "Voltar pra aguardando pagamento",
  pago: "Marcar como pago",
  em_andamento: "Comecei a fazer",
  entregue: "Marcar como entregue",
  cancelado: "Cancelar pedido",
  reembolsado: "Marcar como reembolsado",
};

function LojaPedido() {
  const { id } = Route.useParams();
  const { confirmar, dialogo } = useConfirmacao();
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [itens, setItens] = useState<PedidoItem[]>([]);
  const [estado, setEstado] = useState<"carregando" | "pronto" | "nao_existe" | "erro">(
    "carregando",
  );
  const [mensagemErro, setMensagemErro] = useState("");
  const [obs, setObs] = useState("");
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [mudando, setMudando] = useState(false);

  const carregar = useCallback(async () => {
    setEstado("carregando");
    try {
      const r = await obterPedido({ data: { id } });
      if (!r.pedido) {
        setEstado("nao_existe");
        return;
      }
      setPedido(r.pedido);
      setItens(r.itens);
      setObs(r.pedido.observacoes_internas ?? "");
      setEstado("pronto");
    } catch (e) {
      setMensagemErro(e instanceof Error ? e.message : "Não deu pra abrir esse pedido.");
      setEstado("erro");
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mudarStatus(para: StatusPedido) {
    if (!pedido) return;
    if (para === "reembolsado") {
      const ok = await confirmar({
        titulo: "Marcar como reembolsado",
        descricao: (
          <>
            Isto só muda o status aqui. <strong>Não devolve o dinheiro no Stripe.</strong> O
            reembolso precisa ser feito no painel do Stripe antes ou depois. Não tem como voltar
            atrás deste status.
          </>
        ),
        rotuloConfirmar: "Marcar como reembolsado",
        perigo: true,
      });
      if (!ok) return;
    } else if (para === "cancelado") {
      const ok = await confirmar({
        titulo: "Cancelar este pedido",
        descricao:
          "O pedido ainda não foi pago. Cancelado fica cancelado, não tem como voltar atrás.",
        rotuloConfirmar: "Cancelar pedido",
        rotuloCancelar: "Manter como está",
        perigo: true,
      });
      if (!ok) return;
    } else if (para === "pago") {
      const ok = await confirmar({
        titulo: "Marcar como pago na mão",
        descricao:
          "Normalmente o Stripe marca sozinho quando o pagamento cai. Só confirme se o dinheiro entrou por outro caminho (Pix direto, por exemplo).",
        rotuloConfirmar: "Marcar como pago",
      });
      if (!ok) return;
    }

    setMudando(true);
    try {
      await mudarStatusPedido({ data: { id: pedido.id, de: pedido.status, para } });
      toastSucesso(`Status: ${STATUS_PEDIDO_META[para].label}.`);
      await carregar();
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não deu pra mudar o status.");
      await carregar();
    } finally {
      setMudando(false);
    }
  }

  async function salvarObs() {
    if (!pedido) return;
    setSalvandoObs(true);
    try {
      await salvarObservacoesPedido({ data: { id: pedido.id, texto: obs } });
      setPedido({ ...pedido, observacoes_internas: obs.trim() || null });
      toastSucesso("Observação salva.");
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não deu pra salvar.");
    } finally {
      setSalvandoObs(false);
    }
  }

  if (estado === "carregando" && !pedido) {
    return <div className="h-64 max-w-5xl animate-pulse rounded-2xl bg-[var(--surface)]" />;
  }
  if (estado === "nao_existe") {
    return (
      <div className={`${cardClass} max-w-xl p-8`}>
        <p className="text-[14px] text-[var(--ink-soft)]">Esse pedido não existe.</p>
        <Link to="/loja/pedidos" className={`${btnOutline} mt-4 inline-flex no-underline`}>
          Voltar pros pedidos
        </Link>
      </div>
    );
  }
  if (estado === "erro" || !pedido) {
    return (
      <div className={`${cardClass} max-w-xl p-8`}>
        <p className="text-[14px] text-[var(--ink-soft)]">{mensagemErro}</p>
        <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
          Tentar de novo
        </button>
      </div>
    );
  }

  const meta = STATUS_PEDIDO_META[pedido.status];
  const proximos = TRANSICOES_STATUS[pedido.status];
  const whats = linkWhatsAppPedido(
    pedido.whatsapp,
    `Oi, ${pedido.nome.trim().split(/\s+/)[0]}. Aqui é da Pólia, sobre o seu pedido #${pedido.numero}.`,
  );
  const briefing = briefingEmLinhas(pedido.briefing);
  const obsMudou = (pedido.observacoes_internas ?? "") !== obs;

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      {dialogo}
      <Link
        to="/loja/pedidos"
        className="text-[13px] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
      >
        ← Pedidos
      </Link>

      <section className={`${secao} flex flex-wrap items-center justify-between gap-4`}>
        <div>
          <p className="font-cabinet text-[26px] leading-tight text-[var(--ink)]">
            Pedido #{pedido.numero}
          </p>
          <p className="text-[13px] text-[var(--muted)]">
            Feito em {formatarDataHora(pedido.created_at)}
            {pedido.pago_em ? ` · pago em ${formatarDataHora(pedido.pago_em)}` : ""}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ${meta.className}`}>
          {meta.label}
        </span>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className={secao}>
            <h2 className={tituloSecao}>Itens</h2>
            <ul className="mt-3">
              {itens.map((it) => (
                <li
                  key={it.id}
                  className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] py-2 last:border-b-0"
                >
                  <span className="text-[14px] text-[var(--ink)]">
                    {it.quantidade > 1 && <strong>{it.quantidade}x </strong>}
                    {it.produto_id ? (
                      <Link
                        to="/loja/produtos/$id"
                        params={{ id: it.produto_id }}
                        className="text-[var(--ink)] hover:underline"
                      >
                        {it.nome}
                      </Link>
                    ) : (
                      <>
                        {it.nome}{" "}
                        <span className="text-[12px] text-[var(--muted)]">(serviço excluído)</span>
                      </>
                    )}
                  </span>
                  <span className="text-[14px] text-[var(--ink-soft)]">
                    {formatarCentavos(it.preco_centavos * it.quantidade)}
                  </span>
                </li>
              ))}
              {itens.length === 0 && (
                <li className="py-2 text-[14px] text-[var(--muted)]">Pedido sem itens gravados.</li>
              )}
            </ul>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[14px]">
              <dt className="text-[var(--ink-soft)]">Subtotal</dt>
              <dd className="text-right text-[var(--ink-soft)]">
                {formatarCentavos(pedido.subtotal_centavos)}
              </dd>
              {pedido.desconto_centavos > 0 && (
                <>
                  <dt className="text-[var(--ink-soft)]">
                    Desconto{pedido.cupom_codigo ? ` (cupom ${pedido.cupom_codigo})` : ""}
                  </dt>
                  <dd className="text-right text-[var(--ink-soft)]">
                    -{formatarCentavos(pedido.desconto_centavos)}
                  </dd>
                </>
              )}
              <dt className="font-semibold text-[var(--ink)]">Total</dt>
              <dd className="text-right font-semibold text-[var(--ink)]">
                {formatarCentavos(pedido.total_centavos)}
              </dd>
            </dl>
          </section>

          <section className={secao}>
            <h2 className={tituloSecao}>Briefing</h2>
            {briefing.length === 0 ? (
              <p className="mt-2 text-[14px] text-[var(--muted)]">
                A cliente ainda não respondeu o briefing.
              </p>
            ) : (
              <dl className="mt-3 flex flex-col gap-3">
                {briefing.map((b, i) => (
                  <div key={i}>
                    <dt className="text-[12px] font-medium text-[var(--muted)]">{b.rotulo}</dt>
                    <dd className="whitespace-pre-wrap text-[14px] text-[var(--ink)]">
                      {b.valor || "Sem resposta"}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          <section className={secao}>
            <label htmlFor="obs" className={tituloSecao}>
              Observações internas
            </label>
            <p className="mt-1 text-[12px] text-[var(--muted)]">
              Só aparece aqui. A cliente não vê.
            </p>
            <textarea
              id="obs"
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              maxLength={5000}
              rows={5}
              className={`${inputClass} mt-2`}
            />
            <button
              type="button"
              onClick={salvarObs}
              disabled={!obsMudou || salvandoObs}
              className={`${btnPrimary} mt-3`}
            >
              {salvandoObs ? "Salvando..." : "Salvar observação"}
            </button>
          </section>
        </div>

        <aside className="flex flex-col gap-5">
          <section className={secao}>
            <h2 className={tituloSecao}>Cliente</h2>
            <p className="mt-2 text-[15px] font-medium text-[var(--ink)]">{pedido.nome}</p>
            <div className="mt-3 flex flex-col gap-2">
              <a
                href={`mailto:${pedido.email}`}
                className={`${btnOutline} inline-flex items-center gap-2 no-underline`}
              >
                <Mail size={14} aria-hidden="true" />
                {pedido.email}
              </a>
              {whats ? (
                <a
                  href={whats}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnOutline} inline-flex items-center gap-2 no-underline`}
                >
                  <MessageCircle size={14} aria-hidden="true" />
                  Chamar no WhatsApp
                </a>
              ) : (
                <p className="text-[13px] text-[var(--muted)]">
                  {pedido.whatsapp
                    ? `WhatsApp em formato que não dá pra abrir: ${pedido.whatsapp}`
                    : "Sem WhatsApp no pedido."}
                </p>
              )}
            </div>
          </section>

          <section className={secao}>
            <h2 className={tituloSecao}>Mudar status</h2>
            {proximos.length === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--muted)]">
                {meta.label} é final. Não muda mais.
              </p>
            ) : (
              <div className="mt-3 flex flex-col gap-2">
                {proximos.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => mudarStatus(s)}
                    disabled={mudando}
                    className={
                      s === "cancelado" || s === "reembolsado"
                        ? "rounded-xl border border-[var(--danger)] bg-white px-4 py-2 text-left text-[13px] text-[var(--danger)] hover:bg-[var(--danger-soft)] disabled:opacity-40"
                        : `${btnOutline} text-left`
                    }
                  >
                    {ACAO_STATUS[s]}
                  </button>
                ))}
              </div>
            )}
          </section>

          {(pedido.stripe_session_id || pedido.stripe_payment_intent) && (
            <section className={secao}>
              <h2 className={tituloSecao}>Stripe</h2>
              <dl className="mt-2 flex flex-col gap-2 text-[12px]">
                {pedido.stripe_payment_intent && (
                  <div>
                    <dt className={labelClass}>Pagamento</dt>
                    <dd className="break-all text-[var(--ink-soft)]">
                      {pedido.stripe_payment_intent}
                    </dd>
                  </div>
                )}
                {pedido.stripe_session_id && (
                  <div>
                    <dt className={labelClass}>Sessão do checkout</dt>
                    <dd className="break-all text-[var(--ink-soft)]">{pedido.stripe_session_id}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
