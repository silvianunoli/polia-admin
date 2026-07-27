import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAcaoAdmin } from "@/lib/audit-log";
import { toastErro } from "@/lib/toast";

export const Route = createFileRoute("/chamados/$id")({
  head: () => ({
    meta: [{ title: "Chamados · Pólia" }],
  }),
  component: AdminTicket,
});

interface Ticket {
  id: string;
  title: string;
  body: string;
  status: string;
  module_ref: string | null;
  created_at: string;
  user_id: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  author_id: string;
  author_role: string;
  body: string;
  created_at: string;
}

function AdminTicket() {
  const { id } = Route.useParams();
  // undefined = ainda buscando; null = buscou e não achou (id inválido, RLS).
  const [ticket, setTicket] = useState<Ticket | null | undefined>(undefined);
  const [mensagens, setMensagens] = useState<TicketMessage[]>([]);
  const [resposta, setResposta] = useState("");
  const [userNome, setUserNome] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resolvendo, setResolvendo] = useState(false);

  const carregar = async () => {
    const { data: t } = await supabase.from("tickets").select("*").eq("id", id).maybeSingle();
    setTicket(t ?? null);
    if (t?.user_id) {
      const { data: p } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", t.user_id)
        .maybeSingle();
      setUserNome(p?.full_name ?? "—");
    }
    const { data: msgs } = await supabase
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", id)
      .order("created_at", { ascending: true });
    setMensagens(msgs ?? []);
  };

  useEffect(() => {
    carregar();
  }, [id]);

  const enviarResposta = async () => {
    if (!resposta.trim()) return;
    setEnviando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("sem sessão");
      const { error } = await supabase.from("ticket_messages").insert({
        ticket_id: id,
        author_id: u.user.id,
        author_role: "admin",
        body: resposta,
      });
      if (error) throw error;
      await supabase
        .from("tickets")
        .update({ status: "em_andamento" })
        .eq("id", id)
        .eq("status", "aberto");
      // Só limpa o campo depois de confirmar que salvou — senão uma falha de
      // rede apaga o que a admin escreveu sem aviso.
      setResposta("");
      await carregar();
    } catch {
      toastErro("Não consegui enviar essa resposta. Tenta de novo.");
    } finally {
      setEnviando(false);
    }
  };

  const resolverTicket = async () => {
    setResolvendo(true);
    try {
      const { error } = await supabase
        .from("tickets")
        .update({ status: "resolvido", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      await logAcaoAdmin("resolver_chamado", id, { titulo: ticket?.title });
      await carregar();
    } catch {
      toastErro("Não consegui marcar como resolvido. Tenta de novo.");
    } finally {
      setResolvendo(false);
    }
  };

  if (ticket === undefined) {
    return <p className="font-sans text-[var(--muted)]">Carregando…</p>;
  }

  if (ticket === null) {
    return (
      <div>
        <p className="font-sans text-[15px] text-[var(--ink-soft)]">
          Não achei esse chamado.{" "}
          <Link to="/chamados" className="text-[var(--secondary-text)] hover:underline">
            ← Voltar aos chamados
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-[760px]">
      <Link
        to="/chamados"
        className="mb-3 inline-block font-sans text-[13px] text-[var(--secondary-text)] hover:underline"
      >
        ← Chamados
      </Link>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="font-cabinet text-[32px] text-[var(--ink)]">{ticket.title}</h1>
          <p className="font-sans text-[13px] text-[var(--muted)]">
            {userNome} · {ticket.module_ref ?? "sem contexto"} ·{" "}
            {new Date(ticket.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        {ticket.status !== "resolvido" && (
          <button
            onClick={resolverTicket}
            disabled={resolvendo}
            className="rounded-xl bg-[var(--secondary)] px-5 py-2 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {resolvendo ? "Resolvendo…" : "Resolver"}
          </button>
        )}
      </div>

      <div className="mb-6 rounded-2xl border border-[var(--line)] bg-white p-5">
        <p className="whitespace-pre-wrap font-sans text-[14px] text-[var(--ink)]">{ticket.body}</p>
      </div>

      <div className="mb-6 space-y-4">
        {mensagens.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.author_role === "admin" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl p-5 ${
                msg.author_role === "admin"
                  ? "bg-[var(--ink)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--ink)]"
              }`}
            >
              <p className="mb-2 whitespace-pre-wrap font-sans text-[14px] leading-relaxed">
                {msg.body}
              </p>
              <p
                className={`font-sans text-[11px] ${
                  msg.author_role === "admin" ? "text-white/55" : "text-[var(--muted)]"
                }`}
              >
                {msg.author_role === "admin" ? "Você" : userNome} ·{" "}
                {new Date(msg.created_at).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>
        ))}
      </div>

      {ticket.status !== "resolvido" && (
        <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
          <textarea
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            placeholder="Escreva sua resposta…"
            aria-label="Escreva sua resposta"
            rows={4}
            className="mb-4 w-full resize-none font-sans text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)]"
          />
          <div className="flex justify-end">
            <button
              onClick={enviarResposta}
              disabled={!resposta.trim() || enviando}
              className="rounded-xl bg-[var(--secondary)] px-6 py-2.5 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {enviando ? "Enviando…" : "Enviar resposta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
