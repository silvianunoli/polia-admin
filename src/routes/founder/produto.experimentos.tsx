import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { alterarStatusExperimento, getProdutoExperimentos } from "@/lib/founder-produto.functions";
import { CARD_CLASS, ALERTA_ERRO_CLASS, BTN_LINK, BTN_SECUNDARIO } from "@/lib/botoes";
import { formatarDataBRT, formatarPct } from "@/lib/founder-formato";
import { toastErro, toastSucesso } from "@/lib/toast";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/produto/experimentos")({
  component: ResultadosExperimentos,
});

function ResultadosExperimentos() {
  const { dados, carregando, erro, recarregar } = useCarregar(() => getProdutoExperimentos(), []);
  const [mudando, setMudando] = useState<string | null>(null);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os experimentos.</div>;

  const mudarStatus = async (id: string, status: "ativo" | "pausado" | "concluido") => {
    setMudando(id);
    try {
      await alterarStatusExperimento({ data: { id, status } });
      toastSucesso(`Experimento ${status}.`);
      recarregar();
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui alterar o experimento.");
    } finally {
      setMudando(null);
    }
  };

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Cada experimento compara quem está <strong>com</strong> a flag (dentro do rollout ou na
        lista beta) contra quem está <strong>sem</strong>, medindo a proporção de usuárias que
        fizeram o evento-métrica desde o início. Configuração e novos experimentos em{" "}
        <Link to="/founder/features/experimentos" search={(prev) => prev} className={BTN_LINK}>
          Features → Experimentos
        </Link>
        .
      </p>
      {carregando || !dados ? (
        <SkeletonBloco className="h-40" />
      ) : dados.experimentos.length === 0 ? (
        <div className={`${CARD_CLASS} p-6`}>
          <p className="font-sans text-[13px] text-[var(--muted)]">
            Nenhum experimento cadastrado ainda.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {dados.experimentos.map((e) => {
            const diferenca =
              e.com.taxa !== null && e.sem.taxa !== null ? e.com.taxa - e.sem.taxa : null;
            return (
              <div key={e.id} className={`${CARD_CLASS} p-6`}>
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-cabinet text-[20px] leading-tight text-[var(--ink)]">
                      {e.nome}
                    </p>
                    <p className="font-sans text-[12px] text-[var(--muted)]">
                      flag <code className="font-mono">{e.flagKey}</code>
                      {e.flagExiste
                        ? ` (${e.flagEstado}, ${e.flagRollout}%)`
                        : " (flag não existe em prod)"}{" "}
                      · métrica <code className="font-mono">{e.metricaEvento}</code>
                      {e.metricaFeature ? ` em ${e.metricaFeature}` : ""} · desde{" "}
                      {formatarDataBRT(e.inicio)}
                      {e.fim ? ` até ${formatarDataBRT(e.fim)}` : ""} · {e.status}
                    </p>
                    {e.hipotese && (
                      <p className="mt-1 max-w-[640px] font-sans text-[13px] text-[var(--ink-soft)]">
                        {e.hipotese}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {e.status !== "ativo" && e.status !== "concluido" && (
                      <button
                        type="button"
                        disabled={mudando === e.id}
                        onClick={() => mudarStatus(e.id, "ativo")}
                        className={BTN_SECUNDARIO}
                      >
                        Retomar
                      </button>
                    )}
                    {e.status === "ativo" && (
                      <button
                        type="button"
                        disabled={mudando === e.id}
                        onClick={() => mudarStatus(e.id, "pausado")}
                        className={BTN_SECUNDARIO}
                      >
                        Pausar
                      </button>
                    )}
                    {e.status !== "concluido" && (
                      <button
                        type="button"
                        disabled={mudando === e.id}
                        onClick={() => mudarStatus(e.id, "concluido")}
                        className={BTN_SECUNDARIO}
                      >
                        Concluir
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
                      Com a flag
                    </p>
                    <p className="font-cabinet text-[24px] leading-none text-[var(--ink)]">
                      {formatarPct(e.com.taxa)}
                    </p>
                    <p className="font-sans text-[11px] text-[var(--muted)]">
                      {e.com.converteram} de {e.com.total}
                    </p>
                  </div>
                  <div>
                    <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
                      Sem a flag
                    </p>
                    <p className="font-cabinet text-[24px] leading-none text-[var(--ink)]">
                      {formatarPct(e.sem.taxa)}
                    </p>
                    <p className="font-sans text-[11px] text-[var(--muted)]">
                      {e.sem.converteram} de {e.sem.total}
                    </p>
                  </div>
                  <div>
                    <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
                      Diferença
                    </p>
                    <p
                      className={`font-cabinet text-[24px] leading-none ${diferenca === null ? "text-[var(--muted)]" : diferenca >= 0 ? "text-[var(--secondary-text)]" : "text-[var(--danger)]"}`}
                    >
                      {diferenca === null
                        ? "sem dados"
                        : `${diferenca >= 0 ? "+" : ""}${diferenca.toFixed(1)} p.p.`}
                    </p>
                    <p className="font-sans text-[11px] text-[var(--muted)]">
                      {e.com.total + e.sem.total < 30
                        ? "amostra pequena, não conclua ainda"
                        : "pontos percentuais"}
                    </p>
                  </div>
                </div>
                {e.resultado && (
                  <p className="mt-3 font-sans text-[13px] text-[var(--ink-soft)]">
                    Conclusão: {e.resultado}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
