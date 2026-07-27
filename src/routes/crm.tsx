import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Trash2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toastErro, toastSucesso } from "@/lib/toast";
import {
  listarConvites,
  criarConvite,
  enviarConvite,
  removerConvite,
  type ConviteListItem,
} from "@/lib/convites.functions";

export const Route = createFileRoute("/crm")({
  head: () => ({
    meta: [{ title: "CRM · Pólia" }],
  }),
  component: AdminCRM,
});

interface Cliente {
  id: string;
  full_name: string | null;
  etapa_atual: number | null;
  plano: string | null;
  onboarding_completed: boolean | null;
  updated_at: string;
  created_at: string;
}

interface EsperaItem {
  id: string;
  nome: string;
  email: string;
  tipo_negocio: string | null;
  criado_em: string;
}

type StatusKey = "lead" | "ativa" | "morna" | "sumida";

function statusKey(c: Cliente): StatusKey {
  if (!c.onboarding_completed) return "lead";
  const dias = Math.floor((Date.now() - new Date(c.updated_at).getTime()) / 86_400_000);
  if (dias <= 7) return "ativa";
  if (dias > 30) return "sumida";
  return "morna";
}

// Mesma escala de 4 estados usada nos pedidos de Clientes (statusPedidoCor):
// neutro → ok (turquesa) → atenção (amarelo) → parado (vermelho).
const STATUS_META: Record<StatusKey, { label: string; className: string }> = {
  lead: { label: "Lead", className: "bg-[var(--line)] text-[var(--ink-soft)]" },
  ativa: {
    label: "Ativa",
    className: "bg-[var(--secondary-light)] text-[var(--secondary-text)]",
  },
  morna: { label: "Morna", className: "bg-[var(--highlight)] text-[var(--highlight-ink)]" },
  sumida: { label: "Sumida", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

const inputClass =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--secondary)] focus:outline-none";
const btnPrimary =
  "rounded-xl bg-[var(--secondary)] px-5 py-2.5 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50";
const btnOutline =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)] hover:text-[var(--ink)] disabled:opacity-40";
const cardClass = "overflow-hidden rounded-2xl border border-[var(--line)] bg-white";
const thClass =
  "px-5 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]";
const tdMuted = "px-5 py-3 font-sans text-[13px] text-[var(--muted)]";

function AdminCRM() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [espera, setEspera] = useState<EsperaItem[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  const [convites, setConvites] = useState<ConviteListItem[]>([]);
  const [carregandoConvites, setCarregandoConvites] = useState(true);
  const [novoEmail, setNovoEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [enviandoConvite, setEnviandoConvite] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: esperaData }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,etapa_atual,plano,onboarding_completed,updated_at,created_at")
          .order("updated_at", { ascending: false })
          .limit(300),
        supabase
          .from("lista_espera")
          .select("id, nome, email, tipo_negocio, criado_em")
          .order("criado_em", { ascending: false })
          .limit(300),
      ]);
      setClientes((profs ?? []) as Cliente[]);
      setEspera((esperaData ?? []) as EsperaItem[]);
    })();
  }, []);

  const carregarConvites = async () => {
    setCarregandoConvites(true);
    try {
      const { convites: lista } = await listarConvites();
      setConvites(lista);
    } catch {
      toastErro("Não consegui carregar os convites.");
    } finally {
      setCarregandoConvites(false);
    }
  };

  useEffect(() => {
    carregarConvites();
  }, []);

  async function handleAdicionarConvite(e: FormEvent) {
    e.preventDefault();
    const email = novoEmail.trim();
    if (!email) return;
    setEnviando(true);
    try {
      await criarConvite({ data: { email } });
      setNovoEmail("");
      toastSucesso("Convite criado.");
      carregarConvites();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui criar o convite.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleEnviarConvite(email: string) {
    setEnviandoConvite(email);
    try {
      await enviarConvite({ data: { email } });
      toastSucesso("Convite enviado.");
      carregarConvites();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui enviar o convite.");
    } finally {
      setEnviandoConvite(null);
    }
  }

  async function handleRemoverConvite(email: string) {
    if (
      !window.confirm(
        `Remover o convite de ${email}? Ela não vai conseguir se cadastrar até você liberar de novo.`,
      )
    ) {
      return;
    }
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

  const pendentesConvites = convites.filter((c) => !c.usado_em).length;

  const exportarCsvEspera = () => {
    const linhas = [["nome", "email", "tipo_negocio", "data"]];
    espera.forEach((e) => linhas.push([e.nome, e.email, e.tipo_negocio ?? "", e.criado_em]));
    const csv = linhas
      .map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lista-espera.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const contagem = useMemo(() => {
    const c: Record<StatusKey, number> = { lead: 0, ativa: 0, morna: 0, sumida: 0 };
    clientes.forEach((cl) => c[statusKey(cl)]++);
    return c;
  }, [clientes]);

  const filtrados = useMemo(() => {
    return clientes.filter((c) => {
      if (filtroStatus && statusKey(c) !== filtroStatus) return false;
      if (busca && !c.full_name?.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    });
  }, [clientes, filtroStatus, busca]);

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">CRM</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Suas clientes da Pólia, quem está na fila do beta e quem pode se cadastrar.
      </p>

      <Tabs defaultValue="clientes">
        <TabsList className="mb-6 h-auto gap-1 rounded-xl border border-[var(--line)] bg-white p-1">
          <TabsTrigger
            value="clientes"
            className="rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none"
          >
            Clientes · {clientes.length}
          </TabsTrigger>
          <TabsTrigger
            value="espera"
            className="rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none"
          >
            Lista de espera · {espera.length}
          </TabsTrigger>
          <TabsTrigger
            value="convites"
            className="rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none"
          >
            Convites · {convites.length}
          </TabsTrigger>
        </TabsList>

        {/* CLIENTES */}
        <TabsContent value="clientes">
          {/* KPI pills */}
          <div className="mb-5 flex flex-wrap gap-2">
            <KpiPill
              label="Total"
              valor={clientes.length}
              ativo={filtroStatus === ""}
              onClick={() => setFiltroStatus("")}
            />
            {(["lead", "ativa", "morna", "sumida"] as StatusKey[]).map((k) => (
              <KpiPill
                key={k}
                label={STATUS_META[k].label}
                valor={contagem[k]}
                ativo={filtroStatus === k}
                onClick={() => setFiltroStatus(filtroStatus === k ? "" : k)}
              />
            ))}
          </div>

          <input
            type="text"
            placeholder="Buscar por nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`mb-5 w-full sm:max-w-[320px] ${inputClass}`}
          />

          <div className={`overflow-x-auto ${cardClass}`}>
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {["Cliente", "Status", "Plano", "Etapa", "Cadastro", "Ações"].map((h) => (
                    <th key={h} className={thClass}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const st = STATUS_META[statusKey(c)];
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-[var(--line)] hover:bg-[var(--surface)]"
                    >
                      <td className="px-5 py-3 font-sans text-[14px] text-[var(--ink)]">
                        {c.full_name ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${st.className}`}
                        >
                          {st.label}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <span className="rounded-full bg-[var(--line)] px-2 py-1 font-mono text-[10px] uppercase tracking-[1px] text-[var(--ink-soft)]">
                          {c.plano ?? "beta"}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                        E{c.etapa_atual ?? 1}
                      </td>
                      <td className={tdMuted}>
                        {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() =>
                            navigate({ to: "/usuarios/$id", params: { id: c.id } })
                          }
                          className="font-sans text-[13px] text-[var(--secondary-text)] hover:underline"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filtrados.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]"
                    >
                      Nenhuma cliente encontrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* LISTA DE ESPERA (fila pública do beta) */}
        <TabsContent value="espera">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Quem entrou na lista de espera pública e ainda não está usando a Pólia.
            </p>
            <button
              onClick={exportarCsvEspera}
              disabled={espera.length === 0}
              className={`shrink-0 ${btnOutline}`}
            >
              Exportar CSV
            </button>
          </div>
          <div className={`overflow-x-auto ${cardClass}`}>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {["Nome", "E-mail", "Tipo de negócio", "Entrou na fila"].map((h) => (
                    <th key={h} className={thClass}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {espera.map((v) => (
                  <tr key={v.id} className="border-b border-[var(--line)]">
                    <td className="px-5 py-3 font-sans text-[14px] text-[var(--ink)]">{v.nome}</td>
                    <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                      {v.email}
                    </td>
                    <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                      {v.tipo_negocio ?? "—"}
                    </td>
                    <td className={tdMuted}>{new Date(v.criado_em).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
                {espera.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]"
                    >
                      Ninguém na fila ainda.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* CONVITES (allowlist de e-mails liberados pro cadastro) */}
        <TabsContent value="convites">
          <p className="mb-4 font-sans text-[13px] text-[var(--muted)]">
            {convites.length} e-mails liberados · {pendentesConvites} ainda não usaram o convite. O
            cadastro é fechado: só quem está aqui consegue criar conta.
          </p>

          <form onSubmit={handleAdicionarConvite} className="mb-6 flex gap-3">
            <input
              type="email"
              placeholder="email@dominio.com"
              value={novoEmail}
              onChange={(e) => setNovoEmail(e.target.value)}
              disabled={enviando}
              className={`min-w-[220px] flex-1 ${inputClass}`}
            />
            <button type="submit" disabled={enviando || !novoEmail.trim()} className={btnPrimary}>
              {enviando ? "Adicionando..." : "Liberar e-mail"}
            </button>
          </form>

          <div className={`overflow-x-auto ${cardClass}`}>
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  {["E-mail", "Status", "Criado em", "Usado em", ""].map((h) => (
                    <th key={h} className={thClass}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {convites.map((c) => (
                  <tr
                    key={c.email}
                    className="border-b border-[var(--line)] hover:bg-[var(--surface)]"
                  >
                    <td className="px-5 py-3 font-sans text-[14px] text-[var(--ink)]">{c.email}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 font-sans text-[11px] font-medium ${
                          c.usado_em
                            ? "bg-[var(--secondary-light)] text-[var(--secondary-text)]"
                            : c.enviado_em
                              ? "bg-[var(--line)] text-[var(--ink-soft)]"
                              : "bg-[var(--highlight)] text-[var(--highlight-ink)]"
                        }`}
                      >
                        {c.usado_em ? "Usado" : c.enviado_em ? "Convite enviado" : "Pendente"}
                      </span>
                    </td>
                    <td className={tdMuted}>{new Date(c.criado_em).toLocaleDateString("pt-BR")}</td>
                    <td className={tdMuted}>
                      {c.usado_em ? new Date(c.usado_em).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-3">
                        {!c.usado_em && (
                          <button
                            type="button"
                            onClick={() => handleEnviarConvite(c.email)}
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
                          onClick={() => handleRemoverConvite(c.email)}
                          disabled={removendo === c.email}
                          aria-label={`Remover convite de ${c.email}`}
                          className="text-[var(--muted)] hover:text-[var(--danger)] disabled:opacity-30"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!carregandoConvites && convites.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-8 text-center font-sans text-[13px] text-[var(--muted)]"
                    >
                      Nenhum convite ainda.
                    </td>
                  </tr>
                )}
                {carregandoConvites && (
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
        </TabsContent>
      </Tabs>
    </>
  );
}

function KpiPill({
  label,
  valor,
  ativo,
  onClick,
}: {
  label: string;
  valor: number;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 transition-colors ${
        ativo
          ? "border-[var(--secondary)] bg-[var(--secondary-light)]"
          : "border-[var(--line)] bg-white hover:border-[var(--secondary)]"
      }`}
    >
      <span
        className={`font-cabinet text-[18px] leading-none ${ativo ? "text-[var(--secondary-text)]" : "text-[var(--ink)]"}`}
      >
        {valor}
      </span>
      <span className="font-sans text-[13px] text-[var(--ink-soft)]">{label}</span>
    </button>
  );
}
