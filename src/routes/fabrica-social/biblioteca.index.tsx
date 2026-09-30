import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenTool, Send, CalendarClock, Loader2, Trash2 } from "lucide-react";
import { Card, StatusBadge, ApprovalBadge, Badge, Button } from "@/components/fabrica-social/bits";
import { PreviaArte } from "@/components/fabrica-social/PreviaArte";
import { usePosts } from "@/lib/fabrica-social/useData";
import {
  publishPostNow,
  schedulePost,
  deletePost,
  fetchConnections,
  publishToExtraPlatform,
  destinosPublicaveis,
  type PublishablePlatform,
} from "@/lib/fabrica-social/api";
import { FORMATS, PLATFORM_LABEL } from "@/lib/fabrica-social/formats";
import { useFabricaSocialWorkspace } from "@/context/fabrica-social/WorkspaceContext";
import type { Post } from "@/lib/fabrica-social/mock";

export const Route = createFileRoute("/fabrica-social/biblioteca/")({
  head: () => ({ meta: [{ title: "Biblioteca · Fábrica Social · Pólia" }] }),
  component: Biblioteca,
});

/*
  Primeira tela portada do Fábrica Social pra dentro da Central (22/09/2026).
  Lógica idêntica à original (src/pages/Biblioteca.tsx no repo separado).

  "Editar" mudou de propósito em 23/09/2026, a pedido da Sil: em vez de abrir
  o Editor de canvas (design/arte, que ainda só existe no app separado), leva
  pra edição leve daqui mesmo -- trocar foto/vídeo, título, legenda, sem
  nenhum jeito de mexer em arte. Só existe pra post que ainda não publicou
  (ver guarda em biblioteca.$postId.tsx).

  Este arquivo é biblioteca.index.tsx, e não biblioteca.tsx, de propósito:
  como biblioteca.tsx ele virava PAI de biblioteca.$postId.tsx e, sem
  <Outlet />, o clique em "Editar" trocava a URL e a lista continuava na tela.
*/

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
  Post que já saiu numa rede e ainda pode ir pra outra (pedido da Sil em
  30/09/2026): publicou no Instagram e depois quer o mesmo post no TikTok, ou o
  contrário. Só oferece rede conectada na marca e onde o post ainda não saiu --
  o que também faz deste botão o "tentar de novo" quando a segunda rede falha.
  Story fica fora do TikTok: a API dele não tem story.
*/
function PublicarEmOutraRede({ post, conectadas }: { post: Post; conectadas: string[] }) {
  const queryClient = useQueryClient();
  const publicar = useMutation({
    mutationFn: (destino: PublishablePlatform) => publishToExtraPlatform(post, destino),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
  });

  if (post.isDemo || post.status !== "published") return null;

  const jaTem = destinosPublicaveis(post.platforms);
  const faltam = (["instagram", "tiktok"] as const).filter((d) => {
    if (!conectadas.includes(d)) return false;
    if (d === "tiktok" && post.mediaType === "story") return false;
    const r = post.publishResults?.[d];
    return r ? !r.ok : !jaTem.includes(d);
  });
  if (faltam.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {faltam.map((d) => (
          <Button
            key={d}
            variant="outline"
            onClick={() =>
              window.confirm(
                `Publicar "${post.title}" no ${PLATFORM_LABEL[d]} agora?\n\nVai com a mesma mídia e a mesma legenda.`,
              ) && publicar.mutate(d)
            }
            disabled={publicar.isPending}
            className="px-2.5 py-1 text-xs"
          >
            {publicar.isPending && publicar.variables === d ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {post.publishResults?.[d] ? "Tentar de novo no" : "Publicar também no"}{" "}
            {PLATFORM_LABEL[d]}
          </Button>
        ))}
      </div>
      {publicar.isPending && (
        <p className="text-xs text-muted-foreground">
          Publicando. Vídeo pode levar alguns minutos.
        </p>
      )}
      {publicar.isError && (
        <p className="rounded bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          ⚠️ Falha ao publicar: {(publicar.error as Error).message.slice(0, 200)}
        </p>
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
  const { data: connections = [] } = useQuery({
    queryKey: ["connections", activeBrand.id],
    queryFn: () => fetchConnections(activeBrand.id),
    enabled: !activeBrand.isDemo,
  });
  const conectadas = connections.map((c) => c.platform);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-bold tracking-tight">Biblioteca</h1>
      <p className="mt-2 text-muted-foreground">
        Todos os conteúdos de <strong>{activeBrand.name}</strong> — rascunhos, agendados e
        publicados.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {brandPosts.map((p) => {
          const format = FORMATS.find((f) => f.id === p.formatId);
          // O card em si NÃO navega pra lugar nenhum -- o fluxo real (posts
          // por upload manual, o único que existe aqui) não passa pelo
          // Editor. Só quem clica em "Editar" de propósito é que sai pro
          // app separado; clicar no post não devia surpreender ninguém.
          return (
            <Card key={p.id} className="flex flex-col transition-colors hover:border-primary/50">
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
              <div>
                <div className="mt-3 flex flex-wrap items-center gap-4">
                  {p.status !== "published" && !p.isDemo && (
                    <Link
                      to="/fabrica-social/biblioteca/$postId"
                      params={{ postId: p.id }}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                    >
                      <PenTool className="h-3.5 w-3.5" /> Editar
                    </Link>
                  )}
                  <ApagarPost post={p} />
                </div>
                <PublishControls post={p} />
                <PublicarEmOutraRede post={p} conectadas={conectadas} />
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
