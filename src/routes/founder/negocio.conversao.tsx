import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getNegocioConversao, getTesteProResumo } from "@/lib/founder-negocio.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarPct, formatarReais } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { Funil } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
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
  // Teste do Pro: base inteira, não segue o filtro de período.
  const teste = useCarregar(() => getTesteProResumo(), []);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar a conversão.</div>;
  const d = dados;
  const t = teste.dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Da conta criada até a assinatura ativa. "Coorte do período" = contas criadas dentro do
        período que hoje têm assinatura ativa. O funil olha a base inteira, desde o primeiro
        cadastro. Pagamento que ficou pela metade no checkout não conta como assinatura. Conta no
        teste de 7 dias do Pro não tem assinatura, então conta aqui como Grátis.
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
          label="Trial do Stripe → paga"
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
      {/* GRW-66 (20/10/2026): teste de 7 dias do Pro, sem cartão. Fonte:
          testes_pro (encerrado_em + resultado). */}
      <p className="mb-2 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Teste do Pro · 7 dias, desde 20/10/2026
      </p>
      {teste.erro ? (
        <div className={`mb-6 ${ALERTA_ERRO_CLASS}`}>Não consegui carregar o teste do Pro.</div>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Em teste agora"
              valor={t?.emTeste}
              descricao={
                t && t.aguardandoFechamento > 0
                  ? `+ ${t.aguardandoFechamento} vencido(s) esperando o fechamento`
                  : "teste aberto"
              }
              carregando={teste.carregando}
            />
            <StatCard
              label="Encerrados"
              valor={t?.encerrados}
              descricao={t ? `${t.voltaramGratis} voltaram pro Grátis` : undefined}
              carregando={teste.carregando}
            />
            <StatCard
              label="Assinaram"
              valor={t?.assinaram}
              descricao="Premium ou Pro, no teste ou no fim dele"
              carregando={teste.carregando}
            />
            <StatCard
              label="Conversão do teste"
              valor={t ? formatarPct(t.taxaConversao, 1) : null}
              semDados={t?.taxaConversao === null}
              descricao={t ? `${t.assinaram} de ${t.encerrados} encerrados` : undefined}
              carregando={teste.carregando}
            />
          </div>
          <p className="mb-6 font-sans text-[13px] text-[var(--muted)]">
            {t && !t.leituraOk
              ? "A tabela do teste não respondeu (a migração pode ainda não estar no banco). Os números ficam zerados até ela existir."
              : "Conversão = assinaram dividido pelos testes encerrados. Teste aberto ainda não entra na conta. Base inteira, não segue o filtro de período."}
          </p>
        </>
      )}

      <Secao titulo="Funil de conversão (base total)" carregando={carregando} altura="h-48">
        {d ? <Funil passos={d.funil} /> : null}
      </Secao>

      {/* FND-04: qual landing (ou parte do site) vira cadastro e qual vira
          dinheiro. Compra aqui = checkout público; a de dentro do app não tem
          landing. Receita = valor do plano no ato, não o recorrente. */}
      <Secao titulo="Por landing" carregando={carregando} semPadding altura="h-32" className="mt-6">
        {!d || d.porLanding.length === 0 ? (
          <Vazio>Nenhum cadastro nem compra com origem no período.</Vazio>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Origem</th>
                  <th className={TH_CLASS}>Cadastros</th>
                  <th className={TH_CLASS}>Compras</th>
                  <th className={TH_CLASS}>Receita</th>
                </tr>
              </thead>
              <tbody>
                {d.porLanding.map((l) => (
                  <tr key={l.origem} className="border-b border-[var(--line)] last:border-0">
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink)]">
                      {l.origem}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                      {l.cadastros}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                      {l.compras}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">
                      {formatarReais(l.receitaCentavos)}
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
