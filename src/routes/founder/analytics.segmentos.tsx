import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { getAnalyticsSegmentos } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS } from "@/lib/botoes";
import { TabelaUsuarias, type UsuariaLinha } from "@/components/founder/TabelaUsuarias";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/segmentos")({
  component: Segmentos,
});

type Grupo = { chave: string; rotulo: string; definicao: string; usuarias: UsuariaLinha[] };

function Segmentos() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsSegmentos({ data: search }),
    [search],
  );
  const [aberto, setAberto] = useState<string | null>(null);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os segmentos.</div>;
  const s = dados;

  const matriz: Grupo[] = s
    ? [
        {
          chave: "pm",
          rotulo: "Pagantes que usam muito",
          definicao: "assinatura ativa · 4+ dias ativos em 30 dias",
          usuarias: s.matriz.pagantesMuito,
        },
        {
          chave: "pp",
          rotulo: "Pagantes que usam pouco",
          definicao: "assinatura ativa · 1 a 3 dias ativos",
          usuarias: s.matriz.pagantesPouco,
        },
        {
          chave: "ps",
          rotulo: "Pagantes sem uso recente",
          definicao: "assinatura ativa · 0 dias ativos",
          usuarias: s.matriz.pagantesSemUso,
        },
        {
          chave: "ge",
          rotulo: "Gratuitas engajadas",
          definicao: "sem assinatura · 4+ dias ativos",
          usuarias: s.matriz.gratuitasEngajadas,
        },
        {
          chave: "gp",
          rotulo: "Gratuitas pouco engajadas",
          definicao: "sem assinatura · 1 a 3 dias ativos",
          usuarias: s.matriz.gratuitasPouco,
        },
        {
          chave: "gs",
          rotulo: "Gratuitas sem uso",
          definicao: "sem assinatura · 0 dias ativos",
          usuarias: s.matriz.gratuitasSemUso,
        },
      ]
    : [];
  const grupos: Grupo[] = s ? [...s.segmentos, ...matriz] : [];
  const grupoAberto = grupos.find((g) => g.chave === aberto) ?? null;

  const Cartao = ({ g }: { g: Grupo }) => (
    <button
      type="button"
      onClick={() => setAberto(aberto === g.chave ? null : g.chave)}
      className={`block w-full cursor-pointer rounded-2xl border p-5 text-left transition-colors ${
        aberto === g.chave
          ? "border-[var(--secondary)] bg-[var(--secondary-light)]/30"
          : "border-[var(--line)] bg-white hover:border-[var(--secondary)]"
      }`}
    >
      <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
        {g.rotulo}
      </p>
      <p className="font-cabinet text-[26px] leading-none text-[var(--ink)]">{g.usuarias.length}</p>
      <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">{g.definicao}</p>
    </button>
  );

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        {s ? `${s.totalUsuarias} usuária(s), ${s.totalPagantes} com assinatura ativa. ` : ""}
        Clique num grupo pra ver a lista. "Ativas" segue o período do filtro; os outros grupos usam
        janelas fixas (14, 30 e 90 dias) pra não mudarem de definição conforme o filtro.
      </p>
      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Segmentos
      </p>
      {carregando || !s ? (
        <SkeletonBloco className="mb-6 h-32" />
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {s.segmentos.map((g) => (
            <Cartao key={g.chave} g={g} />
          ))}
        </div>
      )}
      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Uso × assinatura (30 dias)
      </p>
      {carregando || !s ? (
        <SkeletonBloco className="mb-6 h-32" />
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
          {matriz.map((g) => (
            <Cartao key={g.chave} g={g} />
          ))}
        </div>
      )}
      {grupoAberto && (
        <div className={CARD_CLASS}>
          <p className="border-b border-[var(--line)] px-5 py-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            {grupoAberto.rotulo} · {grupoAberto.usuarias.length}
          </p>
          <TabelaUsuarias usuarias={grupoAberto.usuarias} />
        </div>
      )}
    </>
  );
}
