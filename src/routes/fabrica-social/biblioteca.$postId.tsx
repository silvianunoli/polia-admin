import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Upload,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Film,
} from "lucide-react";
import { Callout } from "@/components/fabrica-social/Callout";
import { Button, Card } from "@/components/fabrica-social/bits";
import {
  fetchPost,
  fetchSlides,
  updatePostContent,
  updatePostMedia,
  type PecaEdicao,
  type ManualMediaType,
} from "@/lib/fabrica-social/api";
import { paraJpeg } from "@/lib/fabrica-social/jpeg";
import type { Post } from "@/lib/fabrica-social/mock";

export const Route = createFileRoute("/fabrica-social/biblioteca/$postId")({
  head: () => ({ meta: [{ title: "Editar postagem · Fábrica Social · Pólia" }] }),
  component: EditarPostagem,
});

/*
  Edição leve de um post que ainda não foi publicado (rascunho ou agendado) —
  pedido explícito da Sil: dá pra trocar imagem/vídeo, incluir ou excluir peça
  do carrossel, mudar título e legenda. NÃO dá pra mexer em arte/design —
  isso continua exclusivo do Editor (canvas Fabric.js), que ainda só existe no
  app separado. Por isso esta tela não linca pra lá: é um caminho
  deliberadamente mais estreito, não um atalho pro Editor.

  A mesma UI de upload/reordenar de Criar Postagem, mas misturando peças
  EXISTENTES (a mídia que já estava no post, reaproveitada sem novo upload) e
  NOVAS (arquivo escolhido agora) na mesma lista ordenável.
*/

const IMG = /\.(png|jpe?g|webp)$/i;
const VID = /\.(mp4|mov|m4v)$/i;

type Peca =
  | { tipo: "existente"; url: string; ehVideo: boolean }
  | { tipo: "novo"; file: File; url: string; ehVideo: boolean };

function tipoDe(pecas: Peca[]): ManualMediaType {
  if (pecas.some((p) => p.ehVideo)) return "reels";
  return pecas.length > 1 ? "carousel" : "image";
}

const ROTULO: Record<ManualMediaType, string> = {
  image: "Foto única",
  carousel: "Carrossel",
  reels: "Reels",
  story: "Story",
};

function EditarPostagem() {
  const { postId } = Route.useParams();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [carregando, setCarregando] = useState(true);
  const [naoEncontrado, setNaoEncontrado] = useState(false);
  const [post, setPost] = useState<Post | null>(null);

  const [titulo, setTitulo] = useState("");
  const [legenda, setLegenda] = useState("");
  const [pecas, setPecas] = useState<Peca[]>([]);
  const [tipo, setTipo] = useState<ManualMediaType | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [p, slides] = await Promise.all([fetchPost(postId), fetchSlides(postId)]);
      if (!vivo) return;
      if (!p) {
        setNaoEncontrado(true);
        setCarregando(false);
        return;
      }
      setPost(p);
      setTitulo(p.title);
      setLegenda(p.caption);

      const mediaType =
        p.mediaType ?? (slides.length > 1 ? "carousel" : p.videoUrl ? "reels" : "image");
      const iniciais: Peca[] =
        mediaType === "carousel" && slides.length > 0
          ? slides.map((s) => ({
              tipo: "existente",
              url: (s.videoUrl || s.imageUrl) as string,
              ehVideo: !!s.videoUrl,
            }))
          : [
              {
                tipo: "existente",
                url: (p.videoUrl || p.imageUrl) as string,
                ehVideo: !!p.videoUrl,
              },
            ];
      setPecas(iniciais.filter((peca) => !!peca.url));
      setTipo(mediaType);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [postId]);

  // Só as peças NOVAS (com File local) têm object URL pra revogar ao sair.
  const pecasRef = useRef<Peca[]>([]);
  pecasRef.current = pecas;
  useEffect(
    () => () => {
      pecasRef.current.forEach((p) => {
        if (p.tipo === "novo") URL.revokeObjectURL(p.url);
      });
    },
    [],
  );

  async function receber(files: File[]) {
    setErro(null);
    const midias = files.filter((f) => IMG.test(f.name) || VID.test(f.name));
    if (midias.length === 0) {
      setErro("Não achei imagem nem vídeo nesse arquivo. Aceito .png, .jpg, .webp, .mp4, .mov.");
      return;
    }
    const novas: Peca[] = midias.map((file) => ({
      tipo: "novo",
      file,
      url: URL.createObjectURL(file),
      ehVideo: VID.test(file.name),
    }));
    const combinado = [...pecas, ...novas];
    if (combinado.filter((p) => p.ehVideo).length > 1) {
      novas.forEach((p) => URL.revokeObjectURL(p.url));
      setErro(
        "Mais de um vídeo. O Instagram e o TikTok publicam um vídeo por peça — envie um de cada vez.",
      );
      return;
    }
    setPecas(combinado);
    setTipo(tipoDe(combinado));
    setSalvo(false);
  }

  function mover(i: number, dir: -1 | 1) {
    setPecas((atual) => {
      const j = i + dir;
      if (j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
    setSalvo(false);
  }

  function remover(i: number) {
    setPecas((atual) => {
      const fora = atual[i];
      if (fora?.tipo === "novo") URL.revokeObjectURL(fora.url);
      const copia = atual.filter((_, k) => k !== i);
      if (copia.length > 0) setTipo(tipoDe(copia));
      return copia;
    });
    setSalvo(false);
  }

  async function salvar() {
    if (!post || !tipo || pecas.length === 0) return;
    setErro(null);
    setSalvando("Salvando…");
    try {
      const paraTikTok = post.platforms.includes("tiktok");
      /*
        Se o TikTok está entre os destinos, cada peça NOVA precisa virar JPEG
        dentro do limite de tamanho dele -- mesma exigência de Criar postagem.
        Peça existente já passou por isso (ou é do Instagram, sem essa regra) e
        não é reprocessada.
      */
      const pecasFinais: PecaEdicao[] = [];
      let feitas = 0;
      for (const p of pecas) {
        if (p.tipo === "existente") {
          pecasFinais.push({ tipo: "existente", url: p.url, ehVideo: p.ehVideo });
        } else {
          const arquivo = paraTikTok && !p.ehVideo ? await paraJpeg(p.file) : p.file;
          pecasFinais.push({ tipo: "novo", file: arquivo });
        }
        feitas += 1;
        setSalvando(`Enviando ${feitas} de ${pecas.length}…`);
      }

      await updatePostContent(post.id, { title: titulo, caption: legenda });
      await updatePostMedia({ postId: post.id, mediaType: tipo, pieces: pecasFinais });

      await queryClient.invalidateQueries({ queryKey: ["posts", post.brandId] });
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(null);
    }
  }

  const input =
    "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40";

  if (carregando) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (naoEncontrado || !post) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
        <Callout emoji="🤷">Não achei esse post.</Callout>
        <Link
          to="/fabrica-social/biblioteca"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Voltar pra Biblioteca
        </Link>
      </div>
    );
  }

  if (post.status === "published") {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
        <Callout emoji="🔒">
          <strong>"{post.title}"</strong> já foi publicado — a edição fica disponível só antes de
          sair, pra não dar a impressão de que algo que já está no ar mudou.
        </Callout>
        <Link
          to="/fabrica-social/biblioteca"
          className="mt-4 inline-block text-sm text-primary hover:underline"
        >
          Voltar pra Biblioteca
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <Link
        to="/fabrica-social/biblioteca"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Biblioteca
      </Link>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Editar postagem</h1>
      <p className="mt-2 text-muted-foreground">
        Troque foto ou vídeo, inclua ou tire peça do carrossel, mude título e legenda. Pra mexer no
        design da arte, use o Editor.
      </p>

      <div className="mt-8 space-y-5">
        <Card className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Título (só pra achar na Biblioteca)
            </label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={input} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Legenda {tipo === "story" && "— story não leva legenda no Instagram"}
            </label>
            <textarea
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              rows={6}
              disabled={tipo === "story"}
              className={`${input} disabled:opacity-50`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {legenda.length} caracteres · limite do Instagram e do TikTok: 2.200
            </p>
          </div>
        </Card>

        {erro && <Callout emoji="⚠️">{erro}</Callout>}
        {salvo && !erro && <Callout emoji="✅">Salvo.</Callout>}

        <Card className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">
              {pecas.length} arquivo(s){" "}
              {tipo && <span className="text-muted-foreground">· {ROTULO[tipo]}</span>}
            </p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.mp4,.mov"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length > 0) void receber(files);
              }}
            />
            <Button
              variant="outline"
              className="ml-auto px-2.5 py-1 text-xs"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-3.5 w-3.5" /> Adicionar
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {pecas.map((p, i) => (
              <div key={p.url} className="overflow-hidden rounded-lg border">
                {p.ehVideo ? (
                  <video src={p.url} className="aspect-[4/5] w-full bg-muted object-cover" muted />
                ) : (
                  <img src={p.url} alt="" className="aspect-[4/5] w-full bg-muted object-cover" />
                )}
                <div className="flex items-center gap-1 p-1.5 text-xs">
                  <span className="font-medium">
                    {p.ehVideo ? <Film className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {p.tipo === "novo" ? p.file.name : "já estava aqui"}
                  </span>
                  {pecas.length > 1 && (
                    <>
                      <button
                        onClick={() => mover(i, -1)}
                        disabled={i === 0}
                        className="disabled:opacity-30"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => mover(i, 1)}
                        disabled={i === pecas.length - 1}
                        className="disabled:opacity-30"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                  <button onClick={() => remover(i)} className="hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {tipo === "carousel" && (
            <p className="text-xs text-muted-foreground">
              A ordem aqui é a ordem de publicação — use as setas pra trocar.
            </p>
          )}
        </Card>

        {salvando && (
          <div className="flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" /> {salvando}
          </div>
        )}
        <div className="flex gap-2">
          <Button onClick={salvar} disabled={!!salvando || pecas.length === 0}>
            <Save className="h-4 w-4" /> Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
