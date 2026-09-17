import { createFileRoute, Link } from "@tanstack/react-router";
import { getAnalyticsUsuaria } from "@/lib/founder-analytics.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, BTN_LINK } from "@/lib/botoes";
import {
  formatarDataBRT,
  formatarDataHoraBRT,
  formatarDuracao,
  nomePlano,
} from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista } from "@/components/founder/Graficos";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/analytics/usuarias/$id")({
  component: PerfilUsuaria,
});

const COR_TIPO: Record<string, string> = {
  evento: "bg-[var(--secondary)]",
  erro: "bg-[var(--danger)]",
  ia: "bg-[var(--accent)]",
};

function PerfilUsuaria() {
  const { id } = Route.useParams();
  const { dados, carregando, erro } = useCarregar(
    () => getAnalyticsUsuaria({ data: { id } }),
    [id],
  );

  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar esse perfil.</div>;
  if (carregando || !dados) return <SkeletonBloco className="h-64" />;
  if (!dados.encontrada) {
    return (
      <div className={`${CARD_CLASS} p-6`}>
        <p className="font-sans text-[14px] text-[var(--ink)]">Perfil não encontrado.</p>
        <Link
          to="/founder/analytics/usuarias"
          search={(prev) => prev}
          className={`${BTN_LINK} mt-2 inline-block text-[13px]`}
        >
          ← Voltar pra lista
        </Link>
      </div>
    );
  }

  const d = dados;
  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/founder/analytics/usuarias"
            search={(prev) => prev}
            className={`${BTN_LINK} text-[12px]`}
          >
            ← Usuárias
          </Link>
          <h2 className="font-cabinet mt-1 text-[28px] leading-tight text-[var(--ink)]">
            {d.perfil.nome}
          </h2>
          <p className="font-sans text-[13px] text-[var(--muted)]">
            {d.perfil.negocio ? `${d.perfil.negocio} · ` : ""}
            plano {nomePlano(d.perfil.plano)}
            {d.assinatura ? ` · assinatura ${d.assinatura.status}` : " · sem assinatura"} · conta
            criada em {formatarDataBRT(d.perfil.criadaEm)}
            {d.perfil.onboardingConcluido
              ? ` · onboarding concluído em ${formatarDataBRT(d.perfil.onboardingEm)}`
              : " · onboarding pendente"}
          </p>
        </div>
        <Link to="/usuarios/$id" params={{ id: d.perfil.id }} className={`${BTN_LINK} text-[12px]`}>
          Ficha administrativa →
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard
          label="Último acesso"
          valor={d.ultimoAcesso ? formatarDataHoraBRT(d.ultimoAcesso) : null}
          semDados={!d.ultimoAcesso}
          descricao="qualquer evento"
        />
        <StatCard
          label="Dias ativos"
          valor={d.diasAtivos}
          descricao="com ação real (últimos 400 eventos)"
        />
        <StatCard label="Sessões" valor={d.sessoes30} descricao="últimos 30 dias" />
        <StatCard
          label="Tempo total"
          valor={formatarDuracao(d.tempoTotal30s)}
          descricao="últimos 30 dias"
        />
        <StatCard
          label="Até o 1º valor"
          valor={
            d.tempoAtePrimeiroValorS === null ? null : formatarDuracao(d.tempoAtePrimeiroValorS)
          }
          semDados={d.tempoAtePrimeiroValorS === null}
          descricao="da conta ao 1º feature_completed"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Funcionalidades usadas
          </p>
          <BarraLista
            itens={d.featuresUsadas.map((f) => ({ rotulo: f.feature, valor: f.eventos }))}
            formatar={(v) => `${v} evento(s)`}
            vazio="Nenhum evento com feature ainda."
          />
        </div>
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Linha do tempo ({d.timeline.length} de {d.totalEventos} eventos, sem heartbeat)
          </p>
          {d.timeline.length === 0 ? (
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Nenhum evento registrado ainda.
            </p>
          ) : (
            <div className="max-h-[560px] space-y-2 overflow-y-auto">
              {d.timeline.map((t, i) => (
                <div key={`${t.quando}-${i}`} className="flex items-start gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${COR_TIPO[t.tipo] ?? "bg-[var(--line)]"}`}
                    aria-hidden="true"
                  />
                  <span className="w-[92px] shrink-0 font-sans text-[11px] text-[var(--muted)]">
                    {formatarDataHoraBRT(t.quando)}
                  </span>
                  <div className="min-w-0">
                    <span className="font-mono text-[12px] text-[var(--ink)]">{t.titulo}</span>
                    {t.detalhe && (
                      <span className="ml-2 font-sans text-[12px] text-[var(--muted)]">
                        {t.detalhe}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
