import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lintTextoSocial } from "@/lib/social-lint.functions";
import { toastErro, toastSucesso } from "@/lib/toast";
import { logAcaoAdmin } from "@/lib/audit-log";

// Client sem generic <Database> neste app — tipos definidos à mão em vez de
// Tables<"dm_gatilhos"> / Tables<"dm_conversas">.
interface Gatilho {
  id: string;
  palavra: string;
  resposta: string;
  max_por_dia: number;
  ativo: boolean;
  created_at?: string;
}

interface Conversa {
  id: string;
  ig_user_id: string;
  estado: string | null;
  erro: string | null;
  criado_em?: string;
}

const ESTADO_LABEL: Record<string, string> = {
  respondido: "respondido",
  janela_aberta: "janela aberta (24h)",
  encerrado: "encerrado",
  optout: "optout",
};

export function GatilhosDM() {
  const [gatilhos, setGatilhos] = useState<Gatilho[] | null>(null);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [palavra, setPalavra] = useState("");
  const [resposta, setResposta] = useState("");
  const [maxPorDia, setMaxPorDia] = useState(200);
  const [erroForm, setErroForm] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setCarregando(true);
    const [{ data: g }, { data: c }] = await Promise.all([
      supabase.from("dm_gatilhos").select("*").order("created_at", { ascending: false }),
      supabase.from("dm_conversas").select("*").order("criado_em", { ascending: false }).limit(20),
    ]);
    setGatilhos(g ?? []);
    setConversas(c ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criarGatilho() {
    const lint = lintTextoSocial(resposta);
    if (!lint.aprovado) {
      setErroForm(`Reprovado no lint: contém ${lint.violacoes[0].termo}. Trecho: "${lint.violacoes[0].trecho}"`);
      return;
    }
    if (!palavra.trim()) {
      setErroForm("Escreve a palavra-gatilho.");
      return;
    }
    setSalvando(true);
    setErroForm(null);
    const { error } = await supabase.from("dm_gatilhos").insert({
      palavra: palavra.trim(),
      resposta: resposta.trim(),
      max_por_dia: maxPorDia,
      ativo: true,
    });
    setSalvando(false);
    if (error) {
      setErroForm("Não salvou o gatilho. Tenta de novo.");
      return;
    }
    await logAcaoAdmin("criar_gatilho_dm", undefined, { palavra });
    toastSucesso("Gatilho criado.");
    setPalavra("");
    setResposta("");
    setMaxPorDia(200);
    carregar();
  }

  async function alternarAtivo(gatilho: Gatilho) {
    const { error } = await supabase.from("dm_gatilhos").update({ ativo: !gatilho.ativo }).eq("id", gatilho.id);
    if (error) {
      toastErro("Não deu pra atualizar o gatilho.");
      return;
    }
    await logAcaoAdmin(gatilho.ativo ? "pausar_gatilho_dm" : "ativar_gatilho_dm", gatilho.id);
    carregar();
  }

  if (carregando) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--surface)]" />
        <div className="h-40 animate-pulse rounded-xl bg-[var(--surface)]" />
      </div>
    );
  }

  const algumErroDePermissao = conversas.some((c) => c.erro && c.erro.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {algumErroDePermissao && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--accent)]/20 p-4">
          <p className="font-sans text-[13px] text-[var(--ink)]">
            Gatilhos rodando em modo de teste: alguma DM recente falhou (provavelmente falta permissão
            <code className="mx-1 rounded bg-white px-1">instagram_manage_messages</code>
            ainda em revisão da Meta). Confere os detalhes na lista de atividade abaixo.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-[var(--line)] bg-white p-5">
        <p className="mb-3 font-sans text-[13px] font-semibold text-[var(--ink)]">Novo gatilho</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-[var(--muted)]">
              Palavra
            </label>
            <input
              type="text"
              value={palavra}
              onChange={(e) => setPalavra(e.target.value)}
              placeholder="ex.: LUCRO"
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-[var(--muted)]">
              Máximo por dia
            </label>
            <input
              type="number"
              value={maxPorDia}
              onChange={(e) => setMaxPorDia(Number(e.target.value))}
              min={1}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)]"
            />
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          <label className="font-sans text-[11px] font-semibold uppercase tracking-[1px] text-[var(--muted)]">
            Resposta (o "responde PARAR se não quiser mais" é acrescentado automaticamente)
          </label>
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            rows={3}
            placeholder="Toma o link da lista de espera:"
            className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[13px] text-[var(--ink)]"
          />
        </div>
        {erroForm && (
          <p className="mt-2 rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-2 font-sans text-[12px] text-[var(--danger)]">
            {erroForm}
          </p>
        )}
        <button
          type="button"
          onClick={criarGatilho}
          disabled={salvando}
          className="mt-3 rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Criar gatilho"}
        </button>
      </div>

      <div>
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
          Gatilhos ({(gatilhos ?? []).length})
        </p>
        <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white">
          {(gatilhos ?? []).map((g) => (
            <div key={g.id} className="flex items-center gap-3 border-b border-[var(--line)] p-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="font-sans text-[13px] font-semibold text-[var(--ink)]">{g.palavra}</p>
                <p className="truncate font-sans text-[12px] text-[var(--muted)]">{g.resposta}</p>
                <p className="font-sans text-[11px] text-[var(--muted)]">até {g.max_por_dia}/dia</p>
              </div>
              <button
                type="button"
                onClick={() => alternarAtivo(g)}
                className={`flex-none rounded-full border px-3 py-1 font-sans text-[11px] font-semibold uppercase tracking-[0.5px] ${
                  g.ativo
                    ? "border-[var(--ink)] bg-[var(--accent)]/25 text-[var(--ink)]"
                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                }`}
              >
                {g.ativo ? "ativo" : "pausado"}
              </button>
            </div>
          ))}
          {(gatilhos ?? []).length === 0 && (
            <p className="p-4 font-sans text-[13px] text-[var(--muted)]">Nenhum gatilho criado ainda.</p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
          Atividade recente
        </p>
        <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white">
          {conversas.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 border-b border-[var(--line)] p-3 last:border-b-0">
              <div className="min-w-0">
                <p className="font-sans text-[12px] text-[var(--ink-soft)]">{c.ig_user_id}</p>
                {c.erro && <p className="font-sans text-[11px] text-[var(--danger)]">{c.erro}</p>}
              </div>
              <span className="flex-none font-sans text-[11px] uppercase tracking-[0.5px] text-[var(--muted)]">
                {ESTADO_LABEL[c.estado ?? ""] ?? c.estado}
              </span>
            </div>
          ))}
          {conversas.length === 0 && (
            <p className="p-4 font-sans text-[13px] text-[var(--muted)]">Sem atividade ainda.</p>
          )}
        </div>
      </div>
    </div>
  );
}
