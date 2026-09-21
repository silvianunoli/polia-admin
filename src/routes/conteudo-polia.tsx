import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import {
  buscarAtivosCarrossel,
  buscarCarrossel,
  listarCarrosseis,
  salvarSlide,
} from "@/lib/carrosseis.functions";

export const Route = createFileRoute("/conteudo-polia")({
  head: () => ({ meta: [{ title: "Conteúdo Pólia" }] }),
  component: ConteudoPoliaPage,
});

type Ativos = { fonte: string; imagens: Record<string, string> };
type Slide = { id: string; ordem: number; titulo: string; html: string };
type Carrossel = {
  id: string;
  slug: string;
  titulo: string;
  descricao: string;
  largura: number;
  altura: number;
  cssBase: string;
  slides: Slide[];
};
type ItemLista = { slug: string; titulo: string; pranchas: number };

// A prancha é desenhada dentro de um iframe: o CSS dela é da marca, com
// regras em body e em h1-h6, e brigaria com o .polia-v3 do admin se fosse
// montada direto na página.
//
// O mesmo documento sabe se exportar. Serializa a si próprio dentro de um
// <foreignObject> de SVG, desenha num canvas de 1080x1350 e devolve o PNG.
// Fonte e ilustração são data: URI, então o canvas não fica marcado
// (tainted) e o toDataURL passa.
const EXPORTADOR = `<script>
(function () {
  function avisar() { parent.postMessage({ tipo: "prancha-pronta" }, "*"); }
  if (document.fonts && document.fonts.ready) { document.fonts.ready.then(avisar); } else { avisar(); }

  window.addEventListener("message", function (e) {
    if (!e.data || e.data.tipo !== "exportar") return;
    var pedido = e.data.pedido;
    try {
      var estilo = document.getElementById("estilo").textContent;
      var conteudo = new XMLSerializer().serializeToString(document.getElementById("prancha"));
      var svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="' + e.data.largura + '" height="' + e.data.altura + '">' +
        '<foreignObject width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml"><style>' + estilo + '</style>' + conteudo + '</div>' +
        '</foreignObject></svg>';
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement("canvas");
          c.width = e.data.largura;
          c.height = e.data.altura;
          c.getContext("2d").drawImage(img, 0, 0);
          parent.postMessage({ tipo: "png", url: c.toDataURL("image/png"), pedido: pedido }, "*");
        } catch (err2) {
          parent.postMessage({ tipo: "erro", motivo: String(err2 && err2.message ? err2.message : err2), pedido: pedido }, "*");
        }
      };
      img.onerror = function () {
        parent.postMessage({ tipo: "erro", motivo: "O navegador não conseguiu desenhar esta prancha. Costuma ser tag mal fechada no HTML.", pedido: pedido }, "*");
      };
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    } catch (err) {
      parent.postMessage({ tipo: "erro", motivo: String(err && err.message ? err.message : err), pedido: pedido }, "*");
    }
  });
})();
</script>`;

function resolverAtivos(texto: string, ativos: Ativos) {
  let saida = texto.split("{{fonte}}").join(ativos.fonte);
  for (const [nome, uri] of Object.entries(ativos.imagens)) {
    saida = saida.split(`{{img:${nome}}}`).join(uri);
  }
  return saida;
}

function montarDocumento(cssBase: string, html: string, ativos: Ativos, comExportador: boolean) {
  const css = resolverAtivos(cssBase, ativos);
  const corpo = resolverAtivos(html, ativos);
  return (
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<style id="estilo">${css}</style></head>` +
    `<body><div id="prancha">${corpo}</div>${comExportador ? EXPORTADOR : ""}</body></html>`
  );
}

// Erro de RPC chega aqui como Error com a mensagem do servidor. Mostrar só
// "não consegui" esconderia a causa real (falta de variável de ambiente,
// sessão expirada) e faria parecer bug do código -- o mesmo tipo de engano
// que o painel do censo já causou ao mostrar falha como se fosse zero.
function mensagemDoErro(e: unknown) {
  const bruta = e instanceof Error ? e.message : String(e);
  if (/SUPABASE_SERVICE_ROLE_KEY|environment variable/i.test(bruta)) {
    return "Falta a SUPABASE_SERVICE_ROLE_KEY no ambiente. Em desenvolvimento ela vem do .dev.vars; em produção, do secret do Worker.";
  }
  if (/Forbidden/i.test(bruta)) return "Esta conta não está marcada como admin.";
  return bruta;
}

function baixar(url: string, nome: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ConteudoPoliaPage() {
  const [lista, setLista] = useState<ItemLista[]>([]);
  const [slugAtivo, setSlugAtivo] = useState<string | null>(null);
  const [carrossel, setCarrossel] = useState<Carrossel | null>(null);
  const [ativos, setAtivos] = useState<Ativos | null>(null);
  const [indice, setIndice] = useState(0);
  const [rascunho, setRascunho] = useState("");
  const [htmlPreview, setHtmlPreview] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [exportando, setExportando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const iframeExport = useRef<HTMLIFrameElement>(null);
  const aoFicarPronta = useRef<(() => void) | null>(null);
  const pendentes = useRef(
    new Map<string, { ok: (url: string) => void; falhou: (e: Error) => void }>(),
  );

  const slide = carrossel?.slides[indice] ?? null;
  const mudou = slide ? rascunho !== slide.html : false;

  useEffect(() => {
    let vivo = true;
    Promise.all([listarCarrosseis(), buscarAtivosCarrossel()])
      .then(([itens, ats]) => {
        if (!vivo) return;
        setLista(itens.map((i) => ({ slug: i.slug, titulo: i.titulo, pranchas: i.pranchas })));
        setAtivos(ats);
        setSlugAtivo((atual) => atual ?? itens[0]?.slug ?? null);
      })
      .catch((e) => vivo && setErro(`Não consegui carregar os carrosséis. ${mensagemDoErro(e)}`));
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    if (!slugAtivo) return;
    let vivo = true;
    buscarCarrossel({ data: { slug: slugAtivo } })
      .then((c) => {
        if (!vivo) return;
        setCarrossel(c as Carrossel);
        setIndice(0);
        setRascunho(c.slides[0]?.html ?? "");
      })
      .catch((e) => vivo && setErro(`Não consegui abrir este carrossel. ${mensagemDoErro(e)}`));
    return () => {
      vivo = false;
    };
  }, [slugAtivo]);

  // O preview só redesenha meio segundo depois da última tecla: redesenhar a
  // cada caractere recarregaria a fonte e piscaria a prancha inteira.
  useEffect(() => {
    const t = setTimeout(() => setHtmlPreview(rascunho), 500);
    return () => clearTimeout(t);
  }, [rascunho]);

  useEffect(() => {
    function aoReceber(e: MessageEvent) {
      const janela = iframeExport.current?.contentWindow;
      if (!janela || e.source !== janela) return;
      const d = e.data as { tipo?: string; url?: string; motivo?: string; pedido?: string };
      if (d?.tipo === "prancha-pronta") {
        aoFicarPronta.current?.();
        return;
      }
      if (!d?.pedido) return;
      const alvo = pendentes.current.get(d.pedido);
      if (!alvo) return;
      pendentes.current.delete(d.pedido);
      if (d.tipo === "png" && d.url) alvo.ok(d.url);
      else alvo.falhou(new Error(d.motivo ?? "Não consegui gerar o PNG."));
    }
    window.addEventListener("message", aoReceber);
    return () => window.removeEventListener("message", aoReceber);
  }, []);

  const docPreview = useMemo(() => {
    if (!carrossel || !ativos) return "";
    return montarDocumento(carrossel.cssBase, htmlPreview, ativos, false);
  }, [carrossel, ativos, htmlPreview]);

  const gerarPng = useCallback(
    async (html: string) => {
      const iframe = iframeExport.current;
      if (!iframe || !carrossel || !ativos) throw new Error("A prancha ainda não carregou.");

      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => {
          aoFicarPronta.current = null;
          reject(new Error("A prancha demorou demais para ficar pronta."));
        }, 20000);
        aoFicarPronta.current = () => {
          clearTimeout(t);
          aoFicarPronta.current = null;
          resolve();
        };
        iframe.srcdoc = montarDocumento(carrossel.cssBase, html, ativos, true);
      });

      const pedido = crypto.randomUUID();
      return await new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => {
          pendentes.current.delete(pedido);
          reject(new Error("Demorou demais para gerar o PNG."));
        }, 30000);
        pendentes.current.set(pedido, {
          ok: (url) => {
            clearTimeout(t);
            resolve(url);
          },
          falhou: (e) => {
            clearTimeout(t);
            reject(e);
          },
        });
        iframe.contentWindow?.postMessage(
          { tipo: "exportar", largura: carrossel.largura, altura: carrossel.altura, pedido },
          "*",
        );
      });
    },
    [carrossel, ativos],
  );

  async function salvar() {
    if (!slide || !carrossel) return;
    setSalvando(true);
    setErro(null);
    try {
      await salvarSlide({ data: { id: slide.id, titulo: slide.titulo, html: rascunho } });
      setCarrossel({
        ...carrossel,
        slides: carrossel.slides.map((s) => (s.id === slide.id ? { ...s, html: rascunho } : s)),
      });
      setAviso("Prancha salva.");
      setTimeout(() => setAviso(null), 2500);
    } catch {
      setErro("Não consegui salvar. Nada foi perdido: o texto continua aqui.");
    } finally {
      setSalvando(false);
    }
  }

  async function baixarUma() {
    if (!slide || !carrossel) return;
    setErro(null);
    setExportando(slide.id);
    try {
      const url = await gerarPng(rascunho);
      baixar(url, `${carrossel.slug}-${String(slide.ordem).padStart(2, "0")}.png`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui gerar o PNG.");
    } finally {
      setExportando(null);
    }
  }

  async function baixarTodas() {
    if (!carrossel) return;
    setErro(null);
    try {
      for (const s of carrossel.slides) {
        setExportando(s.id);
        const html = s.id === slide?.id ? rascunho : s.html;
        const url = await gerarPng(html);
        baixar(url, `${carrossel.slug}-${String(s.ordem).padStart(2, "0")}.png`);
        await new Promise((r) => setTimeout(r, 350));
      }
      setAviso("Todas as pranchas baixadas.");
      setTimeout(() => setAviso(null), 2500);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui gerar os PNG.");
    } finally {
      setExportando(null);
    }
  }

  function trocarPrancha(i: number) {
    if (!carrossel) return;
    if (mudou && !window.confirm("Esta prancha tem mudança não salva. Trocar mesmo assim?")) return;
    setIndice(i);
    setRascunho(carrossel.slides[i]?.html ?? "");
  }

  return (
    <div className="polia-v3 flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4 md:px-10">
        <div className="flex items-center gap-6">
          <Link
            to="/central"
            className="flex items-center gap-2 font-sans text-[14px] text-[var(--ink-soft)] no-underline hover:text-[var(--ink)]"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Central
          </Link>
          <span className="font-sans text-[14px] text-[var(--muted)]">Conteúdo Pólia</span>
        </div>

        <div className="flex items-center gap-3">
          {lista.length > 1 ? (
            <select
              aria-label="Carrossel"
              value={slugAtivo ?? ""}
              onChange={(e) => setSlugAtivo(e.target.value)}
              className="rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[14px] text-[var(--ink)]"
            >
              {lista.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.titulo}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            onClick={baixarTodas}
            disabled={!carrossel || exportando !== null}
            className="flex items-center gap-2 rounded-lg bg-[var(--secondary)] px-4 py-2 font-sans text-[14px] font-medium text-[var(--secondary-ink)] disabled:opacity-50"
          >
            {exportando ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : (
              <Download size={16} aria-hidden="true" />
            )}
            Baixar as {carrossel?.slides.length ?? 0} pranchas
          </button>
        </div>
      </header>

      {erro ? (
        <p className="shrink-0 border-b border-[var(--line)] bg-[var(--danger-soft)] px-6 py-3 font-sans text-[14px] text-[var(--danger)] md:px-10">
          {erro}
        </p>
      ) : null}
      {aviso ? (
        <p className="shrink-0 border-b border-[var(--line)] px-6 py-3 font-sans text-[14px] text-[var(--secondary-text)] md:px-10">
          {aviso}
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <nav className="w-[232px] shrink-0 overflow-y-auto border-r border-[var(--line)] p-4">
          <p className="mb-3 px-2 font-sans text-[12px] tracking-[0.12em] text-[var(--muted)] uppercase">
            Pranchas
          </p>
          {(carrossel?.slides ?? []).map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => trocarPrancha(i)}
              className={`mb-1 block w-full rounded-lg px-3 py-2 text-left font-sans text-[14px] ${
                i === indice
                  ? "bg-[var(--secondary-light)] text-[var(--ink)]"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface)]"
              }`}
            >
              {s.titulo || `Prancha ${s.ordem}`}
              {i === indice && mudou ? <span className="ml-2 text-[var(--danger)]">•</span> : null}
            </button>
          ))}
        </nav>

        <section className="flex shrink-0 flex-col items-center gap-3 overflow-y-auto border-r border-[var(--line)] p-6">
          <div
            className="overflow-hidden rounded-lg border border-[var(--line)]"
            style={{ width: 486, height: 608 }}
          >
            <iframe
              title="Prancha"
              srcDoc={docPreview}
              style={{
                width: 1080,
                height: 1350,
                border: "none",
                transform: "scale(0.45)",
                transformOrigin: "top left",
                display: "block",
              }}
            />
          </div>
          <button
            type="button"
            onClick={baixarUma}
            disabled={!slide || exportando !== null}
            className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-4 py-2 font-sans text-[14px] text-[var(--ink)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            <Download size={16} aria-hidden="true" />
            Baixar esta prancha em PNG
          </button>
          <p className="max-w-[486px] text-center font-sans text-[12px] text-[var(--muted)]">
            1080 &times; 1350, que é o tamanho que o Instagram pede no feed.
          </p>
        </section>

        <section className="flex min-w-0 flex-1 flex-col p-6">
          <div className="mb-3 flex items-center justify-between gap-4">
            <label
              htmlFor="html-prancha"
              className="font-sans text-[12px] tracking-[0.12em] text-[var(--muted)] uppercase"
            >
              HTML da prancha
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRascunho(slide?.html ?? "")}
                disabled={!mudou || salvando}
                className="rounded-lg px-3 py-2 font-sans text-[14px] text-[var(--ink-soft)] hover:bg-[var(--surface)] disabled:opacity-40"
              >
                Descartar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={!mudou || salvando}
                className="rounded-lg bg-[var(--ink)] px-4 py-2 font-sans text-[14px] font-medium text-[var(--bg)] disabled:opacity-40"
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>

          <textarea
            id="html-prancha"
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            className="min-h-0 flex-1 resize-none rounded-lg border border-[var(--line)] bg-white p-4 font-mono text-[12.5px] leading-[1.6] text-[var(--ink)]"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
          />

          <p className="mt-3 font-sans text-[12px] text-[var(--muted)]">
            A fonte entra por <code>{"{{fonte}}"}</code> e as ilustrações por{" "}
            <code>{"{{img:nome}}"}</code>. Os nomes disponíveis:{" "}
            {Object.keys(ativos?.imagens ?? {}).join(", ") || "carregando"}.
          </p>
        </section>
      </div>

      <iframe
        title="Exportador"
        ref={iframeExport}
        style={{ display: "none" }}
        aria-hidden="true"
      />
    </div>
  );
}
