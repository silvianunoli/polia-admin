import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PenTool, Send, CalendarClock, Loader2, Trash2, ExternalLink } from "lucide-react";
import { Card, StatusBadge, ApprovalBadge, Badge, Button } from "@/components/fabrica-social/bits";
import { PreviaArte } from "@/components/fabrica-social/PreviaArte";
import { usePosts } from "@/lib/fabrica-social/useData";
import { publishPostNow, schedulePost, deletePost } from "@/lib/fabrica-social/api";
import { FORMATS, PLATFORM_LABEL } from "@/lib/fabrica-social/formats";
import { useFabricaSocialWorkspace } from "@/context/fabrica-social/WorkspaceContext";
import type { Post } from "@/lib/fabrica-social/mock";

export const Route = createFileRoute("/fabrica-social/biblioteca")({
  head: () => ({ meta: [{ title: "Biblioteca · Fábrica Social · Pólia" }] }),
  component: Biblioteca,
});

/*
  Primeira tela portada do Fábrica Social pra dentro da Central (22/09/2026).
  Lógica idêntica à original (src/pages/Biblioteca.tsx no repo separado) —
  a única mudança de comportamento é o "Editar": o Editor (canvas Fabric.js)
  ainda não foi portado, então por ora ele abre o app separado numa aba nova
  em vez de linkar pra uma rota que não existe aqui. Ver §Fábrica Social no
  CLAUDE.md pra o que falta portar.
*/
const APP_SEPARADO =
  import.meta.env.VITE_FABRICA_SOCIAL_APP_URL || "https://app.silvianunoli.com.br";

function abrirNoEditor(postId: string) {
  window.open(`${APP_SEPARADO}/editor?post=${postId}`, "_blank", "noopener,noreferrer");
}

function PublishControls({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const [when, setWhen] = useState("");

  const publish = useMutation({
    mutationFn: () => publishPostNow(post.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });
  const schedule = useMutation({
    mutationFn: () => schedulePost(post.id, new Date(when).toISOString()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  if (post.isDemo || post.status === "published" || post.status === "generating") return null;

  if (!post.imageUrl) {
    return (
      <p className="mt-2 rounded bg-muted px-2 py-1.5 text-xs text-muted-foreground">
        🖼️ Para publicar, abra no Editor e clique em <strong>Exportar arte</strong>.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {post.status === "scheduled" && post.scheduledFor && (
        <p className="text-xs text-primary">
          ⏰ Agendado para{" "}
          {new Date(post.scheduledFor).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          — o robô publica sozinho.
        </p>
      )}
      {post.publishError && (
        <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          ⚠️ Falha ao publicar: {post.publishError.slice(0, 140)}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={() => publish.mutate()}
          disabled={publish.isPending}
          className="px-2.5 py-1 text-xs"
        >
          {publish.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          Publicar agora
        </Button>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="rounded-md border bg-card px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-primary/40"
        />
        <Button
          variant="outline"
          onClick={() => schedule.mutate()}
          disabled={!when || schedule.isPending}
          className="px-2.5 py-1 text-xs"
        >
          {schedule.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CalendarClock className="h-3.5 w-3.5" />
          )}
          Agendar
        </Button>
      </div>
      {publish.isError && (
        <p className="text-xs text-destructive">{(publish.error as Error).message}</p>
      )}
    </div>
  );
}

/*
  Apagar é a única ação irreversível da tela, então o aviso muda conforme o
  estado: num post já publicado o risco não é perder a arte, é achar que saiu
  do Instagram. Um texto genérico ("tem certeza?") esconderia justamente isso.
*/
function ApagarPost({ post }: { post: Post }) {
  const queryClient = useQueryClient();
  const remover = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["calendar"] }),
      ]),
  });

  if (post.isDemo) return null;

  const aviso =
    post.status === "published"
      ? `Apagar "${post.title}" da Biblioteca?\n\nEste post JÁ FOI PUBLICADO e continua no Instagram — apagar aqui não o remove de lá.`
      : `Apagar "${post.title}"?\n\nA arte e os arquivos vão junto, e não dá para desfazer.${
          post.status === "scheduled" ? "\n\nEle está agendado: não vai mais ao ar." : ""
        }`;

  return (
    <>
      <button
        onClick={() => window.confirm(aviso) && remover.mutate()}
        disabled={remover.isPending}
        title="Apagar post"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive disabled:opacity-50"
      >
        {remover.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="h-3.5 w-3.5" />
        )}
        Apagar
      </button>
      {remover.isError && (
        <p className="mt-1 w-full text-xs text-destructive">
          {(remover.error as Error).message === "read_only_post"
            ? "Post de demonstração não pode ser apagado."
            : (remover.error as Error).message}
        </p>
      )}
    </>
  );
}

function Biblioteca() {
  const { activeBrand } = useFabricaSocialWorkspace();
  const { data: brandPosts = [] } = usePosts(activeBrand.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <h1 className="font-cabinet text-[28px] text-[var(--ink)]">Biblioteca</h1>
      <p className="mt-2 text-[15px] text-[var(--ink-soft)]">
        Todos os conteúdos de <strong>{activeBrand.name}</strong> — rascunhos, agendados e
        publicados.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {brandPosts.map((p) => {
          const format = FORMATS.find((f) => f.id === p.formatId);
          return (
            <Card
              key={p.id}
              className="flex flex-col transition-colors hover:border-primary/50"
              onClick={() => abrirNoEditor(p.id)}
            >
              <PreviaArte
                post={p}
                width={format?.width ?? 1080}
                height={format?.height ?? 1080}
                className="mb-3"
              />
              <p className="font-medium leading-snug">{p.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.caption}</p>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={p.status} />
                <ApprovalBadge state={p.approvalState} />
                {/*
                  O selo da rede muda de cor conforme o resultado da publicação
                  naquele destino: verde saiu, vermelho falhou. Um post pode ter
                  saído no Instagram e falhado no TikTok — o status geral
                  ("Agendado", com erro) não conta essa metade.
                */}
                {p.platforms.map((pl) => {
                  const r = p.publishResults?.[pl];
                  const tone = !r ? "neutral" : r.ok ? "green" : "red";
                  const privado = r?.ok && r.privacy && r.privacy !== "PUBLIC_TO_EVERYONE";
                  return (
                    <Badge key={pl} tone={tone}>
                      {PLATFORM_LABEL[pl]}
                      {r?.ok ? " ✓" : r ? " ✗" : ""}
                      {privado ? " · privado" : ""}
                    </Badge>
                  );
                })}
              </div>
              {p.clientComment && (
                <p className="mt-2 rounded bg-orange-500/10 px-2 py-1 text-xs text-orange-700 dark:text-orange-400">
                  💬 {p.clientComment}
                </p>
              )}
              {/*
                O card inteiro abre o Editor (ainda no app separado), então
                tudo que é ação própria para de propagar aqui — senão apagar ou
                agendar abriria a aba nova por cima da própria ação.
              */}
              <div onClick={(e) => e.stopPropagation()}>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  <button
                    type="button"
                    onClick={() => abrirNoEditor(p.id)}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    <PenTool className="h-3.5 w-3.5" /> Editar
                    <ExternalLink className="h-3 w-3 opacity-60" aria-label="abre em outra aba" />
                  </button>
                  <ApagarPost post={p} />
                </div>
                <PublishControls post={p} />
              </div>
            </Card>
          );
        })}
        {brandPosts.length === 0 && (
          <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>
        )}
      </div>
    </div>
  );
}
