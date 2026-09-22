import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Trash2, Send, ShieldCheck } from "lucide-react";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";
import { nomePlano } from "@/lib/founder-formato";
import { PLANOS_CONVITE, type PlanoConvite } from "@/lib/planos-convite";
import {
  listarConvites,
  criarConvite,
  enviarConvite,
  removerConvite,
  atualizarAcessoDoConvite,
  type ConviteListItem,
} from "@/lib/convites.functions";

// Antes de 21/09/2026 esta tela era uma aba dentro de /crm/usuarias e liberava
// só o e-mail: toda conta nascia no plano Grátis, sem admin, e mudar isso
// exigia SQL na mão. Virou rota própria quando passou a decidir o tipo de
// acesso — e saiu de lá pra não existirem duas telas escrevendo na mesma
// tabela, que é como uma delas fica velha sem ninguém notar.
export const Route = createFileRoute("/crm/convites")({
  head: () => ({ meta: [{ title: "Convites · CRM Pólia" }] }),
  component: CrmConvites,
});

const inputClass =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--secondary)] focus:outline-none";
const btnPrimary =
  "rounded-xl bg-[var(--secondary)] px-5 py-2.5 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50";
const cardClass = "overflow-hidden rounded-2xl border border-[var(--line)] bg-white";
const thClass =
  "px-5 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]";
const tdMuted = "px-5 py-3 font-sans text-[13px] text-[var(--muted)]";

function CrmConvites() {
  const [convites, setConvites] = useState<ConviteListItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novoEmail, setNovoEmail] = useState("");
  const [novoPlano, setNovoPlano] = useState<PlanoConvite>("confere");
  const [novoAdmin, setNovoAdmin] = useState(false);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [enviandoConvite, setEnviandoConvite] = useState<string | null>(null);
  const { confirmar, dialogo } = useConfirmacao();

  const carregar = async () => {
    setCarregando(true);
    try {
      const { convites: lista } = await listarConvites();
      setConvites(lista);
    } catch {
      toastErro("Não consegui carregar os convites.");
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  // Acesso de administradora abre o office inteiro, não só o produto. Pede
  // confirmação nomeando o que isso dá, tanto ao criar quanto ao editar.
  async function confirmarAdmin(email: string) {
    return confirmar({
      titulo: "Dar acesso de administradora",
      rotuloConfirmar: "Sim, liberar admin",
      descricao: (
        <>
          <strong className="text-[var(--ink)]">{email}</strong> vai entrar no
          office.usepolia.com.br com os mesmos poderes que você: Founder Dashboard, CRM, campanhas,
          kanban e as telas de administração do produto. Quem tiver acesso a essa caixa de e-mail
          consegue criar a conta.
        </>
      ),
    });
  }

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    const email = novoEmail.trim();
    if (!email) return;
    if (novoAdmin && !(await confirmarAdmin(email))) return;

    setCriando(true);
    try {
      await criarConvite({ data: { email, plano: novoPlano, is_admin: novoAdmin } });
      setNovoEmail("");
      setNovoPlano("confere");
      setNovoAdmin(false);
      toastSucesso("Convite criado. Agora manda o e-mail pra ela.");
      carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui criar o convite.");
    } finally {
      setCriando(false);
    }
  }

  async function handleMudarAcesso(email: string, plano: PlanoConvite, is_admin: boolean) {
    if (is_admin && !(await confirmarAdmin(email))) return;
    setSalvando(email);
    try {
      await atualizarAcessoDoConvite({ data: { email, plano, is_admin } });
      setConvites((atual) => atual.map((c) => (c.email === email ? { ...c, plano, is_admin } : c)));
      toastSucesso("Acesso do convite atualizado.");
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui mudar o acesso.");
      carregar();
    } finally {
      setSalvando(null);
    }
  }

  async function handleEnviar(email: string) {
    setEnviandoConvite(email);
    try {
      await enviarConvite({ data: { email } });
      toastSucesso("Convite enviado.");
      carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui enviar o convite.");
    } finally {
      setEnviandoConvite(null);
    }
  }

  async function handleRemover(email: string) {
    const ok = await confirmar({
      titulo: "Remover este convite",
      perigo: true,
      rotuloConfirmar: "Remover convite",
      descricao: (
        <>
          <strong className="text-[var(--ink)]">{email}</strong> sai da lista de quem pode criar
          conta. Ela só consegue se cadastrar se você liberar de novo.
        </>
      ),
    });
    if (!ok) return;
    setRemovendo(email);
    try {
      await removerConvite({ data: { email } });
      toastSucesso("Convite removido.");
      setConvites((c) => c.filter((item) => item.email !== email));
    } catch {
      toastErro("Não consegui remover o convite.");
    } finally {
      setRemovendo(null);
    }
  }

  const pendentes = convites.filter((c) => !c.usado_em).length;
  const admins = convites.filter((c) => (c.contaAdmin ?? c.is_admin) === true).length;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        O cadastro é fechado: só quem está nesta lista consegue criar conta. O plano e o acesso de
        administradora escolhidos aqui são aplicados no momento em que ela cria a conta.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        <Pill valor={convites.length} label="convites" />
        <Pill valor={pendentes} label="ainda não usaram" />
        <Pill valor={admins} label="com admin" />
      </div>

      <form onSubmit={handleCriar} className={`mb-6 p-5 ${cardClass}`}>
        <p className="mb-4 font-cabinet text-[17px] text-[var(--ink)]">Liberar um e-mail</p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1.5">
            <span className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              E-mail
            </span>
            <input
              type="email"
              placeholder="email@dominio.com"
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              disabled={criando}
              className={inputClass}
            />
          </label>

          <label className="flex min-w-[180px] flex-col gap-1.5">
            <span className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              Plano
            </span>
            <select
              value={novoPlano}
              onChange={(e) => setNovoPlano(e.target.value as PlanoConvite)}
              disabled={criando}
              className={inputClass}
            >
              {PLANOS_CONVITE.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {nomePlano(p.valor)}
                </option>
              ))}
            </select>
          </label>

          <button type="submit" disabled={criando || !novoEmail.trim()} className={btnPrimary}>
            {criando ? "Liberando..." : "Liberar e-mail"}
          </button>
        </div>

        <p className="mt-2 font-sans text-[12px] text-[var(--muted)]">
          {PLANOS_CONVITE.find((p) => p.valor === novoPlano)?.explicacao}
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={novoAdmin}
            onChange={(e) => setNovoAdmin(e.target.checked)}
            disabled={criando}
            className="mt-0.5 h-4 w-4 accent-[var(--secondary-text)]"
          />
          <span className="font-sans text-[13px] text-[var(--ink-soft)]">
            Também dar acesso de administradora
            <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
              Abre o office.usepolia.com.br inteiro: Founder Dashboard, CRM, campanhas e kanban. Só
              pra você e pra quem trabalha na Pólia com você.
            </span>
          </span>
        </label>
      </form>

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="border-b border-[var(--line)]">
              {["E-mail", "Acesso", "Status", "Criado em", ""].map((h) => (
                <th key={h} className={thClass}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {convites.map((c) => {
              const usado = Boolean(c.usado_em);
              const ocupado = salvando === c.email;
              return (
                <tr
                  key={c.email}
                  className="border-b border-[var(--line)] align-top hover:bg-[var(--surface)]"
                >
                  <td className="px-5 py-3 font-sans text-[14px] text-[var(--ink)]">{c.email}</td>

                  <td className="px-5 py-3">
                    {usado ? (
                      // Conta criada: o convite é só histórico daqui pra frente.
                      // Mostrar o plano DELE seria mentira se ela mudou de plano.
                      <div className="font-sans text-[13px] text-[var(--ink-soft)]">
                        {c.contaPlano === null ? (
                          <span className="text-[var(--muted)]">
                            Conta criada · plano não encontrado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            {nomePlano(c.contaPlano)}
                            {c.contaAdmin && <SeloAdmin />}
                          </span>
                        )}
                        <span className="mt-0.5 block text-[12px] text-[var(--muted)]">
                          hoje, no perfil dela
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <select
                          value={c.plano}
                          disabled={ocupado}
                          onChange={(e) =>
                            handleMudarAcesso(c.email, e.target.value as PlanoConvite, c.is_admin)
                          }
                          aria-label={`Plano do convite de ${c.email}`}
                          className="rounded-lg border border-[var(--line)] bg-white px-2.5 py-1.5 font-sans text-[13px] text-[var(--ink)] focus:border-[var(--secondary)] focus:outline-none disabled:opacity-50"
                        >
                          {PLANOS_CONVITE.map((p) => (
                            <option key={p.valor} value={p.valor}>
                              {nomePlano(p.valor)}
                            </option>
                          ))}
                        </select>
                        <label className="flex cursor-pointer items-center gap-1.5 font-sans text-[12px] text-[var(--muted)]">
                          <input
                            type="checkbox"
                            checked={c.is_admin}
                            disabled={ocupado}
                            onChange={(e) =>
                              handleMudarAcesso(c.email, c.plano as PlanoConvite, e.target.checked)
                            }
                            className="h-3.5 w-3.5 accent-[var(--secondary-text)]"
                          />
                          admin
                        </label>
                      </div>
                    )}
                  </td>

                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${
                        usado
                          ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
                          : c.enviado_em
                            ? "bg-[var(--line)] text-[var(--ink-soft)]"
                            : "bg-[var(--highlight)] text-[var(--highlight-ink)]"
                      }`}
                    >
                      {usado ? "Conta criada" : c.enviado_em ? "Convite enviado" : "Não enviado"}
                    </span>
                  </td>

                  <td className={tdMuted}>{new Date(c.criado_em).toLocaleDateString("pt-BR")}</td>

                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-3">
                      {!usado && (
                        <button
                          type="button"
                          onClick={() => handleEnviar(c.email)}
                          disabled={enviandoConvite === c.email}
                          aria-label={`Enviar convite por e-mail pra ${c.email}`}
                          title={c.enviado_em ? "Reenviar convite" : "Enviar convite"}
                          className="text-[var(--muted)] hover:text-[var(--secondary-text)] disabled:opacity-30"
                        >
                          <Send size={16} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemover(c.email)}
                        disabled={removendo === c.email}
                        aria-label={`Remover convite de ${c.email}`}
                        className="text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-30"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!carregando && convites.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]"
                >
                  Nenhum convite ainda.
                </td>
              </tr>
            )}
            {carregando && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]"
                >
                  Carregando...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 font-sans text-[12px] text-[var(--muted)]">
        Mudar o plano de quem <strong className="font-semibold">já tem conta</strong> não se faz
        aqui: o convite vale só no momento do cadastro. Depois disso, quem manda é o perfil dela (e
        o Stripe, se ela assinar).
      </p>

      {dialogo}
    </>
  );
}

function SeloAdmin() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-pink)] px-2 py-0.5 font-sans text-[11px] font-medium text-[var(--ink-soft)]">
      <ShieldCheck size={11} aria-hidden="true" />
      admin
    </span>
  );
}

function Pill({ valor, label }: { valor: number; label: string }) {
  return (
    <span className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white px-3.5 py-2">
      <span className="font-cabinet text-[18px] leading-none text-[var(--ink)]">{valor}</span>
      <span className="font-sans text-[13px] text-[var(--ink-soft)]">{label}</span>
    </span>
  );
}
