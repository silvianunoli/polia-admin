import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Loader2 } from "lucide-react";
import { buscarAtivosCarrossel, buscarCarrossel, salvarSlide } from "@/lib/carrosseis.functions";

export const Route = createFileRoute("/conteudo-polia/$slug")({
  head: () => ({ meta: [{ title: "Conteúdo Pólia" }] }),
  component: EditorDeCarrossel,
});

type Ativos = { fonte: string; imagens: Record<string, string> };
type Slide = { id: string; ordem: number; titulo: string; html: string };
type Carrossel = {
  id: string;
  slug: string;
  titulo: string;
  largura: number;
  altura: number;
  cssBase: string;
  slides: Slide[];
};
type Campo = { indice: number; tipo: "texto" | "imagem"; rotulo: string; valor: string };

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

// ── campos ──────────────────────────────────────────────────────────────────
// A prancha continua sendo HTML no banco, mas os pedaços que valem a pena
// mexer estão marcados com data-campo. O editor lê esses nós e monta um
// formulário; o HTML cru fica na aba de cima, para quando precisar.

function analisar(html: string) {
  const doc = new DOMParser().parseFromString(`<div id="raiz">${html}</div>`, "text/html");
  const raiz = doc.getElementById("raiz");
  return { doc, raiz, nos: raiz ? Array.from(raiz.querySelectorAll("[data-campo]")) : [] };
}

function lerTexto(no: Element) {
  const bruto = no.innerHTML.replace(/<br\s*\/?>/gi, "\n");
  const caixa = no.ownerDocument.createElement("textarea");
  caixa.innerHTML = bruto;
  return caixa.value;
}

function lerCampos(html: string): Campo[] {
  const { nos } = analisar(html);
  return nos.map((no, indice) => {
    const tipo = no.getAttribute("data-campo") === "imagem" ? "imagem" : "texto";
    return {
      indice,
      tipo,
      rotulo: no.getAttribute("data-rotulo") ?? `Campo ${indice + 1}`,
      valor: tipo === "imagem" ? (no.getAttribute("src") ?? "") : lerTexto(no),
    };
  });
}

function escreverCampo(html: string, indice: number, valor: string) {
  const { raiz, nos } = analisar(html);
  const no = nos[indice];
  if (!raiz || !no) return html;
  if (no.getAttribute("data-campo") === "imagem") {
    no.setAttribute("src", valor);
  } else {
    // O que ela digita entra como texto, nunca como marcação: digitar um
    // sinal de menor não pode virar tag e quebrar a prancha.
    const seguro = valor
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br>");
    no.innerHTML = seguro;
  }
  return raiz.innerHTML;
}

function baixar(url: string, nome: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function mensagemDoErro(e: unknown) {
  const bruta = e instanceof Error ? e.message : String(e);
  if (/SUPABASE_SERVICE_ROLE_KEY|environment variable/i.test(bruta)) {
    return "Falta a SUPABASE_SERVICE_ROLE_KEY no ambiente do worker. Em desenvolvimento ela vem do .dev.vars; em produção, do secret do Worker.";
  }
  if (/Forbidden/i.test(bruta)) return "Esta conta não está marcada como admin.";
  return bruta;
}

function EditorDeCarrossel() {
  const { slug } = Route.useParams();
  const [carrossel, setCarrossel] = useState<Carrossel | null>(null);
  const [ativos, setAtivos] = useState<Ativos | null>(null);
  const [indice, setIndice] = useState(0);
  const [rascunho, setRascunho] = useState("");
  const [htmlPreview, setHtmlPreview] = useState("");
  const [modo, setModo] = useState<"campos" | "html">("campos");
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
  const campos = useMemo(() => (rascunho ? lerCampos(rascunho) : []), [rascunho]);

  useEffect(() => {
    let vivo = true;
    Promise.all([buscarCarrossel({ data: { slug } }), buscarAtivosCarrossel()])
      .then(([c, ats]) => {
        if (!vivo) return;
        setCarrossel(c as Carrossel);
        setAtivos(ats);
        setIndice(0);
        setRascunho(c.slides[0]?.html ?? "");
      })
      .catch((e) => vivo && setErro(`Não consegui abrir este carrossel. ${mensagemDoErro(e)}`));
    return () => {
      vivo = false;
    };
  }, [slug]);

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
    } catch (e) {
      setErro(
        `Não consegui salvar, e nada foi perdido: o texto continua aqui. ${mensagemDoErro(e)}`,
      );
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
      setErro(mensagemDoErro(e));
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
      setErro(mensagemDoErro(e));
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

  const nomesDeImagem = Object.keys(ativos?.imagens ?? {});

  return (
    <div className="polia-v3 flex h-screen flex-col bg-[var(--bg)]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] px-6 py-4 md:px-10">
        <div className="flex items-center gap-6">
          <Link
            to="/conteudo-polia"
            className="flex items-center gap-2 font-sans text-[14px] text-[var(--ink-soft)] no-underline hover:text-[var(--ink)]"
          >
            <ArrowLeft size={18} aria-hidden="true" />
            Carrosséis
          </Link>
          <span className="font-sans text-[14px] text-[var(--muted)]">
            {carrossel?.titulo ?? "Carregando…"}
          </span>
        </div>

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
            style={{ width: 432, height: 540 }}
          >
            <iframe
              title="Prancha"
              srcDoc={docPreview}
              style={{
                width: 1080,
                height: 1350,
                border: "none",
                transform: "scale(0.4)",
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
          <p className="max-w-[432px] text-center font-sans text-[12px] text-[var(--muted)]">
            1080 &times; 1350, que é o tamanho que o Instagram pede no feed.
          </p>
        </section>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden p-6">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
              {(["campos", "html"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  className={`rounded-md px-3 py-1.5 font-sans text-[13px] ${
                    modo === m
                      ? "bg-white text-[var(--ink)]"
                      : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                  }`}
                >
                  {m === "campos" ? "Conteúdo" : "HTML"}
                </button>
              ))}
            </div>
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

          {modo === "campos" ? (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {campos.length === 0 ? (
                <p className="font-sans text-[14px] text-[var(--muted)]">
                  Esta prancha não tem campo marcado. Use a aba HTML.
                </p>
              ) : (
                campos.map((campo) => (
                  <div key={campo.indice} className="mb-5">
                    <label
                      htmlFor={`campo-${campo.indice}`}
                      className="mb-2 block font-sans text-[12px] tracking-[0.12em] text-[var(--muted)] uppercase"
                    >
                      {campo.rotulo}
                    </label>

                    {campo.tipo === "imagem" ? (
                      <div className="flex items-center gap-4">
                        <select
                          id={`campo-${campo.indice}`}
                          value={campo.valor}
                          onChange={(e) =>
                            setRascunho(escreverCampo(rascunho, campo.indice, e.target.value))
                          }
                          className="flex-1 rounded-lg border border-[var(--line)] bg-white px-3 py-2 font-sans text-[14px] text-[var(--ink)]"
                        >
                          {nomesDeImagem.map((nome) => (
                            <option key={nome} value={`{{img:${nome}}}`}>
                              {nome}
                            </option>
                          ))}
                          {nomesDeImagem.every((n) => `{{img:${n}}}` !== campo.valor) ? (
                            <option value={campo.valor}>(a que está lá)</option>
                          ) : null}
                        </select>
                        {ativos?.imagens[campo.valor.replace(/^\{\{img:|\}\}$/g, "")] ? (
                          <img
                            src={ativos.imagens[campo.valor.replace(/^\{\{img:|\}\}$/g, "")]}
                            alt=""
                            className="h-14 w-24 rounded border border-[var(--line)] bg-white object-contain"
                          />
                        ) : null}
                      </div>
                    ) : (
                      <textarea
                        id={`campo-${campo.indice}`}
                        value={campo.valor}
                        rows={Math.min(6, campo.valor.split("\n").length + 1)}
                        onChange={(e) =>
                          setRascunho(escreverCampo(rascunho, campo.indice, e.target.value))
                        }
                        className="w-full resize-y rounded-lg border border-[var(--line)] bg-white p-3 font-sans text-[15px] leading-[1.5] text-[var(--ink)]"
                      />
                    )}
                  </div>
                ))
              )}
              <p className="pb-2 font-sans text-[12px] text-[var(--muted)]">
                Cada linha aqui é uma linha na prancha. Enter quebra a linha no mesmo lugar em que
                ela quebra no desenho.
              </p>
            </div>
          ) : (
            <>
              <textarea
                aria-label="HTML da prancha"
                value={rascunho}
                onChange={(e) => setRascunho(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                className="min-h-0 flex-1 resize-none rounded-lg border border-[var(--line)] bg-white p-4 text-[12.5px] leading-[1.6] text-[var(--ink)]"
                style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
              <p className="mt-3 font-sans text-[12px] text-[var(--muted)]">
                A fonte entra por <code>{"{{fonte}}"}</code> e as ilustrações por{" "}
                <code>{"{{img:nome}}"}</code>. Disponíveis:{" "}
                {nomesDeImagem.join(", ") || "carregando"}.
              </p>
            </>
          )}
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
