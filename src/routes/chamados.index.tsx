import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { buscarUsuariaPorEmail } from "@/lib/admin-usuarias.functions";
import { toastErro } from "@/lib/toast";

export const Route = createFileRoute("/chamados/")({
  head: () => ({
    meta: [{ title: "Chamados · Pólia" }],
  }),
  component: AdminChamados,
});

interface TicketRow {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  module_ref: string | null;
  created_at: string;
  user_id: string;
  user_nome: string;
}

interface FeedbackResponse {
  id: string;
  trigger_type: string;
  context_ref: string;
  score: number;
  comment: string | null;
  created_at: string;
}

interface Contato {
  id: string;
  nome: string;
  email: string;
  assunto: string;
  mensagem: string;
  created_at: string;
}

const tabTriggerClass =
  "rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none";

// item.ref vem como "trigger_type:context_ref" (ver porEtapa) — traduz pra um
// rótulo legível na lista de CSAT.
function rotuloContexto(chave: string): string {
  const [tipo, ctx] = chave.split(":");
  if (tipo === "pulso_periodico") return "Pulso de relacionamento";
  const modulo = ctx.match(/^modulo_(\d+)$/);
  if (modulo) return `Módulo ${modulo[1]}`;
  return ctx;
}

function AdminChamados() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [filtroStatus, setFiltroStatus] = useState<"aberto" | "em_andamento" | "resolvido">(
    "aberto",
  );
  const [counts, setCounts] = useState({ aberto: 0, em_andamento: 0, resolvido: 0 });

  const [buscaEmail, setBuscaEmail] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<
    { encontrada: true; id: string; email: string; nome: string } | { encontrada: false } | null
  >(null);

  const buscarPorEmail = async (e: FormEvent) => {
    e.preventDefault();
    if (!buscaEmail.trim()) return;
    setBuscando(true);
    setResultado(null);
    try {
      const r = await buscarUsuariaPorEmail({ data: { email: buscaEmail } });
      setResultado(r);
    } catch {
      toastErro("Não consegui buscar essa usuária.");
    } finally {
      setBuscando(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id,title,status,priority,module_ref,created_at,user_id")
        .eq("status", filtroStatus)
        .order("created_at", { ascending: false });

      const userIds = Array.from(
        new Set((data ?? []).map((t: Omit<TicketRow, "user_nome">) => t.user_id)),
      );
      const { data: profs } = userIds.length
        ? await supabase.from("profiles").select("id,full_name").in("id", userIds)
        : { data: [] as { id: string; full_name: string | null }[] };
      const map = new Map(
        (profs ?? []).map(
          (p: { id: string; full_name: string | null }) =>
            [p.id, p.full_name] as [string, string | null],
        ),
      );
      setTickets(
        (data ?? []).map((t: Omit<TicketRow, "user_nome">) => ({
          ...t,
          user_nome: map.get(t.user_id) ?? "—",
        })),
      );

      const [{ count: a }, { count: e }, { count: r }] = await Promise.all([
        supabase.from("tickets").select("*", { count: "exact", head: true }).eq("status", "aberto"),
        supabase
          .from("tickets")
          .select("*", { count: "exact", head: true })
          .eq("status", "em_andamento"),
        supabase
          .from("tickets")
          .select("*", { count: "exact", head: true })
          .eq("status", "resolvido"),
      ]);
      setCounts({ aberto: a ?? 0, em_andamento: e ?? 0, resolvido: r ?? 0 });
    })();
  }, [filtroStatus]);

  const [respostas, setRespostas] = useState<FeedbackResponse[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("feedback_responses")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      setRespostas(data ?? []);
    })();
  }, []);
  const porEtapa = useMemo(() => {
    const map = new Map<string, FeedbackResponse[]>();
    respostas
      .filter((r) => r.trigger_type !== "chamado_resolvido")
      .forEach((r) => {
        const chave = `${r.trigger_type}:${r.context_ref}`;
        if (!map.has(chave)) map.set(chave, []);
        map.get(chave)!.push(r);
      });
    return Array.from(map.entries())
      .map(([ref, items]) => {
        const total = items.length;
        const s1 = items.filter((i) => i.score === 1).length;
        const s2 = items.filter((i) => i.score === 2).length;
        const s3 = items.filter((i) => i.score === 3).length;
        return {
          ref,
          total,
          score_1: s1,
          score_2: s2,
          score_3: s3,
          pct_dificil: total ? Math.round((s1 / total) * 100) : 0,
          pct_ok: total ? Math.round((s2 / total) * 100) : 0,
          pct_boa: total ? Math.round((s3 / total) * 100) : 0,
          comentarios: items
            .filter((i) => i.comment)
            .map((i) => i.comment)
            .slice(0, 3),
        };
      })
      .sort((a, b) => a.ref.localeCompare(b.ref));
  }, [respostas]);

  const [contatos, setContatos] = useState<Contato[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("contatos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      setContatos(data ?? []);
    })();
  }, []);

  return (
    <>
      <h1 className="font-cabinet mb-6 text-[40px] text-[var(--ink)]">Chamados</h1>

      <Tabs defaultValue="chamados">
        <TabsList className="mb-6 h-auto gap-1 rounded-xl border border-[var(--line)] bg-white p-1">
          <TabsTrigger value="chamados" className={tabTriggerClass}>
            Chamados
          </TabsTrigger>
          <TabsTrigger value="feedback" className={tabTriggerClass}>
            Feedback · {porEtapa.reduce((s, e) => s + e.total, 0)}
          </TabsTrigger>
          <TabsTrigger value="comunicacao" className={tabTriggerClass}>
            Comunicação · {contatos.length}
          </TabsTrigger>
        </TabsList>

        {/* CHAMADOS */}
        <TabsContent value="chamados">
          <div className="mb-6 rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
              Buscar usuária por e-mail
            </p>
            <form onSubmit={buscarPorEmail} className="flex flex-wrap gap-3">
              <input
                type="email"
                placeholder="nome@dominio.com"
                value={buscaEmail}
                onChange={(e) => setBuscaEmail(e.target.value)}
                className="min-w-[220px] flex-1 rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--secondary)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={buscando}
                className="rounded-xl bg-[var(--secondary)] px-5 py-2 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {buscando ? "Buscando…" : "Buscar"}
              </button>
            </form>
            {resultado && !resultado.encontrada && (
              <p className="mt-3 font-sans text-[13px] text-[var(--muted)]">
                Nenhuma usuária com esse e-mail.
              </p>
            )}
            {resultado && resultado.encontrada && (
              <Link
                to="/usuarios/$id"
                params={{ id: resultado.id }}
                className="mt-3 flex items-center justify-between rounded-xl border border-[var(--line)] p-3 no-underline hover:border-[var(--secondary)]"
              >
                <div>
                  <p className="font-sans text-[14px] text-[var(--ink)]">{resultado.nome}</p>
                  <p className="font-sans text-[12px] text-[var(--muted)]">{resultado.email}</p>
                </div>
                <span className="font-sans text-[13px] text-[var(--secondary-text)]">
                  Ver perfil →
                </span>
              </Link>
            )}
          </div>

          <div className="mb-6 flex gap-2">
            {(["aberto", "em_andamento", "resolvido"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFiltroStatus(s)}
                className={`rounded-full px-4 py-2 font-sans text-[13px] font-medium capitalize transition-colors ${
                  filtroStatus === s
                    ? "bg-[var(--ink)] text-white"
                    : "border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--secondary)]"
                }`}
              >
                {s.replace("_", " ")} ({counts[s]})
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {tickets.map((ticket) => (
              <div
                key={ticket.id}
                className="cursor-pointer rounded-2xl border border-[var(--line)] bg-white p-5 transition-colors hover:border-[var(--secondary)]"
                onClick={() => navigate({ to: "/chamados/$id", params: { id: ticket.id } })}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      {ticket.priority === "urgente" && (
                        <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[1px] text-[var(--danger)]">
                          urgente
                        </span>
                      )}
                      {ticket.module_ref && (
                        <span className="rounded-full bg-[var(--line)] px-2 py-0.5 font-sans text-[10px] font-medium uppercase tracking-[1px] text-[var(--ink-soft)]">
                          {ticket.module_ref}
                        </span>
                      )}
                    </div>
                    <p className="font-sans text-[15px] font-medium text-[var(--ink)]">
                      {ticket.title}
                    </p>
                    <p className="font-sans text-[13px] text-[var(--muted)]">
                      {ticket.user_nome} · {new Date(ticket.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {tickets.length === 0 && (
              <div className="rounded-2xl border border-[var(--line)] bg-white p-8 text-center">
                <p className="font-sans text-[13px] text-[var(--muted)]">
                  Nenhum chamado nesse status.
                </p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* FEEDBACK */}
        <TabsContent value="feedback">
          <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
            Por contexto · score 1=difícil 2=ok 3=boa
          </p>
          <div className="space-y-3">
            {porEtapa.length === 0 && (
              <p className="font-sans text-[13px] text-[var(--muted)]">
                Nenhum CSAT registrado ainda.
              </p>
            )}
            {porEtapa.map((item) => (
              <div key={item.ref} className="rounded-2xl border border-[var(--line)] bg-white p-5">
                <div className="mb-3 flex items-center justify-between">
                  <p className="font-sans text-[14px] font-medium text-[var(--ink)]">
                    {rotuloContexto(item.ref)}
                  </p>
                  <p
                    className="font-sans text-[11px] font-medium uppercase tracking-[1px]"
                    style={{
                      color: item.pct_dificil > 30 ? "var(--danger)" : "var(--secondary-text)",
                    }}
                  >
                    {item.pct_dificil}% difícil
                  </p>
                </div>
                <div className="mb-3 flex gap-2">
                  {[
                    {
                      label: "Difícil",
                      count: item.score_1,
                      pct: item.pct_dificil,
                      cor: "var(--danger)",
                      bg: "var(--danger-soft)",
                    },
                    {
                      label: "Ok",
                      count: item.score_2,
                      pct: item.pct_ok,
                      cor: "var(--ink-soft)",
                      bg: "var(--line)",
                    },
                    {
                      label: "Boa",
                      count: item.score_3,
                      pct: item.pct_boa,
                      cor: "var(--secondary-text)",
                      bg: "var(--secondary-light)",
                    },
                  ].map((s) => (
                    <div key={s.label} className="flex-1">
                      <div className="h-2 rounded-full" style={{ backgroundColor: s.bg }}>
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{ width: `${s.pct}%`, backgroundColor: s.cor }}
                        />
                      </div>
                      <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">
                        {s.label} · {s.count}
                      </p>
                    </div>
                  ))}
                </div>
                {item.comentarios.map((c, i) => (
                  <p key={i} className="mb-1 font-sans text-[12px] italic text-[var(--muted)]">
                    "{c}"
                  </p>
                ))}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* COMUNICAÇÃO */}
        <TabsContent value="comunicacao">
          <div className="mb-10">
            <h2 className="mb-5 text-[24px] text-[var(--ink)]">Mensagens recebidas</h2>
            <div className="space-y-3">
              {contatos.length === 0 && (
                <p className="font-sans text-[13px] text-[var(--muted)]">Nenhuma mensagem ainda.</p>
              )}
              {contatos.map((c) => (
                <div key={c.id} className="rounded-2xl border border-[var(--line)] bg-white p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-sans text-[14px] font-medium text-[var(--ink)]">
                        {c.nome} · {c.assunto}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap font-sans text-[13px] text-[var(--ink-soft)]">
                        {c.mensagem}
                      </p>
                    </div>
                    <a
                      href={`mailto:${c.email}?subject=Re: ${encodeURIComponent(c.assunto)}`}
                      className="ml-4 shrink-0 font-sans text-[13px] text-[var(--secondary-text)] hover:underline"
                    >
                      Responder →
                    </a>
                  </div>
                  <p className="mt-3 font-sans text-[11px] text-[var(--muted)]">
                    {new Date(c.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-white p-7">
            <h2 className="mb-2 text-[24px] text-[var(--ink)]">Broadcast por email</h2>
            <p className="font-sans text-[13px] text-[var(--muted)]">
              Em breve. Precisa do Resend configurado antes de existir de verdade.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}
