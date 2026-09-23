import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { unzipSync } from "fflate";
import {
  Upload,
  Loader2,
  Trash2,
  ChevronUp,
  ChevronDown,
  Send,
  CalendarClock,
  FileArchive,
  Film,
  Instagram,
  Music2,
  ExternalLink,
} from "lucide-react";
import { Callout } from "@/components/fabrica-social/Callout";
import { Button, Card, Badge } from "@/components/fabrica-social/bits";
import {
  createManualPost,
  publishPostNow,
  fetchConnections,
  type ManualMediaType,
  type PublishablePlatform,
} from "@/lib/fabrica-social/api";
import { paraJpeg } from "@/lib/fabrica-social/jpeg";
import { useFabricaSocialWorkspace } from "@/context/fabrica-social/WorkspaceContext";
import { fabricaSocialNaoConfigurado as isMockMode } from "@/lib/fabrica-social/supabase";

export const Route = createFileRoute("/fabrica-social/criar-postagem")({
  head: () => ({ meta: [{ title: "Criar postagem · Fábrica Social · Pólia" }] }),
  component: CriarPostagem,
});

const APP_SEPARADO =
  import.meta.env.VITE_FABRICA_SOCIAL_APP_URL || "https://app.silvianunoli.com.br";

/*
  Segunda tela portada do Fábrica Social (22/09/2026) — lógica idêntica à
  original (src/pages/CriacaoManual.tsx no repo separado), incluindo o
  destino TikTok. Única mudança real: o link "conecte" do TikTok, quando a
  marca ainda não tem conexão, aponta pro app separado (Conexões ainda não
  foi portado) em vez de uma rota interna que não existe aqui.

  A peça já existe, feita fora daqui. Aqui ela só entra, ganha legenda e vai
  para o Instagram/TikTok — agora ou na data marcada.

  A entrada normal são os arquivos soltos — imagens ou vídeo — e a legenda
  digitada aqui. O .zip com um .txt dentro é o atalho para quem já tem o
  pacote montado, não a obrigação: exigir zip de quem tem 1 foto é
  burocracia.

  ORDEM: os arquivos saem do zip na ordem que o zip guardou, que não é
  necessariamente a que a pessoa quer. Por isso ordenam-se por NOME (01, 02,
  03…) e ainda assim dá para mover na mão — num carrossel a ordem é o
  argumento.

  Cada envio ACRESCENTA ao que já está na tela. Escolher 3 fotos e depois
  mais 2 é o jeito natural de montar um carrossel; se o segundo envio
  apagasse o primeiro, o trabalho sumiria sem aviso.
*/

const IMG = /\.(png|jpe?g|webp)$/i;
const VID = /\.(mp4|mov|m4v)$/i;
const TXT = /\.(txt|md)$/i;

type Peca = { file: File; url: string; ehVideo: boolean };

/** "10-capa.png" antes de "9-x.png": comparação natural, não alfabética. */
function porNome(a: string, b: string): number {
  return a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });
}

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

function CriarPostagem() {
  const { activeBrand } = useFabricaSocialWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [pecas, setPecas] = useState<Peca[]>([]);
  const [legenda, setLegenda] = useState("");
  const [titulo, setTitulo] = useState("");
  const [tipo, setTipo] = useState<ManualMediaType | null>(null);
  const [quando, setQuando] = useState("");
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /*
    Destinos. Instagram vem marcado porque era o único caminho até o TikTok
    existir. O TikTok só pode ser marcado com a conta conectada nesta marca —
    marcar sem conexão só produziria "sem_conexao" na hora de publicar. Story
    não vai para o TikTok: a API dele não tem story.
  */
  const [destinos, setDestinos] = useState<PublishablePlatform[]>(["instagram"]);
  const { data: connections = [] } = useQuery({
    queryKey: ["connections", activeBrand.id],
    queryFn: () => fetchConnections(activeBrand.id),
    enabled: !isMockMode && !activeBrand.isDemo,
  });
  const igConectado = connections.some((c) => c.platform === "instagram");
  const ttConectado = connections.some((c) => c.platform === "tiktok");
  const tiktokPossivel = ttConectado && tipo !== "story";
  const destinosEfetivos = destinos.filter((d) => d !== "tiktok" || tiktokPossivel);

  function alternarDestino(d: PublishablePlatform) {
    setDestinos((atual) => (atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d]));
  }

  /*
    URLs de preview são objetos vivos: sem revogar, a aba vaza memória.
    A revogação é feita em quem TIRA a peça da lista (remover, Limpar) e na
    saída da página. Revogar a cada mudança de `pecas` quebraria o append —
    as URLs antigas continuam em uso na lista nova.
  */
  const pecasRef = useRef<Peca[]>([]);
  pecasRef.current = pecas;
  useEffect(() => () => pecasRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  async function receber(files: File[]) {
    setErro(null);
    setLendo(true);
    try {
      const midias: File[] = [];
      let texto = "";

      for (const f of files) {
        if (f.name.toLowerCase().endsWith(".zip")) {
          const bytes = new Uint8Array(await f.arrayBuffer());
          const conteudo = unzipSync(bytes);
          const nomes = Object.keys(conteudo)
            // Pastas e lixo do macOS (__MACOSX, ._arquivo) entram no zip e não são mídia.
            .filter(
              (n) =>
                !n.endsWith("/") &&
                !n.startsWith("__MACOSX") &&
                !n.split("/").pop()!.startsWith("."),
            )
            .sort(porNome);
          for (const nome of nomes) {
            const dados = conteudo[nome];
            const base = nome.split("/").pop()!;
            if (TXT.test(base)) {
              texto ||= new TextDecoder("utf-8", { fatal: false }).decode(dados);
            } else if (IMG.test(base) || VID.test(base)) {
              const mime = VID.test(base)
                ? `video/${base.split(".").pop()!.toLowerCase().replace("mov", "quicktime")}`
                : `image/${base.split(".").pop()!.toLowerCase().replace("jpg", "jpeg")}`;
              midias.push(new File([dados as BlobPart], base, { type: mime }));
            }
          }
        } else if (TXT.test(f.name)) {
          texto ||= await f.text();
        } else if (IMG.test(f.name) || VID.test(f.name)) {
          midias.push(f);
        }
      }

      if (midias.length === 0 && !texto.trim()) {
        setErro(
          "Não achei imagem nem vídeo. Aceito .png, .jpg, .webp, .mp4 e .mov — soltos ou dentro de um .zip.",
        );
        return;
      }

      // Ordena só o lote que chegou: a lista que já estava na tela pode ter sido
      // reordenada na mão, e reordenar tudo apagaria essa decisão.
      midias.sort((a, b) => porNome(a.name, b.name));
      const novas = midias.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        ehVideo: VID.test(file.name),
      }));
      const combinado = [...pecas, ...novas];

      if (combinado.filter((p) => p.ehVideo).length > 1) {
        novas.forEach((p) => URL.revokeObjectURL(p.url));
        setErro("Mais de um vídeo. O Instagram publica um vídeo por peça — envie um de cada vez.");
        return;
      }

      if (novas.length > 0) {
        setPecas(combinado);
        setTipo(tipoDe(combinado));
      }
      if (texto.trim()) setLegenda(texto.trim());
      // Primeira linha da legenda vira título interno; é só para achar na Biblioteca.
      if (!titulo) {
        setTitulo((texto.trim().split("\n")[0] || novas[0]?.file.name || "").slice(0, 90));
      }
    } catch (e) {
      setErro(`Não consegui ler o pacote: ${(e as Error).message}`);
    } finally {
      setLendo(false);
    }
  }

  function mover(i: number, dir: -1 | 1) {
    setPecas((atual) => {
      const j = i + dir;
      if (j < 0 || j >= atual.length) return atual;
      const copia = [...atual];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function remover(i: number) {
    setPecas((atual) => {
      const fora = atual[i];
      if (fora) URL.revokeObjectURL(fora.url);
      const copia = atual.filter((_, k) => k !== i);
      if (copia.length > 0) setTipo(tipoDe(copia));
      return copia;
    });
  }

  function limpar() {
    pecas.forEach((p) => URL.revokeObjectURL(p.url));
    setPecas([]);
    setTipo(null);
    setLegenda("");
    setTitulo("");
    setErro(null);
  }

  async function enviar(publicarAgora: boolean) {
    if (!tipo || pecas.length === 0) return;
    if (destinosEfetivos.length === 0) {
      setErro("Marque pelo menos um destino (Instagram ou TikTok).");
      return;
    }
    setErro(null);
    setEnviando("Enviando arquivos…");
    try {
      /*
        TikTok só aceita JPEG/WebP em post de fotos. A conversão é feita
        aqui, no navegador, porque a edge function (Deno) não tem canvas
        para redesenhar imagem. Só quando o TikTok está nos destinos — post
        só de Instagram sobe o arquivo original, como sempre.
      */
      let arquivos = pecas.map((p) => p.file);
      if (destinosEfetivos.includes("tiktok")) {
        setEnviando("Convertendo imagens para JPEG (exigência do TikTok)…");
        arquivos = await Promise.all(pecas.map((p) => (p.ehVideo ? p.file : paraJpeg(p.file))));
      }

      const { postId } = await createManualPost({
        brandId: activeBrand.id,
        title: titulo || "Post manual",
        caption: legenda,
        mediaType: tipo,
        files: arquivos,
        platforms: destinosEfetivos,
        scheduledFor: publicarAgora ? undefined : quando,
        onProgress: (feito, total) => setEnviando(`Enviando arquivo ${feito} de ${total}…`),
      });

      if (publicarAgora) {
        const onde = destinosEfetivos
          .map((d) => (d === "tiktok" ? "TikTok" : "Instagram"))
          .join(" e ");
        setEnviando(
          tipo === "reels"
            ? `Publicando no ${onde}… vídeo leva alguns minutos`
            : `Publicando no ${onde}…`,
        );
        await publishPostNow(postId);
      }

      await queryClient.invalidateQueries({ queryKey: ["posts", activeBrand.id] });
      // Calendário ainda não foi portado pra dentro da Central -- os dois
      // caminhos (publicar agora / agendar) voltam pra Biblioteca, que é a
      // única tela daqui que mostra o resultado.
      navigate({ to: "/fabrica-social/biblioteca" });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(null);
    }
  }

  const input =
    "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40";
  const podeAgendar = !!quando && new Date(quando).getTime() > Date.now();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <h1 className="font-cabinet text-[28px] text-[var(--ink)]">Criar postagem</h1>
      <p className="mt-2 text-[15px] text-[var(--ink-soft)]">
        Suba a peça pronta e publique ou agende — sem gastar crédito. Marca:{" "}
        <strong>{activeBrand.name}</strong>.
      </p>

      <div className="mt-8 space-y-5">
        {isMockMode && (
          <Callout emoji="🔌">Sem backend configurado — o envio não funciona neste modo.</Callout>
        )}

        <Card className="space-y-3">
          <input
            ref={fileRef}
            type="file"
            multiple
            accept=".zip,.png,.jpg,.jpeg,.webp,.mp4,.mov,.txt,.md"
            className="hidden"
            onChange={(e) => {
              // Copiar antes de limpar: a FileList é viva e esvazia com o input.
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length > 0) void receber(files);
            }}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const files = Array.from(e.dataTransfer.files ?? []);
              if (files.length > 0) void receber(files);
            }}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-lg border-2 border-dashed p-8 text-center hover:bg-accent/40"
          >
            {lendo ? (
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            ) : (
              <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
            )}
            <p className="mt-2 text-sm font-medium">
              {lendo
                ? "Abrindo os arquivos…"
                : pecas.length > 0
                  ? "Adicionar mais arquivos"
                  : "Arraste as imagens ou o vídeo aqui, ou clique para escolher"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              .png, .jpg, .webp, .mp4, .mov — pode escolher vários de uma vez, e enviar de novo para
              acrescentar. A legenda você escreve abaixo.
            </p>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <FileArchive className="h-3.5 w-3.5" />
              Tem um .zip pronto (imagens + .txt da legenda)? Serve também.
            </p>
          </div>
        </Card>

        {/*
          Título e legenda ficam SEMPRE na tela, mesmo sem arquivo. Antes só
          apareciam depois do upload, o que fazia a legenda parecer um campo
          que só o .txt do zip preenchia. Ela é a parte que mais dá trabalho —
          dá para escrever primeiro e escolher a imagem depois.
        */}
        <Card className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Título (só para achar na Biblioteca)
            </label>
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex.: Carrossel sobre precificação"
              className={input}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Legenda {tipo === "story" && "— story não leva legenda no Instagram"}
            </label>
            <textarea
              value={legenda}
              onChange={(e) => setLegenda(e.target.value)}
              rows={7}
              disabled={tipo === "story"}
              placeholder="Escreva aqui a legenda do post. Se você subir um .zip com um .txt dentro, ela já vem preenchida."
              className={`${input} disabled:opacity-50`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {legenda.length} caracteres · limite do Instagram e do TikTok: 2.200
            </p>
          </div>
        </Card>

        {erro && <Callout emoji="⚠️">{erro}</Callout>}

        {pecas.length > 0 && tipo && (
          <>
            <Card className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {pecas.length} arquivo(s) · <Badge tone="blue">{ROTULO[tipo]}</Badge>
                </p>
                <div className="ml-auto flex gap-1.5">
                  {(["carousel", "image", "reels", "story"] as ManualMediaType[])
                    .filter((t) =>
                      pecas.some((p) => p.ehVideo) ? t === "reels" || t === "story" : t !== "reels",
                    )
                    .filter((t) => (pecas.length > 1 ? t === "carousel" : true))
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTipo(t)}
                        className={`rounded-full border px-3 py-1 text-xs hover:bg-accent ${
                          tipo === t ? "border-primary bg-primary/10 text-primary" : ""
                        }`}
                      >
                        {ROTULO[t]}
                      </button>
                    ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {pecas.map((p, i) => (
                  <div key={p.url} className="overflow-hidden rounded-lg border">
                    {p.ehVideo ? (
                      <video
                        src={p.url}
                        className="aspect-[4/5] w-full bg-muted object-cover"
                        muted
                      />
                    ) : (
                      <img
                        src={p.url}
                        alt=""
                        className="aspect-[4/5] w-full bg-muted object-cover"
                      />
                    )}
                    <div className="flex items-center gap-1 p-1.5 text-xs">
                      <span className="font-medium">
                        {p.ehVideo ? <Film className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {p.file.name}
                      </span>
                      {tipo === "carousel" && (
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
                  A ordem é a do nome do arquivo. Use as setas para trocar — num carrossel a ordem é
                  o argumento.
                </p>
              )}
            </Card>

            <Card className="space-y-3">
              <p className="font-semibold">Onde publicar</p>
              <div className="flex flex-wrap gap-2">
                <label
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    destinos.includes("instagram") ? "border-primary bg-primary/10" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={destinos.includes("instagram")}
                    onChange={() => alternarDestino("instagram")}
                  />
                  <Instagram className="h-4 w-4" /> Instagram
                  {!igConectado && !isMockMode && (
                    <span className="text-xs text-muted-foreground">· não conectado</span>
                  )}
                </label>
                <label
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    tiktokPossivel ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                  } ${destinos.includes("tiktok") && tiktokPossivel ? "border-primary bg-primary/10" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={destinos.includes("tiktok") && tiktokPossivel}
                    disabled={!tiktokPossivel}
                    onChange={() => alternarDestino("tiktok")}
                  />
                  <Music2 className="h-4 w-4" /> TikTok
                  {!ttConectado && (
                    <span className="text-xs text-muted-foreground">
                      ·{" "}
                      <a
                        href={`${APP_SEPARADO}/conexoes/tiktok`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        conecte <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    </span>
                  )}
                  {ttConectado && tipo === "story" && (
                    <span className="text-xs text-muted-foreground">
                      · story não vai para o TikTok
                    </span>
                  )}
                </label>
              </div>
              {destinosEfetivos.includes("tiktok") && (
                <p className="text-xs text-muted-foreground">
                  No TikTok,{" "}
                  {tipo === "reels"
                    ? "o vídeo sobe como vídeo"
                    : "foto e carrossel viram post de fotos (as imagens são convertidas para JPEG)"}
                  . Enquanto o app não passar na auditoria do TikTok, o post sai como <em>só eu</em>{" "}
                  — privado.
                </p>
              )}
            </Card>

            <Card className="space-y-3">
              <p className="font-semibold">Quando publicar</p>
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  Data e hora (para agendar)
                </label>
                <input
                  type="datetime-local"
                  value={quando}
                  onChange={(e) => setQuando(e.target.value)}
                  className={input}
                />
              </div>
              {enviando && (
                <div className="flex items-center gap-2 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> {enviando}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => enviar(true)} disabled={!!enviando || isMockMode}>
                  <Send className="h-4 w-4" /> Publicar agora
                </Button>
                <Button
                  variant="outline"
                  onClick={() => enviar(false)}
                  disabled={!!enviando || !podeAgendar || isMockMode}
                >
                  <CalendarClock className="h-4 w-4" /> Agendar
                </Button>
                <Button variant="ghost" onClick={limpar} disabled={!!enviando}>
                  Limpar
                </Button>
              </div>
              {quando && !podeAgendar && (
                <p className="text-xs text-destructive">A data escolhida já passou.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Publicar exige a rede conectada nesta marca. Vídeo leva alguns minutos: a rede
                precisa processar antes de o post ir ao ar.
              </p>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
