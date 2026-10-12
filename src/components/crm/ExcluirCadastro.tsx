import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";
import { excluirCadastroDaUsuaria } from "@/lib/acesso-usuaria.functions";

// Exclusão do cadastro pelo office (12/10/2026). Fica no fim da ficha, longe do
// "Salvar acesso", e sempre passa pela confirmação vermelha: não tem volta.

export function ExcluirCadastro({ userId, nome }: { userId: string; nome: string }) {
  const navigate = useNavigate();
  const [souEu, setSouEu] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const { confirmar, dialogo } = useConfirmacao();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSouEu(data.session?.user.id === userId));
  }, [userId]);

  if (souEu) return null;

  async function excluir() {
    const ok = await confirmar({
      titulo: "Excluir cadastro",
      perigo: true,
      rotuloConfirmar: "Excluir para sempre",
      descricao: (
        <>
          <strong className="text-[var(--ink)]">{nome}</strong> perde o login e tudo o que guardou
          na Pólia One: perfil, Planejamento, produtos, clientes, lançamentos, metas e chamados. Se
          tiver assinatura cobrando, ela é cancelada no Stripe na hora. Não dá pra desfazer.
        </>
      ),
    });
    if (!ok) return;

    setExcluindo(true);
    try {
      const r = await excluirCadastroDaUsuaria({ data: { userId } });
      toastSucesso(
        r.assinaturaCancelada
          ? "Cadastro excluído e assinatura cancelada no Stripe."
          : "Cadastro excluído.",
      );
      navigate({ to: "/crm/usuarias" });
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui excluir o cadastro.");
      setExcluindo(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-7">
      <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
        Excluir cadastro
      </p>
      <p className="mb-5 font-sans text-[13px] text-[var(--ink-soft)]">
        Apaga o login e todos os dados dela. Conta de administradora precisa perder o acesso de
        admin antes.
      </p>
      <button
        type="button"
        onClick={excluir}
        disabled={excluindo}
        className="rounded-xl border border-[var(--danger)] bg-white px-5 py-2.5 font-sans text-[14px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--danger)] disabled:opacity-50"
      >
        {excluindo ? "Excluindo..." : "Excluir cadastro"}
      </button>
      {dialogo}
    </div>
  );
}
