import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";
import { nomePlano } from "@/lib/founder-formato";
import { PLANOS_CONVITE, type PlanoConvite } from "@/lib/planos-convite";
import {
  atualizarAcessoDaUsuaria,
  lerAcessoDaUsuaria,
  type AcessoDaUsuaria,
} from "@/lib/acesso-usuaria.functions";

// CRM-10: plano e acesso de administradora de quem já tem conta. O convite
// (/crm/convites) só vale no nascimento da conta; depois disso é aqui.

const inputClass =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[14px] text-[var(--ink)] focus:border-[var(--secondary)] focus:outline-none disabled:opacity-50";
const btnPrimary =
  "rounded-xl bg-[var(--secondary)] px-5 py-2.5 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50";

// Status do Stripe em que a assinatura ainda está cobrando.
const COBRANDO = new Set(["active", "trialing", "past_due"]);

export function PlanoEAcesso({ userId, nome }: { userId: string; nome: string }) {
  const [atual, setAtual] = useState<AcessoDaUsuaria | null | undefined>(undefined);
  const [plano, setPlano] = useState<PlanoConvite>("confere");
  const [isAdmin, setIsAdmin] = useState(false);
  const [souEu, setSouEu] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const { confirmar, dialogo } = useConfirmacao();

  const carregar = async () => {
    try {
      const acesso = await lerAcessoDaUsuaria({ data: { userId } });
      setAtual(acesso);
      const valido = PLANOS_CONVITE.some((p) => p.valor === acesso.plano);
      setPlano(valido ? (acesso.plano as PlanoConvite) : "confere");
      setIsAdmin(acesso.is_admin);
    } catch {
      setAtual(null);
    }
  };

  useEffect(() => {
    carregar();
    supabase.auth.getSession().then(({ data }) => setSouEu(data.session?.user.id === userId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (atual === undefined) {
    return <p className="font-sans text-[13px] text-[var(--muted)]">Carregando o acesso…</p>;
  }
  if (atual === null) {
    return (
      <p className="font-sans text-[13px] text-[var(--danger)]">
        Não consegui carregar o plano dessa usuária.
      </p>
    );
  }

  const mudou = plano !== atual.plano || isAdmin !== atual.is_admin;
  const cobrando = atual.assinatura && COBRANDO.has(atual.assinatura.status);

  async function salvar() {
    if (isAdmin && !atual?.is_admin) {
      const ok = await confirmar({
        titulo: "Dar acesso de administradora",
        rotuloConfirmar: "Sim, liberar admin",
        descricao: (
          <>
            <strong className="text-[var(--ink)]">{nome}</strong> vai entrar no
            office.usepolia.com.br com os mesmos poderes que você: Founder Dashboard, CRM,
            campanhas, kanban e as telas de administração do produto.
          </>
        ),
      });
      if (!ok) return;
    }
    if (!isAdmin && atual?.is_admin) {
      const ok = await confirmar({
        titulo: "Tirar acesso de administradora",
        perigo: true,
        rotuloConfirmar: "Tirar admin",
        descricao: (
          <>
            <strong className="text-[var(--ink)]">{nome}</strong> perde a entrada no
            office.usepolia.com.br. A conta no produto continua igual.
          </>
        ),
      });
      if (!ok) return;
    }

    setSalvando(true);
    try {
      await atualizarAcessoDaUsuaria({ data: { userId, plano, is_admin: isAdmin } });
      toastSucesso("Acesso atualizado.");
      await carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui mudar o acesso.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mb-8 rounded-2xl border border-[var(--line)] bg-white p-7">
      <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
        Plano e acesso
      </p>
      <p className="mb-5 font-sans text-[13px] text-[var(--ink-soft)]">
        Hoje: <strong className="text-[var(--ink)]">{nomePlano(atual.plano)}</strong>
        {atual.is_admin ? " · administradora" : ""}
        {atual.assinatura
          ? ` · assinatura no Stripe: ${atual.assinatura.status}${
              atual.assinatura.cancel_at_period_end ? " (cancela no fim do período)" : ""
            }`
          : " · sem assinatura no Stripe"}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[200px] flex-col gap-1.5">
          <span className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Plano
          </span>
          <select
            value={plano}
            onChange={(e) => setPlano(e.target.value as PlanoConvite)}
            disabled={salvando}
            className={inputClass}
          >
            {PLANOS_CONVITE.map((p) => (
              <option key={p.valor} value={p.valor}>
                {nomePlano(p.valor)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={salvar} disabled={salvando || !mudou} className={btnPrimary}>
          {salvando ? "Salvando..." : "Salvar acesso"}
        </button>
      </div>

      <p className="mt-2 font-sans text-[12px] text-[var(--muted)]">
        {PLANOS_CONVITE.find((p) => p.valor === plano)?.explicacao}
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          disabled={salvando || (souEu && atual.is_admin)}
          className="mt-0.5 h-4 w-4 accent-[var(--secondary-text)]"
        />
        <span className="font-sans text-[13px] text-[var(--ink-soft)]">
          Acesso de administradora
          <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
            {souEu
              ? "É a sua conta. O seu próprio admin não sai por aqui."
              : "Abre o office.usepolia.com.br inteiro. Só pra quem trabalha na Pólia."}
          </span>
        </span>
      </label>

      <div className="mt-5 rounded-xl bg-[var(--surface)] p-4 font-sans text-[12px] leading-relaxed text-[var(--ink-soft)]">
        O webhook do Stripe também escreve o plano. Se ela assinar e depois cancelar, o plano vira
        Cancelada e a concessão feita aqui se perde.
        {cobrando
          ? " Ela tem assinatura cobrando agora: mudar o plano aqui não muda a cobrança, e a próxima renovação pode devolver o plano pago."
          : ""}
      </div>
      {dialogo}
    </div>
  );
}
