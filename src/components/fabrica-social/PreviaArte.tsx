import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/fabrica-social/cn";
import type { Post } from "@/lib/fabrica-social/mock";

/*
  Por que este componente existe.

  A engine NÃO gera uma imagem. Ela gera o canvas (`fabric_json`) — texto,
  posição, cor, foto de fundo. O PNG só nasce quando alguém abre o Editor e
  clica em "Exportar arte", porque desenhar Fabric exige um navegador e a
  geração roda num servidor sem DOM.

  Resultado visível: o card ficava cinza até a peça ser exportada. A arte
  existia, só não tinha sido desenhada por ninguém.

  Aqui ela é desenhada na hora, do mesmo jeito que o Editor desenha — mesmas
  fontes, mesma normalização de origem. É uma PRÉVIA: não sobe para o Storage e
  não substitui a exportação, que continua sendo o que o Instagram consome.
*/

/*
  As artes usam fontes que podem não estar em uso em nenhum lugar da página. Sem
  esperar por elas, o canvas rasteriza com a fonte de fallback e a prévia sai
  diferente da arte real. Mesma lista do Editor.
*/
const FONTES = [
  '700 16px "Cabinet Grotesk"',
  '700 16px "Space Grotesk"',
  "600 16px Inter",
  "700 16px 'DM Sans'",
  "italic 16px Fraunces",
  "600 16px Caveat",
];

/*
  Uma arte por vez. Uma biblioteca com 12 peças sem exportar dispararia 12
  rasterizações simultâneas e travaria a rolagem no meio da leitura. Enfileirar
  troca "tudo junto e engasgado" por "uma depois da outra, fluido".
*/
let fila: Promise<unknown> = Promise.resolve();

/** Fabric v7 ancora no centro por padrão; artes salvas sem origem usam left/top. */
function normalizar(json: unknown) {
  const j = json as { objects?: Record<string, unknown>[] };
  return {
    ...(json as Record<string, unknown>),
    objects: (j.objects ?? []).map((o) => ({ originX: "left", originY: "top", ...o })),
  };
}

export function PreviaArte({
  post,
  width,
  height,
  className,
}: {
  post: Post;
  width: number;
  height: number;
  className?: string;
}) {
  const [previa, setPrevia] = useState<string | null>(null);
  const [desenhando, setDesenhando] = useState(false);
  const jaTentou = useRef(false);

  useEffect(() => {
    if (post.imageUrl || !post.fabricJson || jaTentou.current) return;
    jaTentou.current = true;
    let vivo = true;
    setDesenhando(true);

    fila = fila.then(async () => {
      if (!vivo) return;
      try {
        // Fabric só entra no bundle se houver peça sem arte exportada.
        const { StaticCanvas } = await import("fabric");
        await Promise.allSettled(FONTES.map((f) => document.fonts?.load?.(f) ?? Promise.resolve()));

        // Desenha já no tamanho do card: rasterizar 1080×1350 para exibir 400px
        // seria pagar caro por pixel que ninguém vê.
        const escala = 420 / width;
        const canvas = new StaticCanvas(document.createElement("canvas"), {
          width: width * escala,
          height: height * escala,
        });
        await canvas.loadFromJSON(normalizar(post.fabricJson));
        canvas.setDimensions({ width: width * escala, height: height * escala });
        canvas.setZoom(escala);
        canvas.renderAll();
        // multiplier 1: o canvas já está no tamanho de exibição, não reamplia.
        const url = canvas.toDataURL({ format: "png", multiplier: 1 });
        canvas.dispose();
        if (vivo) setPrevia(url);
      } catch {
        // Sem prévia a pessoa ainda vê título, legenda e o aviso de exportar.
        // Um card quebrado seria pior que um card sem miniatura.
      } finally {
        if (vivo) setDesenhando(false);
      }
    });

    return () => {
      vivo = false;
    };
  }, [post.id, post.imageUrl, post.fabricJson, width, height]);

  const proporcao = { aspectRatio: `${width}/${height}`, maxHeight: 220 };
  const base = cn("w-full rounded-md border object-cover", className);

  if (post.imageUrl) {
    return <img src={post.imageUrl} alt={post.title} className={base} style={proporcao} />;
  }

  if (previa) {
    return (
      <div className="relative">
        <img src={previa} alt={post.title} className={base} style={proporcao} />
        {/*
          O selo importa: a arte aparece, mas ainda não foi exportada — e é a
          exportação que o Instagram consome. Sem ele, o aviso logo abaixo
          ("abra no Editor e exporte") pareceria contradição.
        */}
        <span className="absolute left-2 top-2 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          prévia · não exportada
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center justify-center rounded-md border bg-muted", className)}
      style={proporcao}
    >
      {desenhando && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
    </div>
  );
}
