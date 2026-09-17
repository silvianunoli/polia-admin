import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getFounderOverview, type FounderOverview } from "@/lib/founder-overview.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { StatCard } from "@/components/founder/StatCard";

export const Route = createFileRoute("/founder/numeros")({
  component: NumerosPrincipais,
});

function formatarBRL(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const DEFINICOES: { label: string; texto: string }[] = [
  {
    label: "Usuárias",
    texto:
      "contas em profiles criadas até o fim do período; a comparação usa o total no fim do período anterior.",
  },
  { label: "Novas contas", texto: "contas criadas dentro do período." },
  {
    label: "Usuárias ativas",
    texto:
      "contas com pelo menos uma ação real registrada no período (criar ou editar produto ou meta, concluir onboarding, usar uma funcionalidade até o fim). Abrir tela e heartbeat não contam.",
  },
  {
    label: "Assinantes",
    texto:
      "assinaturas em active, trialing ou past_due agora; comparação com o snapshot diário mais próximo do fim do período anterior.",
  },
  {
    label: "MRR",
    texto:
      "soma do preço mensal (Stripe) das assinaturas ativas; plano anual entra dividido por 12.",
  },
  {
    label: "Churn",
    texto:
      "canceladas no período dividido por (ativas agora + canceladas no período). Sem assinatura ainda, fica em sem dados.",
  },
  {
    label: "Erros",
    texto:
      "linhas em erros_app no período. Vira taxa (erros por requisição) quando a API passar a ser medida no bloco 2.",
  },
];

function NumerosPrincipais() {
  const search = useSearch({ from: "/founder" });
  const [dados, setDados] = useState<FounderOverview | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    setCarregando(true);
    (async () => {
      try {
        setDados(await getFounderOverview({ data: search }));
        setErro(false);
      } catch {
        setErro(true);
      } finally {
        setCarregando(false);
      }
    })();
  }, [search]);

  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os números.</div>;

  const n = dados?.numeros;
  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Período: {dados?.periodo.rotulo ?? "…"}. Cada card compara com o período anterior de mesma
        duração.
      </p>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Usuárias"
          valor={n?.usuariasTotal.atual}
          variacaoPct={n?.usuariasTotal.variacaoPct}
          descricao="total cadastradas"
          carregando={carregando}
        />
        <StatCard
          label="Novas contas"
          valor={n?.novasContas.atual}
          variacaoPct={n?.novasContas.variacaoPct}
          descricao="no período"
          carregando={carregando}
        />
        <StatCard
          label="Usuárias ativas"
          valor={n?.usuariasAtivas.atual}
          variacaoPct={n?.usuariasAtivas.variacaoPct}
          descricao="com ação real no período"
          carregando={carregando}
        />
        <StatCard
          label="Assinantes"
          valor={n?.assinantes.atual}
          variacaoPct={n?.assinantes.variacaoPct}
          descricao="ativas agora"
          carregando={carregando}
        />
        <StatCard
          label="MRR"
          valor={n ? formatarBRL(n.mrrCentavos.atual ?? 0) : null}
          variacaoPct={n?.mrrCentavos.variacaoPct}
          descricao="via Stripe"
          carregando={carregando}
        />
        <StatCard
          label="Churn"
          valor={n?.churnPct.atual === null ? null : `${n?.churnPct.atual?.toFixed(1)}%`}
          semDados={n?.churnPct.atual === null}
          descricao="no período"
          carregando={carregando}
        />
        <StatCard
          label="Erros"
          valor={n?.erros.atual}
          variacaoPct={n?.erros.variacaoPct}
          descricao="registrados no período"
          carregando={carregando}
          invertido
        />
      </div>

      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Como cada número é calculado
      </p>
      <div className={CARD_CLASS}>
        {DEFINICOES.map((d) => (
          <div key={d.label} className="border-b border-[var(--line)] px-5 py-3 last:border-0">
            <p className="font-sans text-[13px] font-medium text-[var(--ink)]">{d.label}</p>
            <p className="font-sans text-[12px] text-[var(--muted)]">{d.texto}</p>
          </div>
        ))}
      </div>
    </>
  );
}
