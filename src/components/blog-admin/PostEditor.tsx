import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { BlogPost, BlogPostInsert, BlogPostUpdate } from "@/lib/blog-types";
import { parseMarkdownToDoc, serializeDocToMarkdown, type DocNode } from "@/lib/blogMarkdown";
import { renderBlogMarkdown } from "@/lib/blogRenderMarkdown";
import { saoPauloLocalInputToUtcIso, utcIsoToSaoPauloLocalInput } from "@/lib/timezone";
import { TiptapEditor } from "./TiptapEditor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TOKEN_BRIDGE_V3 } from "@/lib/uiTokenBridge";

export type PostEditorProps = {
  /** Post existente (modo edição) ou null (modo criação). */
  post: BlogPost | null;
};

const CATEGORIAS = ["Método", "Preço", "Números", "Identidade", "Rotina", "Motivação"] as const;

type QuandoPublicar = "agora" | "agendar" | "rascunho";

const TIPOS_IMAGEM_ACEITOS = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const TAMANHO_MAX_BYTES = 5 * 1024 * 1024;

const AUTOSAVE_DEBOUNCE_MS = 3000;

function gerarSlug(titulo: string): string {
  return titulo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function contarPalavras(doc: DocNode): number {
  let total = 0;
  function andar(node: DocNode) {
    if (node.type === "text" && node.text) {
      total += node.text.trim().split(/\s+/).filter(Boolean).length;
    }
    (node.content ?? []).forEach(andar);
  }
  andar(doc);
  return total;
}

function calcularTempoLeitura(doc: DocNode): number {
  const palavras = contarPalavras(doc);
  return Math.max(1, Math.ceil(palavras / 200));
}

function localStorageKey(postId: string): string {
  return `polia-blog-rascunho-${postId}`;
}

// Nunca usa file.name cru no caminho do Storage (path traversal via "../" ou
// "/" num nome de arquivo forjado) — só a extensão, validada por allowlist.
function extensaoSegura(nomeArquivo: string): string {
  const match = nomeArquivo.match(/\.([a-zA-Z0-9]{1,5})$/);
  const ext = match?.[1]?.toLowerCase();
  return ext && /^(jpe?g|png|webp)$/.test(ext) ? ext : "jpg";
}

function formatarDataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatarDataHoraCurta(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type EstadoUpload = "vazio" | "enviando" | "pronto" | "erro";

// "validacao" = formato/tamanho errado, reenviar o mesmo arquivo dá o mesmo
// erro de novo (precisa escolher outro). "rede" = falha de upload, reenviar
// o mesmo arquivo faz sentido.
type ErroUpload = { mensagem: string; tipo: "validacao" | "rede" };

type ErroSalvar =
  | { tipo: "titulo_vazio" }
  | { tipo: "slug_duplicado" }
  | { tipo: "sessao_expirada" }
  | { tipo: "sem_permissao" }
  | { tipo: "generico" };

export function PostEditor({ post }: PostEditorProps) {
  const navigate = useNavigate();
  const isEditMode = post !== null;

  // Id gerado no client assim que o componente monta (post novo), ou o id
  // real do post existente. É esse id que vira pasta no Storage e é usado
  // no insert explícito (não deixa o banco gerar).
  const postIdRef = useRef<string>(post?.id ?? crypto.randomUUID());
  const postId = postIdRef.current;

  const [titulo, setTitulo] = useState(post?.titulo ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(isEditMode);
  const [doc, setDoc] = useState<DocNode>(() => parseMarkdownToDoc(post?.conteudo_md ?? ""));
  const [categoria, setCategoria] = useState(post?.categoria ?? CATEGORIAS[0]);
  const [resumo, setResumo] = useState(post?.resumo ?? "");
  const [capaUrl, setCapaUrl] = useState<string | null>(post?.capa_url ?? null);

  const [quandoPublicar, setQuandoPublicar] = useState<QuandoPublicar>(() => {
    if (!isEditMode) return "agora"; // post novo: ação principal padrão é Publicar
    if (post?.publicado) return "agora";
    if (post?.agendado_para) return "agendar";
    return "rascunho";
  });

  // Estado de publicação REALMENTE salvo no banco (não o que está selecionado
  // no formulário agora) — usado pra saber se o post está "publicado em
  // revisão" / "agendado em revisão" e pra nunca reusar uma data de
  // publicação de uma versão anterior depois de despublicar.
  const [statusSalvo, setStatusSalvo] = useState({
    publicado: post?.publicado ?? false,
    publicadoEm: post?.publicado_em ?? (null as string | null),
    agendadoPara: post?.agendado_para ?? (null as string | null),
  });
  const [dataAgendamento, setDataAgendamento] = useState(() =>
    post?.agendado_para ? utcIsoToSaoPauloLocalInput(post.agendado_para) : "",
  );
  const [erroAgendamento, setErroAgendamento] = useState<string | null>(null);

  const [erroTitulo, setErroTitulo] = useState<string | null>(null);
  const [erroSlug, setErroSlug] = useState<string | null>(null);
  const [erroSalvar, setErroSalvar] = useState<ErroSalvar | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusaoAberto, setConfirmarExclusaoAberto] = useState(false);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [autosaveTexto, setAutosaveTexto] = useState<string | null>(null);

  const [uploadCorpoEstado, setUploadCorpoEstado] = useState<EstadoUpload>("vazio");
  const [uploadCorpoErro, setUploadCorpoErro] = useState<ErroUpload | null>(null);
  const [uploadCapaEstado, setUploadCapaEstado] = useState<EstadoUpload>(
    post?.capa_url ? "pronto" : "vazio",
  );
  const [uploadCapaErro, setUploadCapaErro] = useState<ErroUpload | null>(null);
  const [previewLocalCorpo, setPreviewLocalCorpo] = useState<string | null>(null);
  const [previewLocalCapa, setPreviewLocalCapa] = useState<string | null>(null);

  // Revoga a URL local anterior sempre que troca (e no unmount) — evita
  // vazar memória com blob URLs esquecidas.
  useEffect(() => {
    return () => {
      if (previewLocalCorpo) URL.revokeObjectURL(previewLocalCorpo);
    };
  }, [previewLocalCorpo]);
  useEffect(() => {
    return () => {
      if (previewLocalCapa) URL.revokeObjectURL(previewLocalCapa);
    };
  }, [previewLocalCapa]);

  const tituloInputRef = useRef<HTMLInputElement>(null);
  const slugInputRef = useRef<HTMLInputElement>(null);
  const corpoFileInputRef = useRef<HTMLInputElement>(null);
  const capaFileInputRef = useRef<HTMLInputElement>(null);

  // Uma vez que o botão publicar/agendar tiver sido clicado nesta sessão de
  // edição, o autosave para de rodar (o estado de publicação já foi decidido
  // explicitamente e não pode ser pisado silenciosamente por um autosave que
  // só grava rascunho).
  const publicacaoDecididaRef = useRef(false);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeiraRenderRef = useRef(true);

  function validarTitulo(valor: string): boolean {
    if (!valor.trim()) {
      setErroTitulo("Dá um título pro post antes de publicar.");
      tituloInputRef.current?.focus();
      return false;
    }
    setErroTitulo(null);
    return true;
  }

  function handleTituloChange(valor: string) {
    setTitulo(valor);
    if (erroTitulo && valor.trim()) setErroTitulo(null);
    if (!slugEditadoManualmente) setSlug(gerarSlug(valor));
  }

  function handleSlugChange(valor: string) {
    setSlugEditadoManualmente(true);
    setSlug(valor);
    if (erroSlug) setErroSlug(null);
  }

  function guardarRedeDeSeguranca() {
    try {
      const markdown = serializeDocToMarkdown(doc);
      localStorage.setItem(
        localStorageKey(postId),
        JSON.stringify({
          titulo,
          slug,
          resumo,
          categoria,
          conteudo_md: markdown,
          capa_url: capaUrl,
        }),
      );
    } catch {
      // localStorage indisponível (modo privado, quota etc.): segue sem rede
      // de segurança, mas não trava o fluxo de salvar.
    }
  }

  function limparRedeDeSeguranca() {
    try {
      localStorage.removeItem(localStorageKey(postId));
    } catch {
      // sem-op
    }
  }

  /**
   * Monta o payload comum (conteúdo + metadados) e decide os campos de
   * publicação conforme `modo`. `modo` null = autosave (não mexe em
   * publicado/agendado_para).
   */
  async function montarPayload(
    modo: QuandoPublicar | null,
  ): Promise<{ ok: true; payload: BlogPostUpdate } | { ok: false; erro: ErroSalvar }> {
    const markdown = serializeDocToMarkdown(doc);
    const tempoLeitura = calcularTempoLeitura(doc);

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return { ok: false, erro: { tipo: "sessao_expirada" } };
    }

    const payload: BlogPostUpdate = {
      titulo: titulo.trim(),
      slug: slug.trim(),
      resumo: resumo.trim() || null,
      categoria: categoria || null,
      conteudo_md: markdown,
      capa_url: capaUrl,
      tempo_leitura: tempoLeitura,
      autor_id: userData.user.id,
    };

    if (modo === "agora") {
      payload.publicado = true;
      // Não sobrescreve publicado_em se o post JÁ ESTÁ publicado agora
      // (atualizar um post no ar não muda a data de publicação original).
      // Usa statusSalvo (o que está realmente salvo), não a prop `post`
      // original — senão despublicar e republicar na mesma sessão reusaria
      // a data antiga.
      payload.publicado_em = statusSalvo.publicadoEm ?? new Date().toISOString();
      payload.agendado_para = null;
    } else if (modo === "agendar") {
      payload.publicado = false;
      payload.agendado_para = saoPauloLocalInputToUtcIso(dataAgendamento);
      payload.publicado_em = null;
    } else if (modo === "rascunho") {
      payload.publicado = false;
      payload.agendado_para = null;
      payload.publicado_em = null;
    }
    // modo === null (autosave): não seta publicado/agendado_para/publicado_em.

    return { ok: true, payload };
  }

  async function salvar(modo: QuandoPublicar | null): Promise<boolean> {
    // Autosave nunca roda depois que a publicação foi decidida explicitamente
    // nesta sessão.
    if (modo === null && publicacaoDecididaRef.current) return false;

    if (modo !== null) {
      if (!validarTitulo(titulo)) return false;

      if (modo === "agendar") {
        if (!dataAgendamento) {
          setErroAgendamento("Escolhe uma data pra agendar.");
          return false;
        }
        const dataUtc = saoPauloLocalInputToUtcIso(dataAgendamento);
        if (new Date(dataUtc).getTime() <= Date.now()) {
          setErroAgendamento("Essa data já passou. Escolha uma hora à frente.");
          return false;
        }
        setErroAgendamento(null);
      }
    }

    // Rede de segurança: guarda uma cópia local ANTES de tentar salvar no
    // Supabase, pra "seu texto está guardado" ser verdade de fato.
    guardarRedeDeSeguranca();

    const resultado = await montarPayload(modo);
    if (!resultado.ok) {
      setErroSalvar(resultado.erro);
      return false;
    }

    setErroSalvar(null);
    setErroSlug(null);

    const query = isEditMode
      ? supabase.from("blog_posts").update(resultado.payload).eq("id", postId)
      : supabase.from("blog_posts").insert({
          id: postId,
          ...resultado.payload,
          titulo: resultado.payload.titulo ?? "",
          slug: resultado.payload.slug ?? "",
        } satisfies BlogPostInsert);

    const { error } = await query;

    if (error) {
      if (error.code === "23505") {
        setErroSalvar({ tipo: "slug_duplicado" });
        slugInputRef.current?.focus();
        return false;
      }
      if (
        error.code === "PGRST301" ||
        error.message?.toLowerCase().includes("jwt") ||
        error.message?.toLowerCase().includes("session")
      ) {
        setErroSalvar({ tipo: "sessao_expirada" });
        return false;
      }
      if (error.code === "42501") {
        setErroSalvar({ tipo: "sem_permissao" });
        setTimeout(() => navigate({ to: "/blog" }), 2500);
        return false;
      }
      setErroSalvar({ tipo: "generico" });
      return false;
    }

    limparRedeDeSeguranca();

    if (modo !== null) {
      publicacaoDecididaRef.current = true;
      setStatusSalvo({
        publicado: resultado.payload.publicado ?? false,
        publicadoEm: (resultado.payload.publicado_em as string | null) ?? null,
        agendadoPara: (resultado.payload.agendado_para as string | null) ?? null,
      });
    }

    return true;
  }

  async function handleBotaoPrincipal() {
    setSalvando(true);
    const ok = await salvar(quandoPublicar);
    setSalvando(false);
    if (ok) {
      setAutosaveTexto(null);
      if (!isEditMode) {
        navigate({ to: "/blog/$id", params: { id: postId } });
      }
    }
  }

  // Autosave: debounce de ~3s depois de parar de digitar, salva os campos de
  // conteúdo como rascunho (sem tocar em publicado/agendado_para), a menos
  // que o botão de publicar/agendar já tenha sido clicado nesta sessão.
  useEffect(() => {
    if (primeiraRenderRef.current) {
      primeiraRenderRef.current = false;
      return;
    }
    if (publicacaoDecididaRef.current) return;
    if (!titulo.trim()) return; // nada pra salvar ainda

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      setAutosaveTexto("Salvando...");
      const ok = await salvar(null);
      setAutosaveTexto(ok ? "Salvo automaticamente" : null);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titulo, slug, resumo, categoria, doc, capaUrl]);

  // Falha genérica de salvar: uma tentativa automática antes de deixar só o
  // botão manual (rede instável costuma resolver sozinha numa segunda vez).
  const autoRetryFeitoRef = useRef(false);
  useEffect(() => {
    if (erroSalvar?.tipo === "generico" && !autoRetryFeitoRef.current) {
      autoRetryFeitoRef.current = true;
      const t = setTimeout(() => {
        handleBotaoPrincipal();
      }, 3000);
      return () => clearTimeout(t);
    }
    if (!erroSalvar) autoRetryFeitoRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [erroSalvar]);

  function validarArquivoImagem(file: File): string | null {
    if (!TIPOS_IMAGEM_ACEITOS.includes(file.type)) {
      return "Use JPG, PNG ou WebP.";
    }
    if (file.size > TAMANHO_MAX_BYTES) {
      return "Imagem acima de 5 MB. Reduz e envia de novo.";
    }
    return null;
  }

  async function subirImagem(
    file: File,
    kind: "corpo" | "capa",
  ): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
    const nomeArquivo = `${kind === "capa" ? "capa-" : ""}${crypto.randomUUID()}.${extensaoSegura(file.name)}`;
    const caminho = `${postId}/${nomeArquivo}`;

    const { error } = await supabase.storage.from("blog-media").upload(caminho, file, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) {
      return { ok: false, erro: "A imagem não subiu. Tenta de novo ou usa outra." };
    }

    const { data } = supabase.storage.from("blog-media").getPublicUrl(caminho);
    return { ok: true, url: data.publicUrl };
  }

  async function handleUploadCorpo(file: File, editorInsertUrl: (url: string) => void) {
    const erroValidacao = validarArquivoImagem(file);
    if (erroValidacao) {
      setUploadCorpoErro({ mensagem: erroValidacao, tipo: "validacao" });
      setUploadCorpoEstado("erro");
      return;
    }
    setUploadCorpoEstado("enviando");
    setUploadCorpoErro(null);
    const resultado = await subirImagem(file, "corpo");
    if (!resultado.ok) {
      setUploadCorpoErro({ mensagem: resultado.erro, tipo: "rede" });
      setUploadCorpoEstado("erro");
      return;
    }
    editorInsertUrl(resultado.url);
    setUploadCorpoEstado("pronto");
  }

  async function handleUploadCapa(file: File) {
    const erroValidacao = validarArquivoImagem(file);
    if (erroValidacao) {
      setUploadCapaErro({ mensagem: erroValidacao, tipo: "validacao" });
      setUploadCapaEstado("erro");
      return;
    }
    setUploadCapaEstado("enviando");
    setUploadCapaErro(null);
    const resultado = await subirImagem(file, "capa");
    if (!resultado.ok) {
      setUploadCapaErro({ mensagem: resultado.erro, tipo: "rede" });
      setUploadCapaEstado("erro");
      return;
    }
    setCapaUrl(resultado.url);
    setUploadCapaEstado("pronto");
  }

  const [ultimoArquivoCorpo, setUltimoArquivoCorpo] = useState<File | null>(null);
  const [ultimoArquivoCapa, setUltimoArquivoCapa] = useState<File | null>(null);

  function requestImageUploadFromEditor() {
    corpoFileInputRef.current?.click();
  }

  async function onCorpoFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUltimoArquivoCorpo(file);
    setPreviewLocalCorpo(URL.createObjectURL(file));
    await handleUploadCorpo(file, (url) => {
      setDoc((atual) => ({
        ...atual,
        content: [...(atual.content ?? []), { type: "image", attrs: { src: url, alt: "" } }],
      }));
    });
  }

  async function onCapaFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUltimoArquivoCapa(file);
    setPreviewLocalCapa(URL.createObjectURL(file));
    await handleUploadCapa(file);
  }

  async function handleExcluir() {
    setExcluindo(true);
    const { error } = await supabase.from("blog_posts").delete().eq("id", postId);
    setExcluindo(false);
    if (error) {
      setErroSalvar({ tipo: "generico" });
      setConfirmarExclusaoAberto(false);
      return;
    }
    limparRedeDeSeguranca();
    navigate({ to: "/blog" });
  }

  function handleQuandoPublicarChange(valor: QuandoPublicar) {
    setQuandoPublicar(valor);
    setErroAgendamento(null);
  }

  async function handleVoltarRascunho() {
    setSalvando(true);
    const ok = await salvar("rascunho");
    setSalvando(false);
    if (ok) {
      setQuandoPublicar("rascunho");
      setAutosaveTexto(null);
    }
  }

  const rotuloBotaoPrincipal = useMemo(() => {
    if (quandoPublicar === "agendar") return statusSalvo.agendadoPara ? "Reagendar" : "Agendar";
    if (quandoPublicar === "rascunho") return "Salvar rascunho";
    if (quandoPublicar === "agora" && statusSalvo.publicado) return "Atualizar";
    return "Publicar";
  }, [quandoPublicar, statusSalvo]);

  const previewHtml = useMemo(() => {
    if (!previewAberto) return "";
    return renderBlogMarkdown(serializeDocToMarkdown(doc));
  }, [previewAberto, doc]);

  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <a href="/blog" className="text-[14px] text-[var(--muted)] no-underline hover:underline">
            Blog
          </a>
          <span className="text-[var(--muted)]">/</span>
          <strong className="text-[15px] text-[var(--ink)]">
            {isEditMode ? "Editar post" : "Novo post"}
          </strong>
          {autosaveTexto && (
            <span className="ml-2 text-[13px] text-[var(--muted)]">{autosaveTexto}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isEditMode && (
            <button
              type="button"
              onClick={() => setConfirmarExclusaoAberto(true)}
              className="rounded-lg border border-[var(--danger)] px-4 py-2.5 text-[14px] font-semibold text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
            >
              Excluir
            </button>
          )}
          <button
            type="button"
            onClick={() => setPreviewAberto(true)}
            className="rounded-lg border border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--secondary)]"
          >
            Pré-visualizar
          </button>
          <button
            type="button"
            onClick={handleBotaoPrincipal}
            disabled={salvando}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--secondary)] px-5 py-2.5 text-[14px] font-semibold text-[var(--secondary-ink)] transition-[filter] hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {salvando && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            {rotuloBotaoPrincipal}
          </button>
        </div>
      </div>

      {erroSalvar && (
        <div className="mx-auto mt-4 max-w-[1200px] px-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-5 py-4">
            <p className="text-[14px] text-[var(--danger)]">
              {erroSalvar.tipo === "generico" &&
                "Não deu pra salvar agora. Seu texto está guardado; tenta de novo."}
              {erroSalvar.tipo === "slug_duplicado" &&
                "Já existe um post com esse endereço. Troca o final da URL."}
              {erroSalvar.tipo === "sem_permissao" && "Só administradoras editam o blog."}
              {erroSalvar.tipo === "sessao_expirada" &&
                "Sua sessão expirou. Entra de novo pra continuar."}
            </p>
            <div className="flex items-center gap-3">
              {erroSalvar.tipo === "sessao_expirada" && (
                <a
                  href="/auth/login"
                  className="rounded-lg bg-[var(--danger)] px-4 py-2 text-[13px] font-semibold text-white no-underline"
                >
                  Entrar
                </a>
              )}
              {(erroSalvar.tipo === "generico" || erroSalvar.tipo === "slug_duplicado") && (
                <button
                  type="button"
                  onClick={handleBotaoPrincipal}
                  className="rounded-lg border border-[var(--danger)] px-4 py-2 text-[13px] font-semibold text-[var(--danger)]"
                >
                  Tentar de novo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[1200px] grid-cols-1 gap-8 px-6 py-8 lg:grid-cols-[1fr_320px]">
        {/* Coluna principal */}
        <div className="min-w-0">
          <input
            ref={tituloInputRef}
            type="text"
            value={titulo}
            onChange={(e) => handleTituloChange(e.target.value)}
            placeholder="Título do post"
            aria-label="Título do post"
            aria-invalid={erroTitulo ? true : undefined}
            className={`w-full border-none bg-transparent text-[32px] text-[var(--ink)] outline-none placeholder:text-[var(--muted)] ${
              erroTitulo ? "text-[var(--danger)]" : ""
            }`}
          />
          {erroTitulo && <p className="mt-1 text-[13px] text-[var(--danger)]">{erroTitulo}</p>}

          <div className="mt-4">
            <TiptapEditor
              content={doc}
              onChange={setDoc}
              onRequestImageUpload={requestImageUploadFromEditor}
            />
          </div>

          <input
            ref={corpoFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={onCorpoFileSelected}
          />

          <div className="mt-4">
            {uploadCorpoEstado === "enviando" ? (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-5 py-4">
                {previewLocalCorpo && (
                  <img
                    src={previewLocalCorpo}
                    alt=""
                    aria-hidden="true"
                    className="h-12 w-12 rounded-lg object-cover"
                  />
                )}
                <Loader2
                  size={18}
                  className="animate-spin text-[var(--muted)]"
                  aria-hidden="true"
                />
                <p className="text-[14px] text-[var(--ink-soft)]">Enviando imagem...</p>
              </div>
            ) : uploadCorpoEstado === "erro" ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--danger)] bg-[var(--danger-soft)] px-5 py-4">
                <p className="text-[14px] text-[var(--danger)]">{uploadCorpoErro?.mensagem}</p>
                {ultimoArquivoCorpo && (
                  <button
                    type="button"
                    onClick={() => {
                      if (uploadCorpoErro?.tipo === "validacao") {
                        corpoFileInputRef.current?.click();
                        return;
                      }
                      handleUploadCorpo(ultimoArquivoCorpo, (url) => {
                        setDoc((atual) => ({
                          ...atual,
                          content: [
                            ...(atual.content ?? []),
                            { type: "image", attrs: { src: url, alt: "" } },
                          ],
                        }));
                      });
                    }}
                    className="rounded-lg border border-[var(--danger)] px-4 py-2 text-[13px] font-semibold text-[var(--danger)]"
                  >
                    {uploadCorpoErro?.tipo === "validacao"
                      ? "Escolher outra imagem"
                      : "Tentar de novo"}
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        {/* Painel lateral */}
        <aside className="flex flex-col gap-6">
          <section className="rounded-xl border border-[var(--line)] bg-white p-5">
            <h4 className="text-[17px] text-[var(--ink)]">Publicação</h4>
            <div className="mt-3 flex flex-col gap-3">
              {statusSalvo.publicado && statusSalvo.publicadoEm && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--secondary-light)] px-3 py-2">
                  <p className="text-[13px] font-semibold text-[var(--secondary-ink)]">
                    Publicado em {formatarDataCurta(statusSalvo.publicadoEm)}
                  </p>
                  <button
                    type="button"
                    onClick={handleVoltarRascunho}
                    disabled={salvando}
                    className="text-[13px] font-semibold text-[var(--secondary-ink)] underline disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Voltar a rascunho
                  </button>
                </div>
              )}
              {!statusSalvo.publicado && statusSalvo.agendadoPara && (
                <div className="rounded-lg bg-[var(--highlight)] px-3 py-2 text-[13px] font-semibold text-[var(--highlight-ink)]">
                  Agendado para {formatarDataHoraCurta(statusSalvo.agendadoPara)}
                </div>
              )}
              <div>
                <label
                  htmlFor="quando-publicar"
                  className="mb-1 block text-[13px] font-semibold text-[var(--ink-soft)]"
                >
                  Quando publicar
                </label>
                <select
                  id="quando-publicar"
                  value={quandoPublicar}
                  onChange={(e) => handleQuandoPublicarChange(e.target.value as QuandoPublicar)}
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)]"
                >
                  <option value="agora">Publicar agora</option>
                  <option value="agendar">Agendar</option>
                  <option value="rascunho">Manter como rascunho</option>
                </select>
              </div>

              {quandoPublicar === "agendar" && (
                <div>
                  <label
                    htmlFor="data-agendamento"
                    className="mb-1 block text-[13px] font-semibold text-[var(--ink-soft)]"
                  >
                    Data e hora
                  </label>
                  <input
                    id="data-agendamento"
                    type="datetime-local"
                    value={dataAgendamento}
                    onChange={(e) => {
                      setDataAgendamento(e.target.value);
                      if (erroAgendamento) setErroAgendamento(null);
                    }}
                    aria-invalid={erroAgendamento ? true : undefined}
                    className={`w-full rounded-lg border bg-white px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)] ${
                      erroAgendamento ? "border-[var(--danger)]" : "border-[var(--line)]"
                    }`}
                  />
                  <p className="mt-1 text-[13px] text-[var(--muted)]">
                    O post publica sozinho nessa data. Fuso de Brasília.
                  </p>
                  {erroAgendamento && (
                    <p className="mt-1 text-[13px] text-[var(--danger)]">{erroAgendamento}</p>
                  )}
                </div>
              )}

              <p className="text-[13px] text-[var(--muted)]">
                {quandoPublicar === "agendar"
                  ? "O post publica sozinho na data marcada."
                  : quandoPublicar === "rascunho"
                    ? "Fica só com você, sem aparecer no blog."
                    : "O post fica visível no blog assim que você publicar."}
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-white p-5">
            <h4 className="text-[17px] text-[var(--ink)]">Imagem de capa</h4>
            <input
              ref={capaFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={onCapaFileSelected}
            />
            <div className="mt-3">
              {uploadCapaEstado === "enviando" ? (
                <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-[var(--line)] bg-[var(--bg)]">
                  {previewLocalCapa && (
                    <img
                      src={previewLocalCapa}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 h-full w-full object-cover opacity-50"
                    />
                  )}
                  <Loader2
                    size={20}
                    className="relative animate-spin text-[var(--muted)]"
                    aria-hidden="true"
                  />
                </div>
              ) : uploadCapaEstado === "pronto" && capaUrl ? (
                <div className="group relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--line)]">
                  <img src={capaUrl} alt="Capa do post" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      setCapaUrl(null);
                      setUploadCapaEstado("vazio");
                    }}
                    aria-label="Remover capa"
                    className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-[var(--ink)] opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => capaFileInputRef.current?.click()}
                  className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--line)] bg-[var(--bg)] text-[13px] text-[var(--muted)] transition-colors hover:border-[var(--secondary)]"
                >
                  <Upload size={20} aria-hidden="true" />
                  Clique pra enviar a capa (16:9)
                </button>
              )}
              {uploadCapaEstado === "erro" && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2">
                  <p className="text-[13px] text-[var(--danger)]">{uploadCapaErro?.mensagem}</p>
                  {ultimoArquivoCapa && (
                    <button
                      type="button"
                      onClick={() => {
                        if (uploadCapaErro?.tipo === "validacao") {
                          capaFileInputRef.current?.click();
                          return;
                        }
                        handleUploadCapa(ultimoArquivoCapa);
                      }}
                      className="text-[13px] font-semibold text-[var(--danger)] underline"
                    >
                      {uploadCapaErro?.tipo === "validacao"
                        ? "Escolher outra imagem"
                        : "Tentar de novo"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-white p-5">
            <h4 className="text-[17px] text-[var(--ink)]">Detalhes</h4>
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <label
                  htmlFor="categoria"
                  className="mb-1 block text-[13px] font-semibold text-[var(--ink-soft)]"
                >
                  Categoria
                </label>
                <select
                  id="categoria"
                  value={categoria ?? CATEGORIAS[0]}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)]"
                >
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="resumo"
                  className="mb-1 block text-[13px] font-semibold text-[var(--ink-soft)]"
                >
                  Resumo (aparece no índice)
                </label>
                <textarea
                  id="resumo"
                  value={resumo}
                  onChange={(e) => setResumo(e.target.value)}
                  placeholder="Uma ou duas frases sobre o post."
                  className="min-h-[80px] w-full rounded-lg border border-[var(--line)] bg-white px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)]"
                />
              </div>

              <div>
                <label
                  htmlFor="slug"
                  className="mb-1 block text-[13px] font-semibold text-[var(--ink-soft)]"
                >
                  Endereço (URL)
                </label>
                <input
                  ref={slugInputRef}
                  id="slug"
                  type="text"
                  value={slug}
                  onChange={(e) => handleSlugChange(e.target.value)}
                  placeholder="titulo-do-post"
                  aria-invalid={erroSlug ? true : undefined}
                  className={`w-full rounded-lg border bg-white px-3 py-2.5 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--secondary)] ${
                    erroSlug ? "border-[var(--danger)]" : "border-[var(--line)]"
                  }`}
                />
                {erroSlug && <p className="mt-1 text-[13px] text-[var(--danger)]">{erroSlug}</p>}
              </div>
            </div>
          </section>
        </aside>
      </div>

      <AlertDialog open={confirmarExclusaoAberto} onOpenChange={setConfirmarExclusaoAberto}>
        <AlertDialogContent className="polia-v3 border border-[var(--line)] bg-white" style={TOKEN_BRIDGE_V3}>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[var(--ink)]">Excluir este post</AlertDialogTitle>
            <AlertDialogDescription className="text-[var(--ink-soft)]">
              Essa exclusão é definitiva, não tem como desfazer. O post some do blog e do painel
              agora mesmo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleExcluir();
              }}
              disabled={excluindo}
              className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]"
            >
              {excluindo ? "Excluindo..." : "Excluir definitivamente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previewAberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Pré-visualização do post"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
          onClick={() => setPreviewAberto(false)}
        >
          <div
            className="polia-v3 mx-auto my-10 max-w-3xl rounded-2xl bg-white shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
              <p className="text-[14px] font-semibold text-[var(--ink)]">Pré-visualização</p>
              <button
                type="button"
                onClick={() => setPreviewAberto(false)}
                aria-label="Fechar pré-visualização"
                className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-soft)] hover:bg-[var(--bg)]"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {/*
              Espelha src/routes/blog.$slug.tsx do polia-app (o post público
              real, já em .polia-v3): categoria em pill --highlight, título
              font-cabinet, corpo em --ink-soft com link sublinhado
              --secondary. Se o post público mudar de estilo, atualize aqui.
            */}
            <article className="bg-white px-6 py-10">
              {categoria && (
                <span className="inline-flex rounded-sm bg-[var(--highlight)] px-3 py-1 text-[13px] font-semibold text-[var(--highlight-ink)]">
                  {categoria}
                </span>
              )}
              <h1 className="font-cabinet mt-4 text-[32px] leading-[1.1] tracking-[-0.02em] text-[var(--ink)] md:text-[44px]">
                {titulo || "Título do post"}
              </h1>
              <div
                className="mt-8 [&>*+*]:mt-6 [&_p]:text-[18px] [&_p]:leading-[1.65] [&_p]:text-[var(--ink-soft)] [&_li]:text-[18px] [&_li]:leading-[1.65] [&_li]:text-[var(--ink-soft)] [&_h2]:mt-12 [&_h2]:text-[26px] [&_h2]:text-[var(--ink)] [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-3 [&_strong]:font-semibold [&_a]:text-[var(--ink)] [&_a]:underline [&_a]:decoration-[var(--secondary)] [&_a]:decoration-2 [&_a]:underline-offset-[3px] [&_blockquote]:my-12 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[var(--secondary)] [&_blockquote]:pl-6 [&_blockquote_p]:text-[26px] [&_blockquote_p]:font-medium [&_blockquote_p]:leading-[1.3] [&_blockquote_p]:text-[var(--ink)]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            </article>
          </div>
        </div>
      )}
    </div>
  );
}

export default PostEditor;
