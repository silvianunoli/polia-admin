import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { moduloInfo } from "@/lib/planejamento-constants";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

// A aba "Convites" saiu daqui em 21/09/2026: virou /crm/convites, porque passou
// a decidir plano e acesso de administradora e não cabia mais numa aba.

export const Route = createFileRoute("/crm/usuarias")({
  head: () => ({
    meta: [{ title: "Usuárias · CRM Pólia" }],
  }),
  component: CrmUsuarias,
});

interface Cliente {
  id: string;
  full_name: string | null;
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

// Nomes visíveis desde 14/09/2026 (Grátis/Premium/Pro) — a chave interna
// confere/controle/projete continua em profiles.plano, nunca exibir crua.
const PLANO_LABEL: Record<string, string> = {
  confere: "Grátis",
  controle: "Premium",
  projete: "Pro",
  beta: "Beta",
};

const inputClass =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--secondary)] focus:outline-none";
const btnOutline =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)] hover:text-[var(--ink)] disabled:opacity-40";
const cardClass = "overflow-hidden rounded-2xl border border-[var(--line)] bg-white";
const thClass =
  "px-5 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]";
const tdMuted = "px-5 py-3 font-sans text-[13px] text-[var(--muted)]";

function CrmUsuarias() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  // Módulo mais avançado que cada usuária já concluiu (mesma leitura de
  // funil/painel/usuarios.$id): a coluna profiles.etapa_atual morreu na
  // migração pro Planejamento e não tem ninguém escrevendo nela.
  const [moduloPorUsuaria, setModuloPorUsuaria] = useState<Map<string, number>>(new Map());
  const [espera, setEspera] = useState<EsperaItem[]>([]);
  const [filtroStatus, setFiltroStatus] = useState("");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: profs }, { data: esperaData }, { data: secoes }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,full_name,plano,onboarding_completed,updated_at,created_at")
          .order("updated_at", { ascending: false })
          .limit(300),
        supabase
          .from("lista_espera")
          .select("id, nome, email, tipo_negocio, criado_em")
          .order("criado_em", { ascending: false })
          .limit(300),
        supabase.from("planejamento_secoes").select("user_id,modulo").eq("concluido", true),
      ]);
      setClientes((profs ?? []) as Cliente[]);
      setEspera((esperaData ?? []) as EsperaItem[]);

      const maxModuloPorUsuaria = new Map<string, number>();
      (secoes ?? []).forEach((s) => {
        const atual = maxModuloPorUsuaria.get(s.user_id) ?? 0;
        if (s.modulo > atual) maxModuloPorUsuaria.set(s.user_id, s.modulo);
      });
      setModuloPorUsuaria(maxModuloPorUsuaria);
    })();
  }, []);

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
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Quem já usa a Pólia, quem está na fila do beta e quem pode se cadastrar. Lead solto,
        parceria e pedido de serviço ficam em Contatos.
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
                  {["Cliente", "Status", "Plano", "Módulo", "Cadastro", "Ações"].map((h) => (
                    <th key={h} className={thClass}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c) => {
                  const st = STATUS_META[statusKey(c)];
                  const modulo = moduloPorUsuaria.get(c.id) ?? 0;
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
                          {PLANO_LABEL[c.plano ?? "beta"] ?? c.plano}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-sans text-[13px]">
                        {modulo > 0 ? (
                          <span
                            className="text-[var(--ink-soft)]"
                            title={`M${modulo} · ${moduloInfo(modulo).nome}`}
                          >
                            M{modulo}
                          </span>
                        ) : (
                          <span className="text-[var(--muted)]">não iniciou</span>
                        )}
                      </td>
                      <td className={tdMuted}>
                        {new Date(c.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          type="button"
                          onClick={() => navigate({ to: "/usuarios/$id", params: { id: c.id } })}
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
