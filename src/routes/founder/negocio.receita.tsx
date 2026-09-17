import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getNegocioReceita } from "@/lib/founder-negocio.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarDataHoraBRT, formatarReais } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista, BarrasDiarias } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/negocio/receita")({
  component: Receita,
});

function Receita() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getNegocioReceita({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a receita.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Receita realizada = faturas pagas no Stripe dentro do período. MRR = soma dos preços das
        assinaturas ativas agora (anual dividido por 12). A evolução do MRR vem do snapshot diário
        do monitor.
      </p>
      {d && !d.stripeOk ? (
        <div className={`${ALERTA_ERRO_CLASS} mb-6`}>
          O Stripe não respondeu à consulta de faturas. A chave de API do admin pode estar vencida;
          MRR e assinaturas abaixo vêm do banco e continuam válidos.
        </div>
      ) : null}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard
          label="Receita"
          valor={d ? formatarReais(d.receitaCentavos) : null}
          semDados={d ? !d.stripeOk : false}
          variacaoPct={d?.stripeOk ? d.receitaVariacao : undefined}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Faturas pagas"
          valor={d?.faturasPagas}
          semDados={d ? !d.stripeOk : false}
          carregando={carregando}
        />
        <StatCard
          label="Ticket médio"
          valor={d ? formatarReais(d.ticketMedioCentavos) : null}
          semDados={d?.ticketMedioCentavos === null}
          carregando={carregando}
        />
        <StatCard
          label="MRR"
          valor={d ? formatarReais(d.mrrCentavos) : null}
          descricao="assinaturas ativas agora"
          carregando={carregando}
        />
        <StatCard
          label="ARR"
          valor={d ? formatarReais(d.arrCentavos) : null}
          descricao="MRR × 12"
          carregando={carregando}
        />
        <StatCard
          label="Assinantes ativas"
          valor={d?.assinantesAtivas}
          carregando={carregando}
          href="/founder/negocio/assinaturas"
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Secao
          titulo="Receita por dia (faturas pagas)"
          carregando={carregando}
          className="lg:col-span-2"
        >
          {d && d.serieReceita.length ? (
            <BarrasDiarias pontos={d.serieReceita} formatar={formatarReais} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Nenhuma fatura paga no período.
            </p>
          )}
        </Secao>
        <Secao titulo="MRR por plano" carregando={carregando}>
          <BarraLista
            itens={(d?.porPlano ?? []).map((p) => ({
              rotulo: `${p.nome} (${p.intervalo === "year" ? "anual" : "mensal"})`,
              valor: p.quantidade * p.mensal,
              detalhe: `${p.quantidade} assinatura(s)`,
            }))}
            formatar={formatarReais}
            vazio="Nenhuma assinatura ativa."
          />
        </Secao>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Secao titulo="Evolução do MRR (snapshot diário)" carregando={carregando}>
          {d && d.serieMrr.length ? (
            <BarrasDiarias pontos={d.serieMrr} formatar={formatarReais} />
          ) : (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Ainda sem snapshot no período.
            </p>
          )}
        </Secao>
        <Secao titulo="Faturas recentes" carregando={carregando} semPadding altura="h-32">
          {!d || d.faturasRecentes.length === 0 ? (
            <Vazio>Nenhuma fatura paga no período.</Vazio>
          ) : (
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Quando</th>
                  <th className={TH_CLASS}>Número</th>
                  <th className={TH_CLASS}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {d.faturasRecentes.map((f, i) => (
                  <tr
                    key={`${f.numero}-${i}`}
                    className="border-b border-[var(--line)] last:border-0"
                  >
                    <td className="whitespace-nowrap px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                      {formatarDataHoraBRT(f.quando)}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                      {f.numero ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">
                      {formatarReais(f.valor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>
      </div>
    </>
  );
}
