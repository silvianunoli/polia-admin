import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getNegocioConversao } from "@/lib/founder-negocio.functions";
import { ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { formatarPct } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { Funil } from "@/components/founder/Graficos";
import { Secao } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/negocio/conversao")({
  component: Conversao,
});

function Conversao() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getNegocioConversao({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a conversão.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Da conta criada até a assinatura ativa. "Coorte do período" = contas criadas dentro do
        período que hoje têm assinatura ativa. Lista de espera entra como topo do funil
        pré-lançamento.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Conversão geral"
          valor={d ? formatarPct(d.taxaGeral, 1) : null}
          semDados={d?.taxaGeral === null}
          descricao={d ? `${d.pagantes} de ${d.totalContas} contas` : undefined}
          carregando={carregando}
        />
        <StatCard
          label="Coorte do período"
          valor={d ? formatarPct(d.taxaCoorte, 1) : null}
          semDados={d?.taxaCoorte === null}
          descricao={d ? `${d.contasConverteram} de ${d.contasNoPeriodo} contas novas` : undefined}
          carregando={carregando}
        />
        <StatCard
          label="Teste → paga"
          valor={d?.trialParaPaga}
          descricao={d ? `de ${d.trialsNoPeriodo} iniciadas no período` : undefined}
          carregando={carregando}
        />
        <StatCard
          label="Dias até assinar"
          valor={d?.diasAteAssinarMediana === null ? null : d?.diasAteAssinarMediana?.toFixed(1)}
          semDados={d?.diasAteAssinarMediana === null}
          descricao="mediana, da conta à assinatura"
          carregando={carregando}
        />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Lista de espera"
          valor={d?.leadsListaEspera}
          variacaoPct={d?.leadsVariacao}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Contas criadas"
          valor={d?.contasNoPeriodo}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
          href="/founder/analytics/usuarias"
        />
        <StatCard
          label="Já tiveram assinatura"
          valor={d?.jaTiveramAssinatura}
          descricao="em qualquer momento"
          carregando={carregando}
        />
        <StatCard
          label="Assinantes ativas"
          valor={d?.pagantes}
          carregando={carregando}
          href="/founder/negocio/assinaturas"
        />
      </div>

      <Secao titulo="Funil de conversão (base total)" carregando={carregando} altura="h-48">
        {d ? <Funil passos={d.funil} /> : null}
      </Secao>
    </>
  );
}
