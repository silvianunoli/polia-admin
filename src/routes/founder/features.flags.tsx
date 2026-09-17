import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  alterarFounderFlag,
  criarFounderFlag,
  getFounderFlags,
  type AmbienteFlag,
  type EstadoFlag,
  type FlagLinha,
} from "@/lib/founder-flags.functions";
import {
  CARD_CLASS,
  ALERTA_ERRO_CLASS,
  BTN_PRIMARIO,
  BTN_SECUNDARIO,
  INPUT_CLASS,
  TH_CLASS,
} from "@/lib/botoes";
import { formatarDataHoraBRT } from "@/lib/founder-formato";
import { toastErro, toastSucesso } from "@/lib/toast";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/features/flags")({
  component: FeatureFlags,
});

const ROLLOUTS = [0, 10, 25, 50, 100];
const ESTADO_LABEL: Record<EstadoFlag, string> = { on: "ON", off: "OFF", beta: "Beta" };
const ESTADO_COR: Record<EstadoFlag, string> = {
  on: "bg-[var(--secondary-light)] text-[var(--secondary-text)]",
  off: "bg-[var(--surface)] text-[var(--ink-soft)]",
  beta: "bg-[var(--highlight)] text-[var(--highlight-ink)]",
};

function LinhaFlag({
  flag,
  nomes,
  onAlterada,
}: {
  flag: FlagLinha;
  nomes: Record<string, string>;
  onAlterada: () => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [editandoBeta, setEditandoBeta] = useState(false);
  const [betaTexto, setBetaTexto] = useState(flag.betaUserIds.join("\n"));

  const alterar = async (patch: {
    estado?: EstadoFlag;
    rolloutPct?: number;
    betaUserIds?: string[];
  }) => {
    setSalvando(true);
    try {
      await alterarFounderFlag({ data: { key: flag.key, ambiente: flag.ambiente, ...patch } });
      toastSucesso(`${flag.key} (${flag.ambiente}) atualizada.`);
      onAlterada();
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui salvar a flag.");
    } finally {
      setSalvando(false);
    }
  };

  const salvarBeta = () => {
    const ids = betaTexto
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const invalido = ids.find((id) => !/^[0-9a-f-]{36}$/i.test(id));
    if (invalido) {
      toastErro(`"${invalido}" não parece um id de usuária (uuid).`);
      return;
    }
    void alterar({ betaUserIds: ids }).then(() => setEditandoBeta(false));
  };

  return (
    <tr className="border-b border-[var(--line)] align-top last:border-0">
      <td className="px-5 py-3">
        <p className="font-mono text-[13px] text-[var(--ink)]">{flag.key}</p>
        {flag.descricao && (
          <p className="mt-0.5 max-w-[320px] font-sans text-[12px] text-[var(--muted)]">
            {flag.descricao}
          </p>
        )}
      </td>
      <td className="px-5 py-3">
        <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
          {(["on", "beta", "off"] as EstadoFlag[]).map((e) => (
            <button
              key={e}
              type="button"
              disabled={salvando}
              onClick={() => flag.estado !== e && alterar({ estado: e })}
              className={`cursor-pointer rounded-md px-2.5 py-1 font-sans text-[12px] font-medium disabled:opacity-50 ${
                flag.estado === e ? ESTADO_COR[e] : "text-[var(--ink-soft)]"
              }`}
            >
              {ESTADO_LABEL[e]}
            </button>
          ))}
        </div>
      </td>
      <td className="px-5 py-3">
        <div className="flex flex-wrap gap-1">
          {ROLLOUTS.map((r) => (
            <button
              key={r}
              type="button"
              disabled={salvando}
              onClick={() => flag.rolloutPct !== r && alterar({ rolloutPct: r })}
              className={`cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px] disabled:opacity-50 ${
                flag.rolloutPct === r
                  ? "border-[var(--secondary)] bg-[var(--secondary-light)]/40 text-[var(--ink)]"
                  : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--secondary)]"
              }`}
            >
              {r}%
            </button>
          ))}
        </div>
        <div className="mt-1.5 h-1 w-full rounded-full bg-[var(--surface)]">
          <div
            className="h-1 rounded-full bg-[var(--secondary)]"
            style={{ width: `${flag.rolloutPct}%` }}
          />
        </div>
      </td>
      <td className="px-5 py-3">
        {editandoBeta ? (
          <div className="space-y-2">
            <textarea
              value={betaTexto}
              onChange={(e) => setBetaTexto(e.target.value)}
              rows={3}
              placeholder="um uuid por linha"
              className={`${INPUT_CLASS} w-64 font-mono text-[11px]`}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={salvarBeta}
                disabled={salvando}
                className={BTN_PRIMARIO}
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditandoBeta(false)}
                className={BTN_SECUNDARIO}
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditandoBeta(true)}
            className="cursor-pointer font-sans text-[12px] text-[var(--secondary-text)] hover:underline"
          >
            {flag.betaUserIds.length} usuária(s) beta · editar
          </button>
        )}
      </td>
      <td className="px-5 py-3 font-sans text-[11px] text-[var(--muted)]">
        {formatarDataHoraBRT(flag.atualizadoEm)}
        {flag.atualizadoPor
          ? ` · ${nomes[flag.atualizadoPor] ?? flag.atualizadoPor.slice(0, 8)}`
          : ""}
      </td>
    </tr>
  );
}

function FeatureFlags() {
  const { dados, carregando, erro, recarregar } = useCarregar(() => getFounderFlags(), []);
  const [ambiente, setAmbiente] = useState<AmbienteFlag>("prod");
  const [novaKey, setNovaKey] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [criando, setCriando] = useState(false);

  const criar = async () => {
    if (!novaKey.trim() || !novoNome.trim()) return;
    setCriando(true);
    try {
      await criarFounderFlag({ data: { key: novaKey.trim(), nome: novoNome.trim() } });
      toastSucesso("Flag criada (OFF, 0%) nos dois ambientes.");
      setNovaKey("");
      setNovoNome("");
      recarregar();
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui criar a flag.");
    } finally {
      setCriando(false);
    }
  };

  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar as flags.</div>;
  const flags = dados?.flags.filter((f) => f.ambiente === ambiente) ?? [];
  const historico = dados?.historico.filter((h) => h.ambiente === ambiente) ?? [];

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        ON liga pra <em>rollout</em>% das usuárias (a mesma usuária cai sempre do mesmo lado); Beta
        liga só pra lista de ids mais o rollout; OFF desliga pra todo mundo. A mudança vale na hora,
        sem deploy. Prod é one.usepolia.com.br; preview é qualquer outro host.
      </p>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
          {(["prod", "preview"] as AmbienteFlag[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAmbiente(a)}
              className={`cursor-pointer rounded-md px-3 py-1.5 font-sans text-[12px] font-medium ${
                ambiente === a ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)]"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void criar();
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            value={novaKey}
            onChange={(e) => setNovaKey(e.target.value)}
            placeholder="chave_da_flag"
            aria-label="Chave da flag nova"
            className={`${INPUT_CLASS} w-44 py-1.5 font-mono text-[12px]`}
          />
          <input
            value={novoNome}
            onChange={(e) => setNovoNome(e.target.value)}
            placeholder="Nome legível"
            aria-label="Nome da flag nova"
            className={`${INPUT_CLASS} w-48 py-1.5 text-[12px]`}
          />
          <button
            type="submit"
            disabled={criando || !novaKey || !novoNome}
            className={BTN_SECUNDARIO}
          >
            {criando ? "Criando…" : "Nova flag"}
          </button>
        </form>
      </div>

      <div className={`${CARD_CLASS} mb-8`}>
        {carregando || !dados ? (
          <SkeletonBloco className="h-48" />
        ) : flags.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
            Nenhuma flag em {ambiente}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Feature</th>
                  <th className={TH_CLASS}>Status</th>
                  <th className={TH_CLASS}>Rollout</th>
                  <th className={TH_CLASS}>Beta</th>
                  <th className={TH_CLASS}>Última mudança</th>
                </tr>
              </thead>
              <tbody>
                {flags.map((f) => (
                  <LinhaFlag
                    key={`${f.key}-${f.ambiente}`}
                    flag={f}
                    nomes={dados.nomes}
                    onAlterada={recarregar}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Histórico ({ambiente})
      </p>
      <div className={CARD_CLASS}>
        {carregando || !dados ? (
          <SkeletonBloco className="h-32" />
        ) : historico.length === 0 ? (
          <p className="p-5 font-sans text-[13px] text-[var(--muted)]">
            Nenhuma alteração registrada.
          </p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            {historico.map((h) => {
              const antes = h.estadoAnterior as { estado?: string; rollout_pct?: number } | null;
              const depois = h.estadoNovo as { estado?: string; rollout_pct?: number };
              return (
                <div
                  key={h.id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-[var(--line)] px-5 py-2.5 last:border-0"
                >
                  <span className="w-[92px] shrink-0 font-sans text-[11px] text-[var(--muted)]">
                    {formatarDataHoraBRT(h.alteradoEm)}
                  </span>
                  <span className="font-mono text-[12px] text-[var(--ink)]">{h.flagKey}</span>
                  <span className="font-sans text-[12px] text-[var(--ink-soft)]">
                    {antes ? `${antes.estado} ${antes.rollout_pct}% → ` : "criada: "}
                    {depois.estado} {depois.rollout_pct}%
                  </span>
                  <span className="font-sans text-[11px] text-[var(--muted)]">
                    por{" "}
                    {h.alteradoPor
                      ? (dados.nomes[h.alteradoPor] ?? h.alteradoPor.slice(0, 8))
                      : "sistema"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
