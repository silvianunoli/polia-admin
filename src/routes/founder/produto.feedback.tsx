import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { getProdutoFeedback } from "@/lib/founder-produto.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, BTN_LINK } from "@/lib/botoes";
import { formatarDataHoraBRT, formatarDuracao } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista } from "@/components/founder/Graficos";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/produto/feedback")({
  component: Feedback,
});

const SCORE_LABEL: Record<number, string> = { 1: "ruim", 2: "ok", 3: "bom" };

function Feedback() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getProdutoFeedback({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o feedback.</div>;
  const f = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Notas do CSAT (1 ruim, 2 ok, 3 bom) enviadas pelo produto no período, e os chamados de
        suporte (últimos 90 dias). Sem resposta ainda = a captura de CSAT está desligada na flag
        <code className="font-mono text-[12px]"> csat_modal_ativo</code>.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard
          label="Respostas"
          valor={f?.totalFeedbacks}
          descricao={f?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Nota média"
          valor={f?.mediaScore === null ? null : f?.mediaScore?.toFixed(2)}
          semDados={f?.mediaScore === null}
          variacaoPct={f?.mediaScore === null ? undefined : f?.mediaScoreVariacao}
          descricao="de 1 a 3"
          carregando={carregando}
        />
        <StatCard
          label="Chamados abertos"
          valor={f?.chamados.abertos}
          descricao="agora"
          carregando={carregando}
          invertido
          href="/chamados"
        />
        <StatCard
          label="Chamados no período"
          valor={f?.chamados.noPeriodo}
          descricao="criados"
          carregando={carregando}
        />
        <StatCard
          label="Resolvidos"
          valor={f?.chamados.resolvidos90d}
          descricao="últimos 90 dias"
          carregando={carregando}
        />
        <StatCard
          label="Tempo de resolução"
          valor={f ? formatarDuracao(f.chamados.tempoMedioResolucaoS) : null}
          semDados={f?.chamados.tempoMedioResolucaoS === null}
          descricao="médio, 90 dias"
          carregando={carregando}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Distribuição das notas
          </p>
          {carregando || !f ? (
            <SkeletonBloco className="h-24" />
          ) : (
            <BarraLista
              itens={f.distribuicao.map((d) => ({
                rotulo: `${d.score} · ${SCORE_LABEL[d.score]}`,
                valor: d.total,
              }))}
              vazio="Nenhuma resposta no período."
            />
          )}
        </div>
        <div className={`${CARD_CLASS} p-6`}>
          <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Por gatilho
          </p>
          {carregando || !f ? (
            <SkeletonBloco className="h-24" />
          ) : (
            <BarraLista
              itens={f.porGatilho.map((g) => ({
                rotulo: g.gatilho,
                valor: g.total,
                detalhe: g.media === null ? undefined : `média ${g.media.toFixed(2)}`,
              }))}
              vazio="Nenhuma resposta no período."
            />
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className={CARD_CLASS}>
          <p className="border-b border-[var(--line)] px-5 py-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Comentários
          </p>
          {carregando || !f ? (
            <SkeletonBloco className="h-40" />
          ) : f.comentarios.length === 0 ? (
            <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
              Nenhum comentário no período.
            </p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              {f.comentarios.map((c, i) => (
                <div
                  key={`${c.quando}-${i}`}
                  className="border-b border-[var(--line)] px-5 py-3 last:border-0"
                >
                  <p className="font-sans text-[13px] text-[var(--ink)]">{c.comentario}</p>
                  <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">
                    nota {c.score} · {c.gatilho} · {formatarDataHoraBRT(c.quando)} ·{" "}
                    {c.userId ? (
                      <Link
                        to="/founder/analytics/usuarias/$id"
                        params={{ id: c.userId }}
                        search={(prev) => prev}
                        className={`${BTN_LINK} text-[11px]`}
                      >
                        {c.usuaria}
                      </Link>
                    ) : (
                      c.usuaria
                    )}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={CARD_CLASS}>
          <p className="border-b border-[var(--line)] px-5 py-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
            Chamados recentes
          </p>
          {carregando || !f ? (
            <SkeletonBloco className="h-40" />
          ) : f.chamados.recentes.length === 0 ? (
            <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
              Nenhum chamado nos últimos 90 dias.
            </p>
          ) : (
            <div className="max-h-[480px] overflow-y-auto">
              {f.chamados.recentes.map((t) => (
                <div
                  key={t.id}
                  className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <Link
                      to="/chamados/$id"
                      params={{ id: t.id }}
                      className="font-sans text-[13px] text-[var(--ink)] no-underline hover:underline"
                    >
                      {t.titulo}
                    </Link>
                    <p className="font-sans text-[11px] text-[var(--muted)]">
                      {t.usuaria} · {t.modulo ?? "sem módulo"} · {formatarDataHoraBRT(t.quando)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 font-sans text-[11px] text-[var(--ink-soft)]">
                    {t.status}
                    {t.prioridade ? ` · ${t.prioridade}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
