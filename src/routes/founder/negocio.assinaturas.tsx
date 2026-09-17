import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { getNegocioAssinaturas } from "@/lib/founder-negocio.functions";
import { ALERTA_ERRO_CLASS, BTN_LINK, TH_CLASS } from "@/lib/botoes";
import { formatarDataBRT } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista, BarrasDiarias } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/negocio/assinaturas")({
  component: Assinaturas,
});

const STATUS_LABEL: Record<string, string> = {
  active: "ativa",
  trialing: "em teste",
  past_due: "atrasada",
  unpaid: "não paga",
  canceled: "cancelada",
  incomplete: "incompleta",
  incomplete_expired: "expirou sem pagar",
  paused: "pausada",
};

function Assinaturas() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getNegocioAssinaturas({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar as assinaturas.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Espelho da tabela `assinaturas` (alimentada pelo webhook do Stripe) mais os eventos de
        assinatura registrados pelo próprio webhook no período.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard
          label="Ativas"
          valor={d?.ativas}
          descricao="active + trialing + past_due"
          carregando={carregando}
        />
        <StatCard
          label="Novas"
          valor={d?.novas}
          variacaoPct={d?.novasVariacao}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard label="Em teste" valor={d?.trialing} carregando={carregando} />
        <StatCard
          label="Com pagamento pendente"
          valor={d?.pendentes}
          descricao="past_due / unpaid"
          carregando={carregando}
          invertido
        />
        <StatCard
          label="Cancelam ao fim"
          valor={d?.cancelamAoFim}
          descricao="cancel_at_period_end"
          carregando={carregando}
          invertido
          href="/founder/negocio/churn"
        />
        <StatCard
          label="Pagamentos falhos"
          valor={d?.eventos.pagamentosFalhos}
          descricao="evento do webhook"
          carregando={carregando}
          invertido
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Secao
          titulo="Assinantes por dia (snapshot)"
          carregando={carregando}
          className="lg:col-span-2"
        >
          {d && d.serie.length ? (
            <BarrasDiarias pontos={d.serie} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Ainda sem snapshot no período.
            </p>
          )}
        </Secao>
        <Secao titulo="Por status (todas)" carregando={carregando}>
          <BarraLista
            itens={(d?.porStatus ?? []).map((s) => ({
              rotulo: STATUS_LABEL[s.rotulo] ?? s.rotulo,
              valor: s.valor,
            }))}
            vazio="Nenhuma assinatura."
          />
          {d ? (
            <p className="mt-4 font-sans text-[12px] text-[var(--muted)]">
              No período: {d.eventos.iniciadas} iniciada(s), {d.eventos.canceladas} cancelada(s)
              pelo webhook.
            </p>
          ) : null}
        </Secao>
      </div>

      <Secao
        titulo="Assinaturas (últimas 100 atualizadas)"
        carregando={carregando}
        semPadding
        altura="h-48"
      >
        {!d || d.lista.length === 0 ? (
          <Vazio>Nenhuma assinatura.</Vazio>
        ) : (
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Usuária</th>
                  <th className={TH_CLASS}>Plano</th>
                  <th className={TH_CLASS}>Status</th>
                  <th className={TH_CLASS}>Desde</th>
                  <th className={TH_CLASS}>Fim do período</th>
                </tr>
              </thead>
              <tbody>
                {d.lista.map((a) => (
                  <tr key={a.userId} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-5 py-2.5 font-sans text-[13px]">
                      <Link
                        to="/founder/analytics/usuarias/$id"
                        params={{ id: a.userId }}
                        search={(prev) => prev}
                        className={`${BTN_LINK} text-[13px]`}
                      >
                        {a.nome}
                      </Link>
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">
                      {a.plano}{" "}
                      <span className="text-[var(--muted)]">
                        ·{" "}
                        {a.intervalo === "year"
                          ? "anual"
                          : a.intervalo === "month"
                            ? "mensal"
                            : a.intervalo}
                      </span>
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                      {STATUS_LABEL[a.status] ?? a.status}
                      {a.cancelaNoFim ? (
                        <span className="text-[var(--danger)]"> · cancela ao fim</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                      {formatarDataBRT(a.desde)}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                      {formatarDataBRT(a.fimPeriodo)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  );
}
