import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  isSameMonth,
  isSameDay,
  format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import type { SocialPost } from "@/lib/social.functions";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CriarPostManualSheet } from "@/components/admin-social/CriarPostManualSheet";
import { PostEditorSheet } from "@/components/admin-social/PostEditorSheet";
import { EstudioPauta } from "@/components/admin-social/EstudioPauta";
import { GatilhosDM } from "@/components/admin-social/GatilhosDM";
import { obterStatusTokenInstagram } from "@/lib/social-token.functions";

export const Route = createFileRoute("/social")({
  head: () => ({
    meta: [{ title: "Social · Pólia" }],
  }),
  component: AdminSocial,
});

const STATUS_LABEL: Record<string, string> = {
  rascunho: "rascunho",
  revisado: "revisado",
  aprovado: "aprovado",
  agendado: "agendado",
  publicando: "publicando",
  publicado: "publicado",
  falhou: "falhou",
  cancelado: "cancelado",
};

const TIPO_LABEL: Record<string, string> = {
  feed: "Foto única",
  carrossel: "Carrossel",
  reel: "Reel",
  story: "Story",
};

function corDoStatus(status: string): string {
  switch (status) {
    case "rascunho":
      return "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)]";
    case "revisado":
      return "border-dashed border-[var(--secondary-text)] bg-[var(--secondary-light)]/30 text-[var(--secondary-text)]";
    case "aprovado":
      return "border-[var(--ink)] bg-[var(--accent)]/25 text-[var(--ink)]";
    case "agendado":
      return "border-[var(--secondary-text)] bg-[var(--secondary-light)] text-[var(--secondary-text)] font-semibold";
    case "publicando":
      return "border-[var(--ink)] bg-[var(--surface)] text-[var(--ink)] animate-pulse";
    case "publicado":
      return "border-[var(--ink)] bg-white text-[var(--ink)] font-semibold";
    case "falhou":
      return "border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)] font-semibold";
    case "cancelado":
      return "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] line-through";
    default:
      return "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)]";
  }
}

function useDiasAteVencerToken(): number | null {
  const [dias, setDias] = useState<number | null>(null);
  useEffect(() => {
    obterStatusTokenInstagram()
      .then((r) => setDias(r.diasAteVencer))
      .catch(() => setDias(null));
  }, []);
  return dias;
}

function PostChip({ post, onClick }: { post: SocialPost; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full truncate rounded-md border px-1.5 py-0.5 text-left font-sans text-[10.5px] ${corDoStatus(post.status)}`}
    >
      {post.gancho || TIPO_LABEL[post.tipo]}
    </button>
  );
}

function AdminSocial() {
  const [mesAtual, setMesAtual] = useState(() => new Date());
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [aba, setAba] = useState<"calendario" | "fila" | "estudio" | "gatilhos">("calendario");
  const [postSelecionado, setPostSelecionado] = useState<SocialPost | null>(null);
  const [criarAberto, setCriarAberto] = useState(false);
  const diasAteVencerToken = useDiasAteVencerToken();

  async function carregar() {
    setCarregando(true);
    setErroCarregar(false);
    const { data, error } = await supabase
      .from("social_posts")
      .select("*")
      .neq("status", "cancelado")
      .order("scheduled_at", { ascending: true, nullsFirst: true });
    if (error) {
      setErroCarregar(true);
      setCarregando(false);
      return;
    }
    setPosts(data ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const postsAgendados = useMemo(
    () => (posts ?? []).filter((p) => p.scheduled_at !== null),
    [posts],
  );
  const postsSemData = useMemo(
    () =>
      (posts ?? []).filter(
        (p) =>
          p.scheduled_at === null &&
          (p.status === "rascunho" || p.status === "revisado" || p.status === "aprovado"),
      ),
    [posts],
  );

  const diasDoMes = useMemo(() => {
    const inicio = startOfWeek(startOfMonth(mesAtual), { weekStartsOn: 1 });
    const fim = endOfWeek(endOfMonth(mesAtual), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: inicio, end: fim });
  }, [mesAtual]);

  const vazio = !carregando && !erroCarregar && (posts ?? []).length === 0;

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Social</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Calendário e fila de aprovação do @usepolia.
      </p>

      {diasAteVencerToken !== null && diasAteVencerToken <= 7 && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--accent)]/20 p-4">
          <p className="font-sans text-[13px] text-[var(--ink)]">
            A conexão com o Instagram vence em {diasAteVencerToken} dia(s). Renovar agora.
          </p>
          <button className="rounded-lg border border-[var(--ink)] px-3 py-1.5 font-sans text-[12px] font-semibold text-[var(--ink)] hover:bg-white">
            Renovar
          </button>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between gap-3">
        <Tabs
          value={aba}
          onValueChange={(v) => setAba(v as "calendario" | "fila" | "estudio" | "gatilhos")}
        >
          <TabsList className="bg-[var(--surface)]">
            <TabsTrigger
              value="calendario"
              className="rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none"
            >
              Calendário
            </TabsTrigger>
            <TabsTrigger
              value="fila"
              className="rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none"
            >
              Fila
            </TabsTrigger>
            <TabsTrigger
              value="estudio"
              className="rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none"
            >
              Estúdio
            </TabsTrigger>
            <TabsTrigger
              value="gatilhos"
              className="rounded-lg px-4 py-1.5 text-[var(--muted)] data-[state=active]:bg-[var(--secondary-light)] data-[state=active]:text-[var(--secondary-text)] data-[state=active]:shadow-none"
            >
              Gatilhos
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <button
          type="button"
          onClick={() => setCriarAberto(true)}
          className="rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90"
        >
          + Criar post
        </button>
      </div>

      {aba === "estudio" && <EstudioPauta onPecaProduzida={carregar} />}
      {aba === "gatilhos" && <GatilhosDM />}

      {aba !== "estudio" && aba !== "gatilhos" && carregando && (
        <div className="space-y-3">
          <div className="h-6 w-1/3 animate-pulse rounded bg-[var(--surface)]" />
          <div className="h-64 animate-pulse rounded-xl bg-[var(--surface)]" />
        </div>
      )}

      {aba !== "estudio" && aba !== "gatilhos" && erroCarregar && (
        <div className="flex flex-col gap-3 rounded-xl border border-[var(--line)] bg-white p-6">
          <p className="font-sans text-[14px] text-[var(--ink)]">
            Não deu pra carregar a agenda. Tenta de novo.
          </p>
          <button
            type="button"
            onClick={carregar}
            className="self-start rounded-xl bg-[var(--secondary)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--secondary-ink)]"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {aba !== "estudio" && aba !== "gatilhos" && vazio && (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-[var(--line)] bg-white p-8">
          <p className="font-sans text-[14px] text-[var(--ink-soft)]">
            Nada agendado ainda. A fábrica manda os rascunhos pra cá.
          </p>
          <button
            type="button"
            onClick={() => setCriarAberto(true)}
            className="rounded-xl border border-[var(--ink)] px-4 py-2 font-sans text-[13px] font-semibold text-[var(--ink)]"
          >
            Criar post
          </button>
        </div>
      )}

      {aba !== "estudio" && aba !== "gatilhos" && !carregando && !erroCarregar && !vazio && (
        <Tabs value={aba} onValueChange={() => {}}>
          <TabsContent value="calendario" className="mt-0">
            {postsSemData.length > 0 && (
              <div className="mb-5">
                <p className="mb-2 font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
                  Sem data ({postsSemData.length})
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {postsSemData.map((post) => (
                    <button
                      key={post.id}
                      type="button"
                      onClick={() => setPostSelecionado(post)}
                      className={`w-40 flex-none truncate rounded-lg border px-3 py-2 text-left font-sans text-[12px] ${corDoStatus(post.status)}`}
                    >
                      <span className="block font-semibold">{STATUS_LABEL[post.status]}</span>
                      <span className="block truncate text-[11px] opacity-80">{post.gancho}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMesAtual((m) => addMonths(m, -1))}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1 font-sans text-[12px] text-[var(--ink-soft)] hover:bg-[var(--surface)]"
              >
                ← Anterior
              </button>
              <p className="font-sans text-[13px] font-semibold text-[var(--ink)] capitalize">
                {format(mesAtual, "MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              <button
                type="button"
                onClick={() => setMesAtual((m) => addMonths(m, 1))}
                className="rounded-lg border border-[var(--line)] px-2.5 py-1 font-sans text-[12px] text-[var(--ink-soft)] hover:bg-[var(--surface)]"
              >
                Próximo →
              </button>
            </div>

            <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-white">
              <div className="grid grid-cols-7 border-b border-[var(--line)]">
                {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
                  <div
                    key={d}
                    className="border-r border-[var(--line)] px-2 py-1.5 font-sans text-[10px] font-semibold uppercase tracking-[1px] text-[var(--muted)] last:border-r-0"
                  >
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 auto-rows-[100px]">
                {diasDoMes.map((dia) => {
                  const postsNoDia = postsAgendados.filter(
                    (p) => p.scheduled_at && isSameDay(new Date(p.scheduled_at), dia),
                  );
                  return (
                    <div
                      key={dia.toISOString()}
                      className={`flex flex-col gap-1 overflow-hidden border-b border-r border-[var(--line)] p-1.5 last:border-r-0 ${
                        isSameMonth(dia, mesAtual) ? "" : "bg-[var(--surface)]/50"
                      }`}
                    >
                      <span
                        className={`font-sans text-[11px] tabular-nums ${
                          isSameDay(dia, new Date())
                            ? "font-bold text-[var(--ink)]"
                            : "text-[var(--muted)]"
                        }`}
                      >
                        {format(dia, "d")}
                      </span>
                      {postsNoDia.map((post) => (
                        <PostChip
                          key={post.id}
                          post={post}
                          onClick={() => setPostSelecionado(post)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="fila" className="mt-0">
            <div className="flex flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-white">
              {(posts ?? []).map((post) => (
                <button
                  key={post.id}
                  type="button"
                  onClick={() => setPostSelecionado(post)}
                  className="flex items-center gap-3 border-b border-[var(--line)] p-3 text-left last:border-b-0 hover:bg-[var(--surface)]"
                >
                  <div className="aspect-[4/5] w-12 flex-none overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]">
                    {post.midias[0] && !post.midias[0].endsWith(".mp4") && (
                      <img src={post.midias[0]} alt="" className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-sans text-[13px] text-[var(--ink)]">
                      {post.gancho}
                    </p>
                    <p className="font-sans text-[11px] text-[var(--muted)]">
                      {TIPO_LABEL[post.tipo]} {post.pilar ? `· ${post.pilar}` : ""}
                    </p>
                  </div>
                  <span
                    className={`flex-none rounded-full border px-2.5 py-1 font-sans text-[10px] font-semibold uppercase tracking-[0.5px] ${corDoStatus(post.status)}`}
                  >
                    {STATUS_LABEL[post.status]}
                  </span>
                </button>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <CriarPostManualSheet
        aberto={criarAberto}
        onClose={() => setCriarAberto(false)}
        onCriado={carregar}
      />
      <PostEditorSheet
        post={postSelecionado}
        onClose={() => setPostSelecionado(null)}
        onChanged={carregar}
      />
    </div>
  );
}
