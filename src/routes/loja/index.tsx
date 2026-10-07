import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Lock, Store } from "lucide-react";
import { resumoLoja } from "@/lib/loja.functions";
import { formatarCentavos, STATUS_PEDIDO_META } from "@/lib/loja";
import { btnOutline, cardClass, formatarDataHora } from "@/lib/crm-ui";

export const Route = createFileRoute("/loja/")({
  head: () => ({ meta: [{ title: "Resumo · Loja de serviços · Gestão Pólia" }] }),
  component: LojaResumo,
});

type Resumo = Awaited<ReturnType<typeof resumoLoja>>;

function LojaResumo() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setErro(null);
    setResumo(null);
    try {
      setResumo(await resumoLoja());
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu pra carregar o resumo.");
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  if (erro) {
    return (
      <div className={`${cardClass} max-w-xl p-8`}>
        <p className="text-[14px] text-[var(--ink-soft)]">{erro}</p>
        <button type="button" onClick={carregar} className={`${btnOutline} mt-4`}>
          Tentar de novo
        </button>
      </div>
    );
  }

  if (!resumo) {
    return (
      <div className="grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-[var(--surface)]" />
        ))}
      </div>
    );
  }

  const aberta = resumo.config?.loja_aberta ?? false;

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <section
        className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5 ${
          aberta
            ? "border-[var(--secondary)] bg-[var(--secondary-light)]"
            : "border-[var(--line)] bg-white"
        }`}
      >
        <div className="flex items-center gap-3">
          {aberta ? (
            <Store size={22} className="text-[var(--ink)]" aria-hidden="true" />
          ) : (
            <Lock size={22} className="text-[var(--muted)]" aria-hidden="true" />
          )}
          <div>
            <p className="font-cabinet text-[20px] text-[var(--ink)]">
              {aberta ? "A loja está aberta" : "A loja está fechada"}
            </p>
            <p className="text-[13px] text-[var(--ink-soft)]">
              {aberta
                ? "Quem entra em lab.usepolia.com.br/loja consegue comprar e pagar."
                : "A vitrine não aceita pedido nenhum até a chave ser virada."}
            </p>
          </div>
        </div>
        <Link to="/loja/config" className={`${btnOutline} no-underline`}>
          {aberta ? "Fechar a loja" : "Abrir a loja"}
        </Link>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          rotulo="Pedidos pagos"
          valor={String(resumo.pedidosPagos)}
          detalhe={`${formatarCentavos(resumo.recebidoCentavos)} recebidos`}
        />
        <Numero
          rotulo="A entregar"
          valor={String(resumo.aEntregar)}
          detalhe="pagos ou em andamento"
          link={{ to: "/loja/pedidos", texto: "Ver pedidos" }}
        />
        <Numero
          rotulo="Aguardando pagamento"
          valor={String(resumo.aguardandoPagamento)}
          detalhe="checkout aberto, sem pagamento"
        />
        <Numero
          rotulo="Serviços na vitrine"
          valor={`${resumo.produtosPublicados} de ${resumo.produtosTotal}`}
          detalhe="publicados"
          link={{ to: "/loja/produtos", texto: "Ver serviços" }}
        />
      </div>

      <section className={cardClass}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
          <h2 className="font-cabinet text-[17px] text-[var(--ink)]">Últimos pedidos</h2>
          <Link
            to="/loja/pedidos"
            className="text-[13px] font-medium text-[var(--secondary-text)] no-underline hover:underline"
          >
            Todos os pedidos
          </Link>
        </div>
        {resumo.recentes.length === 0 ? (
          <p className="px-5 py-6 text-[14px] text-[var(--muted)]">Nenhum pedido ainda.</p>
        ) : (
          <ul>
            {resumo.recentes.map((p) => (
              <li key={p.id} className="border-b border-[var(--line)] last:border-b-0">
                <Link
                  to="/loja/pedidos/$id"
                  params={{ id: p.id }}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 no-underline hover:bg-[var(--bg)]"
                >
                  <span className="text-[14px] text-[var(--ink)]">
                    <strong>#{p.numero}</strong> {p.nome}
                  </span>
                  <span className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${STATUS_PEDIDO_META[p.status].className}`}
                    >
                      {STATUS_PEDIDO_META[p.status].label}
                    </span>
                    <span className="text-[13px] text-[var(--ink-soft)]">
                      {formatarCentavos(p.total_centavos)}
                    </span>
                    <span className="text-[13px] text-[var(--muted)]">
                      {formatarDataHora(p.created_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Numero({
  rotulo,
  valor,
  detalhe,
  link,
}: {
  rotulo: string;
  valor: string;
  detalhe: string;
  link?: { to: "/loja/pedidos" | "/loja/produtos"; texto: string };
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-[var(--line)] bg-white p-5">
      <p className="font-accent text-[11px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
        {rotulo}
      </p>
      <p className="font-cabinet text-[28px] leading-tight text-[var(--ink)]">{valor}</p>
      <p className="text-[13px] text-[var(--ink-soft)]">{detalhe}</p>
      {link && (
        <Link
          to={link.to}
          className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--secondary-text)] no-underline hover:underline"
        >
          {link.texto}
          <ArrowRight size={13} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
