import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";
import { excluirCadastroDaUsuaria, lerAcessoDaUsuaria } from "@/lib/acesso-usuaria.functions";

// Exclusão do cadastro pelo office (12/10/2026). Fica no fim da ficha, longe do
// "Salvar acesso", e sempre passa pela confirmação vermelha: não tem volta.
// O e-mail aparece no bloco e na confirmação pra não excluir a pessoa errada
// quando duas têm o mesmo nome (ou nenhum).

const ADMIN_PRIMEIRO =
  'Essa conta é de administradora. Desmarque "Acesso de administradora" em Plano e acesso, salve e depois exclua.';

export function ExcluirCadastro({
  userId,
  nome,
  email,
}: {
  userId: string;
  nome: string;
  email: string | null;
}) {
  const navigate = useNavigate();
  const [souEu, setSouEu] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmacao();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSouEu(data.session?.user.id === userId));
    lerAcessoDaUsuaria({ data: { userId } })
      .then((a) => setAviso(a.is_admin ? ADMIN_PRIMEIRO : null))
      .catch(() => {});
  }, [userId]);

  if (souEu) return null;

  async function excluir() {
    setExcluindo(true);
    // Relê na hora do clique: o admin pode ter sido tirado agora mesmo em
    // "Plano e acesso", sem recarregar a página.
    try {
      const acesso = await lerAcessoDaUsuaria({ data: { userId } });
      if (acesso.is_admin) {
        setAviso(ADMIN_PRIMEIRO);
        toastErro(ADMIN_PRIMEIRO);
        setExcluindo(false);
        return;
      }
      setAviso(null);
    } catch {
      // Se a releitura falhar, o servidor confere de novo antes de apagar.
    }

    const ok = await confirmar({
      titulo: "Excluir cadastro",
      perigo: true,
      rotuloConfirmar: "Excluir para sempre",
      descricao: (
        <>
          <strong className="text-[var(--ink)]">{nome}</strong>
          {email ? (
            <>
              {" "}
              (<span className="text-[var(--ink)]">{email}</span>)
            </>
          ) : null}{" "}
          perde o login e tudo o que guardou na Pólia One: perfil, Planejamento, produtos, clientes,
          lançamentos, metas e chamados. Se tiver assinatura cobrando, ela é cancelada no Stripe na
          hora. Não dá pra desfazer.
        </>
      ),
    });
    if (!ok) {
      setExcluindo(false);
      return;
    }

    try {
      const r = await excluirCadastroDaUsuaria({ data: { userId } });
      if (!r.ok) {
        setAviso(r.error);
        toastErro(r.error);
        setExcluindo(false);
        return;
      }
      toastSucesso(
        r.assinaturaCancelada
          ? "Cadastro excluído e assinatura cancelada no Stripe."
          : "Cadastro excluído.",
      );
      navigate({ to: "/crm/usuarias" });
    } catch (err) {
      const msg =
        err instanceof Error && err.message && !err.message.trim().startsWith("<")
          ? err.message
          : "Não consegui excluir o cadastro. Recarregue a página e tente de novo.";
      setAviso(msg);
      toastErro(msg);
      setExcluindo(false);
    }
  }

  return (
    <div className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-7">
      <p className="mb-1 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
        Excluir cadastro
      </p>
      <p className="mb-5 font-sans text-[13px] text-[var(--ink-soft)]">
        Apaga o login {email ? <strong className="text-[var(--ink)]">{email}</strong> : null} e
        todos os dados dela. Não dá pra desfazer.
      </p>
      {aviso ? (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-[var(--danger-soft)] p-4 font-sans text-[13px] text-[var(--danger)]"
        >
          {aviso}
        </p>
      ) : null}
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
