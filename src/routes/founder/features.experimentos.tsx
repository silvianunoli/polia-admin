import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { criarExperimento, getProdutoExperimentos } from "@/lib/founder-produto.functions";
import {
  CARD_CLASS,
  ALERTA_ERRO_CLASS,
  BTN_LINK,
  BTN_PRIMARIO,
  INPUT_CLASS,
  TH_CLASS,
} from "@/lib/botoes";
import { formatarDataBRT } from "@/lib/founder-formato";
import { toastErro, toastSucesso } from "@/lib/toast";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/features/experimentos")({
  component: ConfigExperimentos,
});

const EVENTOS = [
  "feature_completed",
  "create_product",
  "edit_product",
  "create_goal",
  "onboarding_completed",
  "business_created",
  "subscription_started",
];

function ConfigExperimentos() {
  const { dados, carregando, erro, recarregar } = useCarregar(() => getProdutoExperimentos(), []);
  const [nome, setNome] = useState("");
  const [hipotese, setHipotese] = useState("");
  const [flagKey, setFlagKey] = useState("");
  const [metricaEvento, setMetricaEvento] = useState("feature_completed");
  const [metricaFeature, setMetricaFeature] = useState("");
  const [salvando, setSalvando] = useState(false);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os experimentos.</div>;

  const criar = async () => {
    if (!nome.trim() || !flagKey) return;
    setSalvando(true);
    try {
      await criarExperimento({
        data: {
          nome: nome.trim(),
          hipotese: hipotese.trim() || undefined,
          flagKey,
          metricaEvento,
          metricaFeature: metricaFeature.trim() || undefined,
        },
      });
      toastSucesso("Experimento criado.");
      setNome("");
      setHipotese("");
      setMetricaFeature("");
      recarregar();
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui criar o experimento.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Um experimento amarra uma flag (quem está dentro do rollout é o grupo "com") a um
        evento-métrica. Os resultados ficam em{" "}
        <Link to="/founder/produto/experimentos" search={(prev) => prev} className={BTN_LINK}>
          Produto → Experimentos
        </Link>
        . Pra rodar de verdade: crie a flag em Feature Flags, coloque em ON com 50%, crie o
        experimento aqui.
      </p>

      <div className={`${CARD_CLASS} mb-6 p-6`}>
        <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Novo experimento
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void criar();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Nome"
            aria-label="Nome"
            className={INPUT_CLASS}
          />
          <select
            value={flagKey}
            onChange={(e) => setFlagKey(e.target.value)}
            aria-label="Flag"
            className={INPUT_CLASS}
          >
            <option value="">Flag (prod)…</option>
            {(dados?.flagsDisponiveis ?? []).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <select
            value={metricaEvento}
            onChange={(e) => setMetricaEvento(e.target.value)}
            aria-label="Evento-métrica"
            className={INPUT_CLASS}
          >
            {EVENTOS.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
          <input
            value={metricaFeature}
            onChange={(e) => setMetricaFeature(e.target.value)}
            placeholder="Feature da métrica (opcional, ex: produtos)"
            aria-label="Feature da métrica"
            className={INPUT_CLASS}
          />
          <textarea
            value={hipotese}
            onChange={(e) => setHipotese(e.target.value)}
            placeholder="Hipótese: o que você espera que mude e por quê"
            aria-label="Hipótese"
            rows={2}
            className={`${INPUT_CLASS} sm:col-span-2`}
          />
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={salvando || !nome.trim() || !flagKey}
              className={BTN_PRIMARIO}
            >
              {salvando ? "Criando…" : "Criar experimento"}
            </button>
          </div>
        </form>
      </div>

      <div className={CARD_CLASS}>
        {carregando || !dados ? (
          <SkeletonBloco className="h-32" />
        ) : dados.experimentos.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--muted)]">Nenhum experimento ainda.</p>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Experimento</th>
                <th className={TH_CLASS}>Flag</th>
                <th className={TH_CLASS}>Métrica</th>
                <th className={TH_CLASS}>Início</th>
                <th className={TH_CLASS}>Status</th>
              </tr>
            </thead>
            <tbody>
              {dados.experimentos.map((e) => (
                <tr key={e.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">{e.nome}</td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {e.flagKey}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {e.metricaEvento}
                    {e.metricaFeature ? ` @ ${e.metricaFeature}` : ""}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                    {formatarDataBRT(e.inicio)}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                    {e.status}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
