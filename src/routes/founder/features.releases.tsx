import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { criarRelease, getReleases } from "@/lib/founder-negocio.functions";
import { ALERTA_ERRO_CLASS, BTN_PRIMARIO, CARD_CLASS, INPUT_CLASS } from "@/lib/botoes";
import { formatarDataHoraBRT } from "@/lib/founder-formato";
import { toastErro, toastSucesso } from "@/lib/toast";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/features/releases")({
  component: Releases,
});

const REPOS = [
  "polia-app",
  "polia-admin",
  "polia-servicos",
  "polia-comunidade",
  "supabase",
] as const;

function Releases() {
  const { dados, carregando, erro, recarregar } = useCarregar(() => getReleases(), []);
  const [repositorio, setRepositorio] = useState<(typeof REPOS)[number]>("polia-app");
  const [titulo, setTitulo] = useState("");
  const [versao, setVersao] = useState("");
  const [commitSha, setCommitSha] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar as releases.</div>;

  const salvar = async () => {
    if (!titulo.trim()) return;
    setSalvando(true);
    try {
      await criarRelease({
        data: {
          repositorio,
          titulo: titulo.trim(),
          versao: versao.trim() || undefined,
          commitSha: commitSha.trim() || undefined,
          descricao: descricao.trim() || undefined,
        },
      });
      toastSucesso("Release registrada.");
      setTitulo("");
      setVersao("");
      setCommitSha("");
      setDescricao("");
      recarregar();
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não consegui registrar a release.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        O que subiu pra produção e quando. O deploy é automático no push da main (GitHub Actions),
        então o registro aqui é manual: uma linha por mudança que valha cruzar com os gráficos de
        uso e erro.
      </p>

      <div className={`${CARD_CLASS} mb-6 p-6`}>
        <p className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Registrar release
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void salvar();
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          <select
            value={repositorio}
            onChange={(e) => setRepositorio(e.target.value as (typeof REPOS)[number])}
            aria-label="Repositório"
            className={INPUT_CLASS}
          >
            {REPOS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Título (ex: Founder Dashboard, bloco 6)"
            aria-label="Título"
            className={INPUT_CLASS}
          />
          <input
            value={versao}
            onChange={(e) => setVersao(e.target.value)}
            placeholder="Versão (opcional)"
            aria-label="Versão"
            className={INPUT_CLASS}
          />
          <input
            value={commitSha}
            onChange={(e) => setCommitSha(e.target.value)}
            placeholder="Commit (opcional)"
            aria-label="Commit"
            className={`${INPUT_CLASS} font-mono`}
          />
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="O que mudou, em uma ou duas frases"
            aria-label="Descrição"
            rows={2}
            className={`${INPUT_CLASS} sm:col-span-2`}
          />
          <div className="sm:col-span-2">
            <button type="submit" disabled={salvando || !titulo.trim()} className={BTN_PRIMARIO}>
              {salvando ? "Salvando…" : "Registrar"}
            </button>
          </div>
        </form>
      </div>

      <Secao titulo="Releases" carregando={carregando} semPadding altura="h-32">
        {!dados || dados.length === 0 ? (
          <Vazio>Nenhuma release registrada ainda.</Vazio>
        ) : (
          <div>
            {dados.map((r) => (
              <div key={r.id} className="border-b border-[var(--line)] px-5 py-3 last:border-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-sans text-[14px] text-[var(--ink)]">
                    {r.titulo}
                    {r.versao ? <span className="text-[var(--muted)]"> · {r.versao}</span> : null}
                  </p>
                  <p className="font-sans text-[12px] text-[var(--muted)]">
                    {formatarDataHoraBRT(r.deployadoEm)}
                  </p>
                </div>
                <p className="mt-0.5 font-sans text-[12px] text-[var(--muted)]">
                  <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[var(--ink-soft)]">
                    {r.repositorio}
                  </span>
                  {r.commitSha ? (
                    <span className="ml-2 font-mono">{r.commitSha.slice(0, 10)}</span>
                  ) : null}
                </p>
                {r.descricao ? (
                  <p className="mt-1.5 font-sans text-[13px] text-[var(--ink-soft)]">
                    {r.descricao}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Secao>
    </>
  );
}
