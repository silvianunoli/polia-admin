import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Download, MessageCircle, Search } from "lucide-react";
import { listarContatos, STATUS_CONTATO, type Contato } from "@/lib/crm.functions";
import { FormularioContato } from "@/components/crm/FormularioContato";
import { toastErro } from "@/lib/toast";
import { baixarCsv, gerarCsv } from "@/lib/csv";
import {
  btnOutline,
  btnPrimary,
  cardClass,
  formatarData,
  formatarTelefone,
  inputClass,
  linkWhatsApp,
  ORIGEM_LABEL,
  rotulo,
  STATUS_META,
  tdClass,
  tdMuted,
  thClass,
} from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/contatos/")({
  // Campos opcionais de verdade: se fossem sempre devolvidos, todo Link pra
  // /crm/contatos passaria a exigir search.
  validateSearch: (busca: Record<string, unknown>): { status?: string; tag?: string } => ({
    ...(typeof busca.status === "string" ? { status: busca.status } : {}),
    ...(typeof busca.tag === "string" ? { tag: busca.tag } : {}),
  }),
  head: () => ({ meta: [{ title: "Contatos · CRM Pólia" }] }),
  component: CrmContatos,
});

function CrmContatos() {
  const { status: statusInicial, tag: tagInicial } = Route.useSearch();
  const navigate = useNavigate();

  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState(statusInicial ?? "");
  const [origem, setOrigem] = useState("");
  const [tag, setTag] = useState(tagInicial ?? "");
  const [formAberto, setFormAberto] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await listarContatos();
      setContatos(r.contatos);
    } catch {
      toastErro("Não consegui carregar os contatos.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  useEffect(() => {
    setStatus(statusInicial ?? "");
    setTag(tagInicial ?? "");
  }, [statusInicial, tagInicial]);

  const origens = useMemo(
    () => Array.from(new Set(contatos.map((c) => c.origem))).sort(),
    [contatos],
  );
  const tags = useMemo(
    () => Array.from(new Set(contatos.flatMap((c) => c.tags))).sort(),
    [contatos],
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return contatos.filter((c) => {
      if (status && c.status !== status) return false;
      if (origem && c.origem !== origem) return false;
      if (tag && !c.tags.includes(tag)) return false;
      if (!termo) return true;
      return (
        c.nome.toLowerCase().includes(termo) ||
        (c.email ?? "").toLowerCase().includes(termo) ||
        (c.telefone ?? "").includes(termo.replace(/\D/g, "")) ||
        (c.negocio ?? "").toLowerCase().includes(termo)
      );
    });
  }, [contatos, busca, status, origem, tag]);

  function exportar() {
    const csv = gerarCsv(
      ["nome", "email", "whatsapp", "negocio", "status", "origem", "tags", "ultimo_contato"],
      filtrados.map((c) => [
        c.nome,
        c.email ?? "",
        c.telefone ?? "",
        c.negocio ?? "",
        rotulo(
          Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [k, v.label])),
          c.status,
        ),
        rotulo(ORIGEM_LABEL, c.origem),
        c.tags.join(" | "),
        c.ultimo_contato_em ?? "",
      ]),
    );
    baixarCsv("contatos-polia.csv", csv);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-[14px] text-[var(--muted)]">
          {filtrados.length} de {contatos.length} contato(s).
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportar}
            className={`inline-flex items-center gap-2 ${btnOutline}`}
          >
            <Download size={14} />
            Baixar CSV
          </button>
          <button
            type="button"
            onClick={() => setFormAberto((v) => !v)}
            className={`inline-flex items-center gap-2 ${btnPrimary}`}
          >
            <Plus size={15} />
            {formAberto ? "Fechar" : "Novo contato"}
          </button>
        </div>
      </div>

      {formAberto && (
        <FormularioContato
          onSalvo={(id) => {
            setFormAberto(false);
            carregar();
            navigate({ to: "/crm/contatos/$id", params: { id } });
          }}
          onCancelar={() => setFormAberto(false)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1 sm:max-w-[340px]">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, e-mail, WhatsApp ou negócio"
            className={`${inputClass} pl-9`}
          />
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={`${inputClass} w-auto`}
          aria-label="Filtrar por status"
        >
          <option value="">Todos os status</option>
          {STATUS_CONTATO.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>

        <select
          value={origem}
          onChange={(e) => setOrigem(e.target.value)}
          className={`${inputClass} w-auto`}
          aria-label="Filtrar por origem"
        >
          <option value="">Toda origem</option>
          {origens.map((o) => (
            <option key={o} value={o}>
              {rotulo(ORIGEM_LABEL, o)}
            </option>
          ))}
        </select>

        {tags.length > 0 && (
          <select
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className={`${inputClass} w-auto`}
            aria-label="Filtrar por marcador"
          >
            <option value="">Todos os marcadores</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className={`overflow-x-auto ${cardClass}`}>
        <table className="w-full min-w-[840px]">
          <thead>
            <tr className="border-b border-[var(--line)]">
              {["Contato", "Onde está", "Origem", "Último contato", ""].map((h) => (
                <th key={h} className={thClass}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtrados.map((c) => {
              const meta = STATUS_META[c.status];
              const wa = linkWhatsApp(c.telefone);
              return (
                <tr key={c.id} className="border-b border-[var(--line)] hover:bg-[var(--surface)]">
                  <td className={tdClass}>
                    <Link
                      to="/crm/contatos/$id"
                      params={{ id: c.id }}
                      className="font-medium text-[var(--ink)] no-underline hover:underline"
                    >
                      {c.nome}
                    </Link>
                    <p className="font-sans text-[12px] text-[var(--muted)]">
                      {c.email ?? formatarTelefone(c.telefone)}
                      {c.negocio ? ` · ${c.negocio}` : ""}
                    </p>
                    {c.tags.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-[var(--surface-pink)] px-2 py-0.5 font-sans text-[11px] text-[var(--ink-soft)]"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className={tdClass}>
                    <span
                      className={`inline-block rounded-full px-2.5 py-1 font-sans text-[12px] ${meta.className}`}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className={tdMuted}>{rotulo(ORIGEM_LABEL, c.origem)}</td>
                  <td className={tdMuted}>{formatarData(c.ultimo_contato_em)}</td>
                  <td className="px-5 py-3 text-right">
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        title="Abrir conversa no WhatsApp"
                        className="inline-flex items-center gap-1 font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
                      >
                        <MessageCircle size={14} />
                        WhatsApp
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
            {!carregando && filtrados.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-5 py-10 text-center font-sans text-[14px] text-[var(--muted)]"
                >
                  {contatos.length === 0
                    ? "Nenhum contato ainda. Use Puxar das iscas na visão geral, ou cadastre à mão."
                    : "Nada com esses filtros."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
