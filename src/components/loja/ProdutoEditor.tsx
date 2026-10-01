import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Copy, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  duplicarProduto,
  excluirProduto,
  salvarProduto,
  type Categoria,
  type Produto,
} from "@/lib/loja.functions";
import {
  BUCKET_IMAGENS,
  centavosParaCampo,
  formatarCentavos,
  MAX_IMAGENS,
  nomeArquivoSeguro,
  primeiroErro,
  produtoSchema,
  reaisParaCentavos,
  slugify,
  TIPOS_IMAGEM,
  validarArquivoImagem,
  type ImagemProduto,
} from "@/lib/loja";
import { btnDanger, btnOutline, btnPrimary, inputClass, labelClass } from "@/lib/crm-ui";
import { useConfirmacao } from "@/components/crm/Confirmar";
import { toastErro, toastSucesso } from "@/lib/toast";

export interface ProdutoEditorProps {
  /** Serviço existente (edição) ou null (criação). */
  produto: Produto | null;
  categorias: Categoria[];
}

const secao = "rounded-2xl border border-[var(--line)] bg-white p-5";
const tituloSecao = "font-cabinet text-[17px] text-[var(--ink)]";
const dica = "mt-1 text-[12px] text-[var(--muted)]";
const erroCampo = "mt-1 text-[12px] text-[var(--danger)]";
const iconBtn =
  "flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--line)] bg-white text-[var(--ink-soft)] hover:border-[var(--secondary)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-30";

type Upload = { id: string; nome: string; estado: "enviando" | "erro"; erro?: string };

function moverItem<T>(lista: T[], i: number, direcao: -1 | 1): T[] {
  const alvo = i + direcao;
  if (alvo < 0 || alvo >= lista.length) return lista;
  const nova = [...lista];
  [nova[i], nova[alvo]] = [nova[alvo], nova[i]];
  return nova;
}

export function ProdutoEditor({ produto, categorias }: ProdutoEditorProps) {
  const navigate = useNavigate();
  const { confirmar, dialogo } = useConfirmacao();
  const ehNovo = produto === null;

  // Id gerado no client pra serviço novo: vira a pasta das fotos no bucket e
  // o id do insert, igual ao editor do blog.
  const idRef = useRef(produto?.id ?? crypto.randomUUID());
  const id = idRef.current;
  const [existeNoBanco, setExisteNoBanco] = useState(!ehNovo);

  const [nome, setNome] = useState(produto?.nome ?? "");
  const [slug, setSlug] = useState(produto?.slug ?? "");
  const [slugManual, setSlugManual] = useState(!ehNovo);
  const [categoriaId, setCategoriaId] = useState<string>(produto?.categoria_id ?? "");
  const [resumo, setResumo] = useState(produto?.resumo ?? "");
  const [descricao, setDescricao] = useState(produto?.descricao ?? "");
  const [sobOrcamento, setSobOrcamento] = useState(
    produto ? produto.preco_centavos === null : false,
  );
  const [preco, setPreco] = useState(centavosParaCampo(produto?.preco_centavos));
  const [precoOriginal, setPrecoOriginal] = useState(
    centavosParaCampo(produto?.preco_original_centavos),
  );
  const [prazo, setPrazo] = useState(produto?.prazo_entrega ?? "");
  const [itens, setItens] = useState<string[]>(produto?.itens ?? []);
  const [imagens, setImagens] = useState<ImagemProduto[]>(produto?.imagens ?? []);
  const [capaUrl, setCapaUrl] = useState<string | null>(produto?.capa_url ?? null);
  const [destaque, setDestaque] = useState(produto?.destaque ?? false);
  const [publicado, setPublicado] = useState(produto?.publicado ?? false);
  const [exigeBriefing, setExigeBriefing] = useState(produto?.exige_briefing ?? true);
  const [precoSugerido, setPrecoSugerido] = useState(produto?.preco_sugerido ?? false);

  const [uploads, setUploads] = useState<Upload[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [sujo, setSujo] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const primeiraRender = useRef(true);

  useEffect(() => {
    if (primeiraRender.current) {
      primeiraRender.current = false;
      return;
    }
    setSujo(true);
  }, [
    nome,
    slug,
    categoriaId,
    resumo,
    descricao,
    sobOrcamento,
    preco,
    precoOriginal,
    prazo,
    itens,
    imagens,
    capaUrl,
    destaque,
    publicado,
    exigeBriefing,
    precoSugerido,
  ]);

  // Fechar a aba com alteração não salva pede confirmação do navegador.
  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [sujo]);

  function mudarNome(v: string) {
    setNome(v);
    if (!slugManual) setSlug(slugify(v));
  }

  // -------------------------------------------------------------------------
  // Imagens
  // -------------------------------------------------------------------------

  async function enviarArquivos(arquivos: File[]) {
    const vagas =
      MAX_IMAGENS - imagens.length - uploads.filter((u) => u.estado === "enviando").length;
    if (vagas <= 0) {
      toastErro(`A galeria aceita até ${MAX_IMAGENS} imagens.`);
      return;
    }
    if (arquivos.length > vagas) toastErro(`Só cabem mais ${vagas}. As outras ficaram de fora.`);

    for (const arquivo of arquivos.slice(0, vagas)) {
      const uploadId = crypto.randomUUID();
      const problema = validarArquivoImagem(arquivo);
      if (problema) {
        setUploads((u) => [
          ...u,
          { id: uploadId, nome: arquivo.name, estado: "erro", erro: problema },
        ]);
        continue;
      }
      setUploads((u) => [...u, { id: uploadId, nome: arquivo.name, estado: "enviando" }]);
      const caminho = `${id}/${nomeArquivoSeguro(arquivo.name, arquivo.type, crypto.randomUUID())}`;
      const { error } = await supabase.storage.from(BUCKET_IMAGENS).upload(caminho, arquivo, {
        cacheControl: "31536000",
        contentType: arquivo.type,
        upsert: false,
      });
      if (error) {
        setUploads((u) =>
          u.map((x) =>
            x.id === uploadId
              ? { ...x, estado: "erro", erro: "A imagem não subiu. Tenta de novo." }
              : x,
          ),
        );
        continue;
      }
      const { data } = supabase.storage.from(BUCKET_IMAGENS).getPublicUrl(caminho);
      setImagens((lista) => [...lista, { url: data.publicUrl, alt: "" }]);
      // Primeira imagem vira capa sozinha; depois a Sil escolhe.
      setCapaUrl((atual) => atual ?? data.publicUrl);
      setUploads((u) => u.filter((x) => x.id !== uploadId));
    }
  }

  function removerImagem(url: string) {
    // O arquivo continua no bucket: duplicatas deste serviço podem apontar pra
    // ele. Só sai da galeria deste serviço.
    const restantes = imagens.filter((i) => i.url !== url);
    setImagens(restantes);
    if (capaUrl === url) setCapaUrl(restantes[0]?.url ?? null);
  }

  // -------------------------------------------------------------------------
  // Salvar
  // -------------------------------------------------------------------------

  function montar(): { ok: true; dados: unknown } | { ok: false } {
    const novosErros: Record<string, string> = {};
    let precoCentavos: number | null = null;
    let originalCentavos: number | null = null;

    if (!sobOrcamento) {
      const r = reaisParaCentavos(preco);
      if (!r.ok) novosErros.preco = r.erro;
      else if (r.centavos === null) novosErros.preco = "Coloca o preço ou marca sob orçamento.";
      else precoCentavos = r.centavos;

      const o = reaisParaCentavos(precoOriginal);
      if (!o.ok) novosErros.preco_original = o.erro;
      else originalCentavos = o.centavos;
    }

    const candidato = {
      nome,
      slug,
      categoria_id: categoriaId || null,
      resumo,
      descricao,
      preco_centavos: precoCentavos,
      preco_original_centavos: originalCentavos,
      prazo_entrega: prazo,
      itens: itens.map((i) => i.trim()).filter(Boolean),
      imagens: imagens.map((i) => ({ url: i.url, alt: i.alt.trim() })),
      capa_url: capaUrl,
      destaque,
      publicado,
      exige_briefing: exigeBriefing,
      preco_sugerido: precoSugerido,
    };

    const r = produtoSchema.safeParse(candidato);
    if (!r.success) {
      for (const issue of r.error.issues) {
        const campo = String(issue.path[0] ?? "geral");
        const chave = campo === "preco_original_centavos" ? "preco_original" : campo;
        if (!novosErros[chave]) novosErros[chave] = issue.message;
      }
    }
    setErros(novosErros);
    if (Object.keys(novosErros).length > 0) {
      toastErro(Object.values(novosErros)[0] ?? (r.success ? "" : primeiroErro(r.error)));
      return { ok: false };
    }
    return { ok: true, dados: candidato };
  }

  async function salvar() {
    if (uploads.some((u) => u.estado === "enviando")) {
      toastErro("Espera as imagens terminarem de subir.");
      return;
    }
    const m = montar();
    if (!m.ok) return;
    setSalvando(true);
    try {
      await salvarProduto({
        data: { id, novo: !existeNoBanco, dados: m.dados },
      });
      setSujo(false);
      toastSucesso(
        publicado ? "Salvo. Já está na vitrine." : "Salvo. Continua escondido da vitrine.",
      );
      if (!existeNoBanco) {
        setExisteNoBanco(true);
        navigate({ to: "/loja/produtos/$id", params: { id }, replace: true });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não deu pra salvar.";
      if (msg.includes("endereço")) setErros((x) => ({ ...x, slug: msg }));
      toastErro(msg);
    } finally {
      setSalvando(false);
    }
  }

  async function duplicar() {
    if (sujo) {
      const ok = await confirmar({
        titulo: "Duplicar sem salvar",
        descricao:
          "A cópia sai da versão que está salva no banco. O que foi mudado nesta tela e não foi salvo fica de fora.",
        rotuloConfirmar: "Duplicar mesmo assim",
      });
      if (!ok) return;
    }
    setOcupado(true);
    try {
      const r = await duplicarProduto({ data: { id } });
      toastSucesso("Cópia criada, escondida da vitrine.");
      navigate({ to: "/loja/produtos/$id", params: { id: r.id } });
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não deu pra duplicar.");
    } finally {
      setOcupado(false);
    }
  }

  async function excluir() {
    const ok = await confirmar({
      titulo: "Excluir este serviço",
      descricao: (
        <>
          <strong>{nome || "Este serviço"}</strong> sai da loja agora. Pedidos antigos continuam
          guardados com o nome e o preço da época. Não tem como desfazer.
        </>
      ),
      rotuloConfirmar: "Excluir definitivamente",
      perigo: true,
    });
    if (!ok) return;
    setOcupado(true);
    try {
      await excluirProduto({ data: { id } });
      setSujo(false);
      toastSucesso("Serviço excluído.");
      navigate({ to: "/loja/produtos" });
    } catch (e) {
      toastErro(e instanceof Error ? e.message : "Não deu pra excluir.");
      setOcupado(false);
    }
  }

  const previaPreco = (() => {
    if (sobOrcamento) return "Sob orçamento";
    const r = reaisParaCentavos(preco);
    return r.ok && r.centavos !== null ? formatarCentavos(r.centavos) : null;
  })();

  return (
    <div className="flex max-w-6xl flex-col gap-5">
      {dialogo}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/loja/produtos"
          className="text-[13px] text-[var(--muted)] no-underline hover:text-[var(--ink)]"
        >
          ← Serviços à venda
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {sujo && (
            <span className="flex items-center gap-1.5 text-[13px] text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--highlight)]" aria-hidden="true" />
              Alterações não salvas
            </span>
          )}
          {existeNoBanco && (
            <>
              <button
                type="button"
                onClick={duplicar}
                disabled={ocupado || salvando}
                className={`${btnOutline} inline-flex items-center gap-2`}
              >
                <Copy size={14} aria-hidden="true" />
                Duplicar
              </button>
              <button
                type="button"
                onClick={excluir}
                disabled={ocupado || salvando}
                className={`${btnDanger} inline-flex items-center gap-2`}
              >
                <Trash2 size={14} aria-hidden="true" />
                Excluir
              </button>
            </>
          )}
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || ocupado}
            className={`${btnPrimary} inline-flex items-center gap-2`}
          >
            {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {ehNovo && !existeNoBanco ? "Criar serviço" : "Salvar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
        {/* Coluna principal */}
        <div className="flex min-w-0 flex-col gap-5">
          <section className={secao}>
            <h2 className={tituloSecao}>O serviço</h2>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label htmlFor="nome" className={labelClass}>
                  Nome
                </label>
                <input
                  id="nome"
                  value={nome}
                  onChange={(e) => mudarNome(e.target.value)}
                  maxLength={120}
                  placeholder="Ex.: Identidade visual completa"
                  aria-invalid={erros.nome ? true : undefined}
                  className={inputClass}
                />
                {erros.nome && <p className={erroCampo}>{erros.nome}</p>}
              </div>

              <div>
                <label htmlFor="slug" className={labelClass}>
                  Endereço na loja
                </label>
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[13px] text-[var(--muted)]">/loja/</span>
                  <input
                    id="slug"
                    value={slug}
                    onChange={(e) => {
                      setSlugManual(true);
                      setSlug(e.target.value.toLowerCase());
                    }}
                    onBlur={() => setSlug((s) => slugify(s))}
                    maxLength={80}
                    aria-invalid={erros.slug ? true : undefined}
                    className={inputClass}
                  />
                </div>
                {erros.slug ? (
                  <p className={erroCampo}>{erros.slug}</p>
                ) : (
                  <p className={dica}>
                    {ehNovo
                      ? "Sai do nome sozinho. Dá pra trocar."
                      : "Trocar o endereço de um serviço publicado quebra link que já foi compartilhado."}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="resumo" className={labelClass}>
                  Resumo (aparece no card da vitrine)
                </label>
                <textarea
                  id="resumo"
                  value={resumo}
                  onChange={(e) => setResumo(e.target.value)}
                  maxLength={300}
                  rows={2}
                  className={inputClass}
                />
                <p className={dica}>{resumo.length}/300</p>
              </div>

              <div>
                <label htmlFor="descricao" className={labelClass}>
                  Descrição completa
                </label>
                <textarea
                  id="descricao"
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  maxLength={8000}
                  rows={8}
                  className={inputClass}
                />
                <p className={dica}>Texto simples. Linha em branco separa parágrafo.</p>
              </div>
            </div>
          </section>

          <section className={secao}>
            <h2 className={tituloSecao}>O que vem no pacote</h2>
            <p className={dica}>Um item por linha, na ordem em que aparece na página.</p>
            <ul className="mt-3 flex flex-col gap-2">
              {itens.map((item, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    value={item}
                    onChange={(e) =>
                      setItens((l) => l.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    maxLength={200}
                    aria-label={`Item ${i + 1} do pacote`}
                    placeholder="Ex.: 5 artes pro feed"
                    className={inputClass}
                  />
                  <button
                    type="button"
                    className={iconBtn}
                    onClick={() => setItens((l) => moverItem(l, i, -1))}
                    disabled={i === 0}
                    aria-label={`Subir item ${i + 1}`}
                  >
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    onClick={() => setItens((l) => moverItem(l, i, 1))}
                    disabled={i === itens.length - 1}
                    aria-label={`Descer item ${i + 1}`}
                  >
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={iconBtn}
                    onClick={() => setItens((l) => l.filter((_, j) => j !== i))}
                    aria-label={`Remover item ${i + 1}`}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setItens((l) => [...l, ""])}
              disabled={itens.length >= 30}
              className={`${btnOutline} mt-3 inline-flex items-center gap-2`}
            >
              <Plus size={14} aria-hidden="true" />
              Adicionar item
            </button>
            {erros.itens && <p className={erroCampo}>{erros.itens}</p>}
          </section>

          <section className={secao}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={tituloSecao}>Fotos</h2>
              <span className="text-[12px] text-[var(--muted)]">
                {imagens.length}/{MAX_IMAGENS} · JPG, PNG, WebP ou AVIF até 5 MB
              </span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={TIPOS_IMAGEM.join(",")}
              multiple
              hidden
              onChange={(e) => {
                const arquivos = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (arquivos.length) enviarArquivos(arquivos);
              }}
            />

            {imagens.length > 0 && (
              <ul className="mt-4 flex flex-col gap-3">
                {imagens.map((img, i) => (
                  <li
                    key={img.url}
                    className={`flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
                      capaUrl === img.url
                        ? "border-[var(--secondary)] bg-[var(--secondary-light)]/40"
                        : "border-[var(--line)]"
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.alt || ""}
                      className="h-20 w-20 shrink-0 rounded-lg border border-[var(--line)] object-cover"
                    />
                    <div className="min-w-[200px] flex-1">
                      <label htmlFor={`alt-${i}`} className={labelClass}>
                        Descrição da imagem (pra quem usa leitor de tela)
                      </label>
                      <input
                        id={`alt-${i}`}
                        value={img.alt}
                        onChange={(e) =>
                          setImagens((l) =>
                            l.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)),
                          )
                        }
                        maxLength={200}
                        placeholder="Ex.: mockup da papelaria com o logo novo"
                        className={inputClass}
                      />
                      <label className="mt-2 inline-flex items-center gap-2 text-[13px] text-[var(--ink-soft)]">
                        <input
                          type="radio"
                          name="capa"
                          checked={capaUrl === img.url}
                          onChange={() => setCapaUrl(img.url)}
                        />
                        Usar como capa
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() => setImagens((l) => moverItem(l, i, -1))}
                        disabled={i === 0}
                        aria-label={`Subir imagem ${i + 1}`}
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={iconBtn}
                        onClick={() => setImagens((l) => moverItem(l, i, 1))}
                        disabled={i === imagens.length - 1}
                        aria-label={`Descer imagem ${i + 1}`}
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className={`${iconBtn} hover:border-[var(--danger)] hover:text-[var(--danger)]`}
                        onClick={() => removerImagem(img.url)}
                        aria-label={`Remover imagem ${i + 1}`}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {uploads.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2" aria-live="polite">
                {uploads.map((u) => (
                  <li
                    key={u.id}
                    className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-[13px] ${
                      u.estado === "erro"
                        ? "border border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]"
                        : "border border-[var(--line)] text-[var(--ink-soft)]"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      {u.estado === "enviando" && (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      )}
                      {u.nome}: {u.estado === "enviando" ? "enviando..." : u.erro}
                    </span>
                    {u.estado === "erro" && (
                      <button
                        type="button"
                        onClick={() => setUploads((l) => l.filter((x) => x.id !== u.id))}
                        aria-label="Dispensar aviso"
                        className="text-[var(--danger)]"
                      >
                        <X size={14} aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={imagens.length >= MAX_IMAGENS}
              className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-6 text-[13px] text-[var(--muted)] transition-colors hover:border-[var(--secondary)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Upload size={20} aria-hidden="true" />
              {imagens.length === 0 ? "Enviar fotos (dá pra escolher várias)" : "Enviar mais fotos"}
            </button>
            {erros.imagens && <p className={erroCampo}>{erros.imagens}</p>}
            {erros.capa_url && <p className={erroCampo}>{erros.capa_url}</p>}
          </section>
        </div>

        {/* Lateral */}
        <aside className="flex flex-col gap-5">
          <section className={secao}>
            <h2 className={tituloSecao}>Na vitrine</h2>
            <div className="mt-3 flex flex-col gap-3">
              <Caixa
                id="publicado"
                marcado={publicado}
                onChange={setPublicado}
                rotulo="Publicado"
                dica="Desmarcado, o serviço fica escondido da loja."
              />
              <Caixa
                id="destaque"
                marcado={destaque}
                onChange={setDestaque}
                rotulo="Destaque"
                dica="Aparece primeiro, com mais espaço."
              />
            </div>
          </section>

          <section className={secao}>
            <h2 className={tituloSecao}>Preço</h2>
            <div className="mt-3 flex flex-col gap-3">
              <Caixa
                id="sob-orcamento"
                marcado={sobOrcamento}
                onChange={setSobOrcamento}
                rotulo="Sob orçamento"
                dica="Sem preço fixo: o botão vira pedido de orçamento, não compra."
              />
              {!sobOrcamento && (
                <>
                  <div>
                    <label htmlFor="preco" className={labelClass}>
                      Preço (R$)
                    </label>
                    <input
                      id="preco"
                      inputMode="decimal"
                      value={preco}
                      onChange={(e) => setPreco(e.target.value)}
                      placeholder="290,00"
                      aria-invalid={erros.preco ? true : undefined}
                      className={inputClass}
                    />
                    {erros.preco ? (
                      <p className={erroCampo}>{erros.preco}</p>
                    ) : (
                      previaPreco && <p className={dica}>Na loja: {previaPreco}</p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="preco-original" className={labelClass}>
                      Preço riscado (opcional)
                    </label>
                    <input
                      id="preco-original"
                      inputMode="decimal"
                      value={precoOriginal}
                      onChange={(e) => setPrecoOriginal(e.target.value)}
                      placeholder="390,00"
                      aria-invalid={erros.preco_original ? true : undefined}
                      className={inputClass}
                    />
                    {erros.preco_original ? (
                      <p className={erroCampo}>{erros.preco_original}</p>
                    ) : (
                      <p className={dica}>Aparece cortado ao lado do preço. Precisa ser maior.</p>
                    )}
                  </div>
                </>
              )}
              <Caixa
                id="preco-sugerido"
                marcado={precoSugerido}
                onChange={setPrecoSugerido}
                rotulo="Preço ainda é sugestão"
                dica="Marcador só daqui de dentro, pra lembrar de revisar. A cliente não vê."
              />
            </div>
          </section>

          <section className={secao}>
            <h2 className={tituloSecao}>Detalhes</h2>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label htmlFor="categoria" className={labelClass}>
                  Categoria
                </label>
                <select
                  id="categoria"
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                      {c.ativo ? "" : " (desligada)"}
                    </option>
                  ))}
                </select>
                {categorias.length === 0 && (
                  <p className={dica}>
                    Nenhuma categoria ainda.{" "}
                    <Link to="/loja/categorias" className="text-[var(--secondary-text)]">
                      Criar categoria
                    </Link>
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="prazo" className={labelClass}>
                  Prazo de entrega
                </label>
                <input
                  id="prazo"
                  value={prazo}
                  onChange={(e) => setPrazo(e.target.value)}
                  maxLength={80}
                  placeholder="Ex.: até 10 dias úteis"
                  className={inputClass}
                />
              </div>
              <Caixa
                id="exige-briefing"
                marcado={exigeBriefing}
                onChange={setExigeBriefing}
                rotulo="Pede briefing depois do pagamento"
                dica="A cliente responde umas perguntas sobre a marca depois de pagar."
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Caixa({
  id,
  marcado,
  onChange,
  rotulo,
  dica: textoDica,
}: {
  id: string;
  marcado: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
  dica?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={marcado}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--secondary-text)]"
        aria-describedby={textoDica ? `${id}-dica` : undefined}
      />
      <div>
        <label htmlFor={id} className="text-[14px] font-medium text-[var(--ink)]">
          {rotulo}
        </label>
        {textoDica && (
          <p id={`${id}-dica`} className="text-[12px] text-[var(--muted)]">
            {textoDica}
          </p>
        )}
      </div>
    </div>
  );
}
