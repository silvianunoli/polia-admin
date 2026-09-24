import { useMemo, useState, type DragEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Loader2,
  CalendarClock,
  Lightbulb,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Callout } from "@/components/fabrica-social/Callout";
import { Button, Card } from "@/components/fabrica-social/bits";
import { useCalendarEntries, usePosts } from "@/lib/fabrica-social/useData";
import { useFabricaSocialWorkspace } from "@/context/fabrica-social/WorkspaceContext";
import {
  createCalendarEntry,
  moveCalendarEntry,
  deleteCalendarEntry,
  reschedulePost,
  publishPostNow,
  deletePost,
} from "@/lib/fabrica-social/api";
import { fabricaSocialNaoConfigurado as isMockMode } from "@/lib/fabrica-social/supabase";
import { dataLocal, horaLocal } from "@/lib/fabrica-social/tempo";
import { cn } from "@/lib/fabrica-social/cn";
import type { CalendarEntry, Post } from "@/lib/fabrica-social/mock";

export const Route = createFileRoute("/fabrica-social/calendario")({
  head: () => ({ meta: [{ title: "Calendário · Fábrica Social · Pólia" }] }),
  component: Calendario,
});

/*
  Quarta tela portada do Fábrica Social pra dentro da Central (24/09/2026) —
  mesma lógica do repo original (src/pages/Calendario.tsx). Duas mudanças:

  1. "Abrir"/clicar num post agendado leva pra edição leve daqui mesmo
     (/fabrica-social/biblioteca/$postId), não pro Editor de canvas no app
     separado -- mesmo motivo da mudança em Biblioteca.
  2. "Gerar mês com IA" nem chegou a ser portado: já estava fora do menu no
     original (ver comentário no PageShell de lá) por causa dos modelos por
     marca ainda incompletos -- sem sentido portar um botão que nem lá está
     ligado.

  O calendário tem DUAS naturezas de item:
    PAUTA          (`fs_calendar_entries`) -- ideia marcada pra um dia, sem
                   peça ainda.
    POST AGENDADO  (`fs_posts.scheduled_for`) -- peça pronta com hora
                   marcada, o que o cron de publicação lê.
*/

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

type Item = {
  key: string;
  tipo: "pauta" | "post";
  id: string;
  dia: number;
  titulo: string;
  hora?: string;
  status?: string;
  postId?: string;
  /** Motivo da última falha de publicação — pinta o item de vermelho. */
  erro?: string;
};

/** yyyy-mm-dd no fuso local. `toISOString` devolve UTC e erra o dia à noite. */
function ymd(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function NovaPauta({
  data,
  brandId,
  onDone,
}: {
  data: string;
  brandId: string;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [resumo, setResumo] = useState("");

  const criar = useMutation({
    mutationFn: () =>
      createCalendarEntry({
        brandId,
        date: data,
        title: titulo.trim(),
        summary: resumo.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calendar", brandId] });
      onDone();
    },
  });

  const input =
    "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <Card className="space-y-3 border-primary/40">
      <p className="font-semibold">Nova pauta · {data.split("-").reverse().join("/")}</p>
      <input
        autoFocus
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="O que este post defende, em uma frase"
        className={input}
      />
      <textarea
        value={resumo}
        onChange={(e) => setResumo(e.target.value)}
        rows={3}
        placeholder="(opcional) o ângulo: para quem, contra o quê, com que prova"
        className={input}
      />
      {criar.isError && (
        <p className="text-xs text-destructive">{(criar.error as Error).message}</p>
      )}
      <div className="flex gap-2">
        <Button onClick={() => criar.mutate()} disabled={!titulo.trim() || criar.isPending}>
          {criar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Marcar
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </Card>
  );
}

function Calendario() {
  const { activeBrand } = useFabricaSocialWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: calendarEntries = [] } = useCalendarEntries(activeBrand.id);
  const { data: posts = [] } = usePosts(activeBrand.id);

  const [cursor, setCursor] = useState(() => {
    const hoje = new Date();
    return new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  });
  const [novaEm, setNovaEm] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState<Item | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroPub, setErroPub] = useState<string | null>(null);

  const hoje = new Date();
  const ehMesAtual =
    hoje.getFullYear() === cursor.getFullYear() && hoje.getMonth() === cursor.getMonth();

  const { cells, monthLabel } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const first = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = first.getDay();
    const cells: (number | null)[] = [
      ...Array.from({ length: lead }, () => null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    return { cells, monthLabel };
  }, [cursor]);

  const itensPorDia = useMemo(() => {
    const map = new Map<number, Item[]>();
    const noMes = (d: Date) =>
      d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth();
    const add = (dia: number, item: Item) => map.set(dia, [...(map.get(dia) ?? []), item]);

    for (const e of calendarEntries as CalendarEntry[]) {
      if (e.brandId !== activeBrand.id) continue;
      const d = new Date(e.date + "T00:00:00");
      if (!noMes(d)) continue;
      add(d.getDate(), {
        key: `pauta-${e.id}`,
        tipo: "pauta",
        id: e.id,
        dia: d.getDate(),
        titulo: e.title,
        postId: e.postId,
      });
    }

    for (const p of posts as Post[]) {
      if (!p.scheduledFor) continue;
      const d = new Date(p.scheduledFor);
      if (!noMes(d)) continue;
      add(d.getDate(), {
        key: `post-${p.id}`,
        tipo: "post",
        id: p.id,
        dia: d.getDate(),
        titulo: p.title,
        hora: horaLocal(p.scheduledFor),
        status: p.status,
        postId: p.id,
        erro: p.status !== "published" ? p.publishError : undefined,
      });
    }

    for (const [, lista] of map) lista.sort((a, b) => (a.hora ?? "").localeCompare(b.hora ?? ""));
    return map;
  }, [activeBrand.id, cursor, calendarEntries, posts]);

  const total = useMemo(
    () => [...itensPorDia.values()].reduce((n, l) => n + l.length, 0),
    [itensPorDia],
  );

  const falhas = useMemo(
    () =>
      (posts as Post[])
        .filter((p) => p.publishError && p.status !== "published")
        .sort((a, b) => (a.scheduledFor ?? "").localeCompare(b.scheduledFor ?? "")),
    [posts],
  );

  const retentar = useMutation({
    mutationFn: (postId: string) => publishPostNow(postId),
    onMutate: () => setErroPub(null),
    onError: (e) => setErroPub((e as Error).message),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["posts", activeBrand.id] }),
  });

  const apagar = useMutation({
    mutationFn: (postId: string) => deletePost(postId),
    onMutate: () => setErroPub(null),
    onError: (e) => setErroPub((e as Error).message),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["posts", activeBrand.id] }),
        queryClient.invalidateQueries({ queryKey: ["calendar", activeBrand.id] }),
      ]),
  });

  const mover = useMutation({
    mutationFn: async ({ item, data }: { item: Item; data: string }) => {
      if (item.tipo === "pauta") await moveCalendarEntry(item.id, data);
      else await reschedulePost(item.id, data, item.hora ? `${item.hora}:00` : undefined);
    },
    onMutate: () => setErro(null),
    onError: (e) => setErro((e as Error).message),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["calendar", activeBrand.id] }),
        queryClient.invalidateQueries({ queryKey: ["posts", activeBrand.id] }),
      ]),
  });

  const remover = useMutation({
    mutationFn: (id: string) => deleteCalendarEntry(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calendar", activeBrand.id] }),
  });

  function soltarEm(dia: number) {
    return (ev: DragEvent) => {
      ev.preventDefault();
      if (!arrastando) return;
      const data = ymd(cursor.getFullYear(), cursor.getMonth(), dia);
      if (arrastando.dia !== dia) mover.mutate({ item: arrastando, data });
      setArrastando(null);
    };
  }

  function abrirPost(postId: string) {
    navigate({ to: "/fabrica-social/biblioteca/$postId", params: { postId } });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-bold tracking-tight">Calendário</h1>
      <p className="mt-2 text-muted-foreground">
        {total} item(ns) em {monthLabel} — pautas marcadas e posts agendados da {activeBrand.name}.
      </p>

      <div className="mb-4 mt-8 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="rounded-md p-1.5 hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="min-w-40 text-center font-medium capitalize">{monthLabel}</span>
        <button
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="rounded-md p-1.5 hover:bg-accent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {!ehMesAtual && (
          <button
            onClick={() => setCursor(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}
            className="rounded-md border px-2 py-1 text-xs hover:bg-accent"
          >
            Hoje
          </button>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Lightbulb className="h-3.5 w-3.5 text-primary" /> pauta
          </span>
          <span className="flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> post
            agendado
          </span>
        </span>
      </div>

      {erro && (
        <div className="mb-3">
          <Callout emoji="⚠️">Não consegui remarcar: {erro}</Callout>
        </div>
      )}

      {falhas.length > 0 && (
        <div className="mb-4 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {falhas.length === 1
              ? "1 post não foi publicado"
              : `${falhas.length} posts não foram publicados`}
          </p>
          {falhas.map((p) => (
            <div key={p.id} className="rounded-md border bg-card p-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.title}</span>
                {p.scheduledFor && (
                  <span className="text-xs text-muted-foreground">
                    {dataLocal(p.scheduledFor)} às {horaLocal(p.scheduledFor)}
                  </span>
                )}
                <div className="ml-auto flex gap-1.5">
                  <Button
                    variant="ghost"
                    onClick={() =>
                      window.confirm(`Apagar "${p.title}"? A arte e os arquivos vão junto.`) &&
                      apagar.mutate(p.id)
                    }
                    disabled={apagar.isPending && apagar.variables === p.id}
                  >
                    <Trash2 className="h-4 w-4" /> Apagar
                  </Button>
                  <Button variant="ghost" onClick={() => abrirPost(p.id)}>
                    Abrir
                  </Button>
                  <Button
                    onClick={() => retentar.mutate(p.id)}
                    disabled={retentar.isPending && retentar.variables === p.id}
                  >
                    {retentar.isPending && retentar.variables === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    Publicar agora
                  </Button>
                </div>
              </div>
              <p className="mt-1 break-words text-xs text-muted-foreground">{p.publishError}</p>
            </div>
          ))}
          {erroPub && <p className="text-xs text-destructive">Falhou de novo: {erroPub}</p>}
          <p className="text-xs text-muted-foreground">
            O agendamento tenta duas vezes e depois para. Corrija o que estiver apontado acima e
            publique na mão — isso devolve ao post o direito de tentar sozinho de novo.
          </p>
        </div>
      )}

      {novaEm && !isMockMode && (
        <div className="mb-4">
          <NovaPauta data={novaEm} brandId={activeBrand.id} onDone={() => setNovaEm(null)} />
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            const ehHoje = ehMesAtual && day === hoje.getDate();
            return (
              <div
                key={i}
                onDragOver={(e) => day !== null && e.preventDefault()}
                onDrop={day !== null ? soltarEm(day) : undefined}
                className={cn(
                  "group min-h-24 border-b border-r p-1.5 text-sm [&:nth-child(7n)]:border-r-0",
                  day === null && "bg-muted/30",
                  arrastando && day !== null && "hover:bg-primary/5",
                )}
              >
                {day !== null && (
                  <>
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "text-xs text-muted-foreground",
                          ehHoje &&
                            "rounded bg-primary px-1.5 py-0.5 font-semibold text-primary-foreground",
                        )}
                      >
                        {day}
                      </span>
                      {!isMockMode && (
                        <button
                          onClick={() =>
                            setNovaEm(ymd(cursor.getFullYear(), cursor.getMonth(), day))
                          }
                          title="Marcar pauta neste dia"
                          className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="mt-1 space-y-1">
                      {(itensPorDia.get(day) ?? []).map((it) => (
                        <div
                          key={it.key}
                          draggable={!isMockMode}
                          onDragStart={() => setArrastando(it)}
                          onDragEnd={() => setArrastando(null)}
                          onClick={() => it.postId && abrirPost(it.postId)}
                          title={
                            it.erro
                              ? `Não publicou: ${it.erro}`
                              : it.hora
                                ? `${it.hora} · ${it.titulo}`
                                : it.titulo
                          }
                          className={cn(
                            "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-xs font-medium",
                            it.postId ? "cursor-pointer" : "cursor-grab",
                            it.erro
                              ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                              : it.tipo === "post"
                                ? "bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-400"
                                : "bg-primary/15 text-primary hover:bg-primary/25",
                          )}
                        >
                          {it.erro && <AlertTriangle className="h-3 w-3 shrink-0" />}
                          {it.hora && <span className="shrink-0 opacity-70">{it.hora}</span>}
                          <span className="truncate">{it.titulo}</span>
                          {it.tipo === "pauta" && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm(`Remover a pauta "${it.titulo}"?`))
                                  remover.mutate(it.id);
                              }}
                              title="Remover pauta"
                              className="ml-auto shrink-0 opacity-0 hover:text-destructive group-hover:opacity-100"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {total === 0 && (
        <div className="mt-4">
          <Callout emoji="📭">
            Nada em {monthLabel}. Passe o mouse num dia e clique no <strong>+</strong> para marcar
            uma pauta, ou agende um post pelo{" "}
            <Link to="/fabrica-social/biblioteca" className="text-primary hover:underline">
              Biblioteca
            </Link>
            .
          </Callout>
        </div>
      )}
    </div>
  );
}
