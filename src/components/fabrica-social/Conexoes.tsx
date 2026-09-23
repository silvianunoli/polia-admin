import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Instagram,
  RefreshCw,
  Music2,
  ExternalLink,
  Unlink,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  metaCallback,
  tiktokCallback,
  fetchConnections,
  disconnectSocial,
  buildMetaOAuthUrl,
  buildTikTokOAuthUrl,
  tiktokConfigurado,
  type MetaCallbackResult,
  type SocialConnection,
} from "@/lib/fabrica-social/api";
import { Button, Card } from "@/components/fabrica-social/bits";
import { Callout } from "@/components/fabrica-social/Callout";
import { useBrands } from "@/lib/fabrica-social/useData";
import { fabricaSocialNaoConfigurado as isMockMode } from "@/lib/fabrica-social/supabase";
import { dataLocal } from "@/lib/fabrica-social/tempo";
import type { Brand } from "@/lib/fabrica-social/mock";

const APP_SEPARADO =
  import.meta.env.VITE_FABRICA_SOCIAL_APP_URL || "https://app.silvianunoli.com.br";

/*
  Terceira tela portada do Fábrica Social (23/09/2026) — mesma lógica do
  repo original (src/pages/Conexoes.tsx). Diferença real: o redirect URI
  cadastrado nos portais da Meta e do TikTok agora é o desta Central
  (office.usepolia.com.br/fabrica-social/conexoes/...), não mais o do app
  separado -- ver buildMetaOAuthUrl/buildTikTokOAuthUrl em
  src/lib/fabrica-social/api.ts.

  Uma tela, três rotas:

    /fabrica-social/conexoes          gerenciar
    /fabrica-social/conexoes/meta     retorno do OAuth da Meta   (code na URL)
    /fabrica-social/conexoes/tiktok   retorno do OAuth do TikTok (idem)

  O state do OAuth carrega o brandId em base64; a edge function confere que
  a marca é de quem está conectando.
*/

function paramsAtuais(): URLSearchParams {
  return new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
}

function decodificarBrand(rawState: string | null): string {
  try {
    return rawState ? JSON.parse(atob(rawState)).brandId : "";
  } catch {
    return "";
  }
}

/*
  Desconectar existe porque "Reconectar" nem sempre reabre a tela de
  autorização — o TikTok (e às vezes a Meta) pode pular o consentimento
  silenciosamente quando a pessoa já está logada e já autorizou esse app
  antes com os mesmos escopos, e aí nada muda. Apagar a conexão e clicar em
  "Conectar" (não "Reconectar") é o caminho confiável: sem conexão salva, o
  fluxo é o mesmo de uma conexão nova — já testado, já funciona.
*/
function BotaoDesconectar({
  brandId,
  platform,
}: {
  brandId: string;
  platform: "instagram" | "tiktok";
}) {
  const queryClient = useQueryClient();
  const desconectar = useMutation({
    mutationFn: () => disconnectSocial(brandId, platform),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["connections", brandId] }),
  });

  return (
    <button
      type="button"
      onClick={() => {
        if (
          window.confirm(
            "Desconectar? Você vai precisar autorizar de novo pra publicar nesta rede.",
          )
        ) {
          desconectar.mutate();
        }
      }}
      disabled={desconectar.isPending}
      title="Desconectar"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      {desconectar.isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Unlink className="h-3 w-3" />
      )}
      desconectar
    </button>
  );
}

function LinhaInstagram({ brand, ig }: { brand: Brand; ig?: SocialConnection }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        {ig ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Instagram className="h-3.5 w-3.5" /> @{ig.igUsername} conectado
            {ig.pageName && <span className="text-muted-foreground">· Página {ig.pageName}</span>}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Instagram className="h-3.5 w-3.5" /> Sem Instagram conectado
          </p>
        )}
      </div>
      {ig && <BotaoDesconectar brandId={brand.id} platform="instagram" />}
      <a href={buildMetaOAuthUrl(brand.id)}>
        <Button variant="outline">
          {ig ? <RefreshCw className="h-4 w-4" /> : <Instagram className="h-4 w-4" />}
          {ig ? "Reconectar" : "Conectar Instagram"}
        </Button>
      </a>
    </div>
  );
}

function LinhaTikTok({ brand, tt }: { brand: Brand; tt?: SocialConnection }) {
  const venceEm = tt?.refreshExpiresAt ? new Date(tt.refreshExpiresAt).getTime() : 0;
  const diasParaVencer = venceEm ? Math.ceil((venceEm - Date.now()) / 86_400_000) : null;
  const venceLogo = diasParaVencer !== null && diasParaVencer <= 30;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        {tt ? (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
            <Music2 className="h-3.5 w-3.5" />
            {tt.ttUsername ? `@${tt.ttUsername}` : (tt.ttDisplayName ?? "conta")} conectado
            {tt.ttDisplayName && tt.ttUsername && (
              <span className="text-muted-foreground">· {tt.ttDisplayName}</span>
            )}
            {venceLogo && tt.refreshExpiresAt && (
              <span className="text-orange-600 dark:text-orange-400">
                · autorização vence em {dataLocal(tt.refreshExpiresAt)} — reconecte
              </span>
            )}
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Music2 className="h-3.5 w-3.5" /> Sem TikTok conectado
          </p>
        )}
      </div>
      {tt && <BotaoDesconectar brandId={brand.id} platform="tiktok" />}
      {tiktokConfigurado ? (
        <a href={buildTikTokOAuthUrl(brand.id)}>
          <Button variant="outline">
            {tt ? <RefreshCw className="h-4 w-4" /> : <Music2 className="h-4 w-4" />}
            {tt ? "Reconectar" : "Conectar TikTok"}
          </Button>
        </a>
      ) : (
        <Button variant="outline" disabled title="Falta VITE_TIKTOK_CLIENT_KEY no .env">
          <Music2 className="h-4 w-4" /> TikTok não configurado
        </Button>
      )}
    </div>
  );
}

function LinhaMarca({ brand }: { brand: Brand }) {
  const { data: connections = [] } = useQuery({
    queryKey: ["connections", brand.id],
    queryFn: () => fetchConnections(brand.id),
    enabled: !isMockMode,
  });
  const ig = connections.find((c) => c.platform === "instagram");
  const tt = connections.find((c) => c.platform === "tiktok");

  return (
    <Card className="space-y-3">
      <p className="flex items-center gap-2 font-medium">
        <span className="text-2xl">{brand.emoji}</span> {brand.name}
      </p>
      <LinhaInstagram brand={brand} ig={ig} />
      <LinhaTikTok brand={brand} tt={tt} />
    </Card>
  );
}

function GerenciarConexoes() {
  const { data: brands = [] } = useBrands();
  const minhas = brands.filter((b) => !b.isDemo);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10 md:px-10">
      <h1 className="text-3xl font-bold tracking-tight">Conexões</h1>
      <p className="mt-2 text-muted-foreground">
        Instagram e TikTok conectados por marca — é por aqui que os posts saem.
      </p>

      <div className="mt-8 space-y-4">
        {minhas.length === 0 ? (
          <Callout emoji="🏪">
            Nenhuma marca sua ainda. Crie uma em{" "}
            <a
              href={`${APP_SEPARADO}/brands`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Marcas <ExternalLink className="h-3 w-3 opacity-60" />
            </a>{" "}
            para conectar as redes.
          </Callout>
        ) : (
          <div className="space-y-2">
            {minhas.map((b) => (
              <LinhaMarca key={b.id} brand={b} />
            ))}
          </div>
        )}

        <Callout emoji="🔑">
          <strong>Reconectar</strong> gera um token novo. É o que se faz quando uma permissão é
          adicionada no painel da Meta ou do TikTok: o token já guardado não ganha permissão nova
          sozinho. Na tela de autorização, deixe todas as caixas marcadas.
        </Callout>

        {!tiktokConfigurado && (
          <Callout emoji="🎵">
            <strong>TikTok ainda não está ligado.</strong> Falta o app no portal do TikTok (Login
            Kit + Content Posting API) e a chave dele em <code>VITE_TIKTOK_CLIENT_KEY</code>.
          </Callout>
        )}

        {tiktokConfigurado && (
          <Callout emoji="🎵">
            <strong>TikTok:</strong> a autorização vale por 1 ano. Enquanto o app não passar na
            auditoria do TikTok, o post sai como <em>só eu</em> (privado) — a Biblioteca mostra isso
            ao lado do resultado.
          </Callout>
        )}
      </div>
    </div>
  );
}

function RetornoMeta() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"working" | "select" | "done" | "error">("working");
  const [message, setMessage] = useState("");
  const [pages, setPages] = useState<NonNullable<MetaCallbackResult["pages"]>>([]);
  const [brandId, setBrandId] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // StrictMode: o code do OAuth só pode ser trocado uma vez
    ran.current = true;

    const params = paramsAtuais();
    const code = params.get("code") ?? undefined;
    const errorParam = params.get("error_description") ?? params.get("error");

    if (errorParam) {
      setState("error");
      setMessage(errorParam);
      return;
    }
    const parsedBrand = decodificarBrand(params.get("state"));
    if (!code || !parsedBrand) {
      setState("error");
      setMessage("Retorno inválido da Meta — refaça a conexão a partir da página Conexões.");
      return;
    }
    setBrandId(parsedBrand);

    metaCallback({ brandId: parsedBrand, code })
      .then((result) => {
        if (result.requiresPageSelection && result.pages) {
          setPages(result.pages);
          setState("select");
        } else {
          setMessage(result.ig_username ? `@${result.ig_username}` : "");
          setState("done");
          queryClient.invalidateQueries({ queryKey: ["connections"] });
        }
      })
      .catch((e) => {
        setState("error");
        setMessage(e instanceof Error ? e.message : String(e));
      });
  }, [queryClient]);

  async function choosePage(pageId: string) {
    setState("working");
    try {
      const result = await metaCallback({ brandId, pageId });
      setMessage(result.ig_username ? `@${result.ig_username}` : "");
      setState("done");
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      {state === "working" && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 font-medium">Conectando com a Meta…</p>
        </>
      )}

      {state === "select" && (
        <Card className="w-full space-y-3 text-left">
          <p className="font-semibold">Qual Página usar para esta marca?</p>
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => choosePage(p.id)}
              disabled={!p.hasInstagram}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              <span>{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.hasInstagram ? "Instagram vinculado ✓" : "sem Instagram"}
              </span>
            </button>
          ))}
        </Card>
      )}

      {state === "done" && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="mt-4 text-lg font-semibold">Instagram conectado! {message}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Agora os posts desta marca podem ser publicados e agendados.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/fabrica-social/conexoes" })}>
            Voltar para Conexões
          </Button>
        </>
      )}

      {state === "error" && (
        <>
          <XCircle className="h-12 w-12 text-destructive" />
          <p className="mt-4 font-semibold">Não consegui conectar</p>
          <p className="mt-1 max-w-sm break-words text-sm text-muted-foreground">{message}</p>
          <Link to="/fabrica-social/conexoes" className="mt-4 text-sm text-primary hover:underline">
            Voltar para Conexões
          </Link>
        </>
      )}
    </div>
  );
}

function RetornoTikTok() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // o code só serve uma vez; StrictMode monta duas
    ran.current = true;

    const params = paramsAtuais();
    const code = params.get("code");
    const errorParam = params.get("error_description") ?? params.get("error");

    if (errorParam) {
      setState("error");
      setMessage(errorParam);
      return;
    }
    const brandId = decodificarBrand(params.get("state"));
    if (!code || !brandId) {
      setState("error");
      setMessage("Retorno inválido do TikTok — refaça a conexão a partir da página Conexões.");
      return;
    }

    tiktokCallback({ brandId, code })
      .then((result) => {
        setMessage(result.tt_username ? `@${result.tt_username}` : (result.tt_display_name ?? ""));
        setState("done");
        queryClient.invalidateQueries({ queryKey: ["connections"] });
      })
      .catch((e) => {
        setState("error");
        setMessage(e instanceof Error ? e.message : String(e));
      });
  }, [queryClient]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-4 text-center">
      {state === "working" && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="mt-4 font-medium">Conectando com o TikTok…</p>
        </>
      )}

      {state === "done" && (
        <>
          <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          <p className="mt-4 text-lg font-semibold">TikTok conectado! {message}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Em "Criar postagem", marque o TikTok como destino. Vídeo vira vídeo; foto e carrossel
            viram post de fotos.
          </p>
          <Button className="mt-4" onClick={() => navigate({ to: "/fabrica-social/conexoes" })}>
            Voltar para Conexões
          </Button>
        </>
      )}

      {state === "error" && (
        <>
          <XCircle className="h-12 w-12 text-destructive" />
          <p className="mt-4 font-semibold">Não consegui conectar</p>
          <p className="mt-1 max-w-sm break-words text-sm text-muted-foreground">{message}</p>
          <Link to="/fabrica-social/conexoes" className="mt-4 text-sm text-primary hover:underline">
            Voltar para Conexões
          </Link>
        </>
      )}
    </div>
  );
}

export function Conexoes() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const params = paramsAtuais();
  // Sem retorno de OAuth na URL, a rota é a tela de gerenciar — não um erro.
  const veioDeFora = params.has("code") || params.has("error") || params.has("error_description");
  if (!veioDeFora) return <GerenciarConexoes />;
  return pathname.replace(/\/$/, "").endsWith("/tiktok") ? <RetornoTikTok /> : <RetornoMeta />;
}
