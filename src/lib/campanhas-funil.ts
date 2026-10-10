// Funil próprio dos anúncios (/campanhas, 09/10/2026). Não depende do pixel:
// a origem vem do cadastro. A landing passa origem + utm_* pro /auth/cadastro
// do polia-app, que grava em auth.users.raw_user_meta_data.origem_campanha
// (polia-app/src/lib/origemCampanha.ts). utm_content é o nome do anúncio
// (N01-nail, N07-confeiteira...), o mesmo ad_name do Meta, e é por ele que
// o gasto é cruzado.
//
// Mesma conta da consulta de referência em
// Campanhas/criativos-meta/nichos/relatorio-cadastros.sql. Tudo aqui é função
// pura (sem banco, sem fetch) pra caber em teste; quem busca os dados é
// campanhas.functions.ts.

export const SEM_CAMPANHA = "(sem utm_campaign)";
export const SEM_ANUNCIO = "(sem utm_content)";
export const TODAS = "todas";

export type PeriodoCampanha = "7" | "30" | "tudo";

export interface OrigemAnuncio {
  campanha: string;
  anuncio: string;
}

/** Uma conta vinda de campanha. Sem e-mail nem nome: só o que vira contagem. */
export interface CadastroCampanha extends OrigemAnuncio {
  criadoEm: string;
  fezOnboarding: boolean;
  calculouPreco: boolean;
  assinante: boolean;
}

/** Uma linha de insights do Meta, nível anúncio. */
export interface GastoMeta {
  anuncio: string;
  campanhaMeta: string;
  gasto: number;
  impressoes: number;
  cliques: number;
}

export interface Funil {
  cadastros: number;
  fezOnboarding: number;
  calculouPreco: number;
  assinantes: number;
}

export interface LinhaAnuncio extends Funil {
  anuncio: string;
  /** null quando o gasto do Meta não está conectado ou não respondeu. */
  gasto: number | null;
  impressoes: number | null;
  cliques: number | null;
  custoPorCadastro: number | null;
  custoPorAtivada: number | null;
  custoPorAssinante: number | null;
}

export interface Totais extends Funil {
  gasto: number | null;
  cliques: number | null;
  custoPorCadastro: number | null;
  custoPorAtivada: number | null;
  custoPorAssinante: number | null;
}

export interface CampanhaDisponivel {
  campanha: string;
  cadastros: number;
  ultimoCadastro: string;
}

const PLANOS_PAGOS = new Set(["controle", "projete"]); // Premium e Pro

export function ehAssinante(plano: string | null | undefined): boolean {
  return !!plano && PLANOS_PAGOS.has(plano);
}

function texto(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/**
 * Lê user_metadata.origem_campanha. Devolve null pra conta que não veio de
 * campanha nenhuma (sem a chave), igual ao `where ? 'origem_campanha'` do SQL.
 */
export function extrairOrigem(metadata: unknown): OrigemAnuncio | null {
  if (!metadata || typeof metadata !== "object") return null;
  const o = (metadata as Record<string, unknown>).origem_campanha;
  if (!o || typeof o !== "object") return null;
  const origem = o as Record<string, unknown>;
  return {
    campanha: texto(origem.utm_campaign) ?? SEM_CAMPANHA,
    anuncio: texto(origem.utm_content) ?? SEM_ANUNCIO,
  };
}

/** Comparação tolerante: caixa, acento, espaço e pontuação não contam. */
export function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const DIA_MS = 86_400_000;
const OFFSET_BRT_MS = 3 * 3_600_000; // America/Sao_Paulo é UTC-3 o ano inteiro

function dataBRT(ms: number): string {
  return new Date(ms - OFFSET_BRT_MS).toISOString().slice(0, 10);
}

export interface Janela {
  /** Início em ms UTC (meia-noite BRT do primeiro dia); null = desde sempre. */
  iniMs: number | null;
  /** Datas BRT pro time_range do Meta; null = date_preset=maximum. */
  since: string | null;
  until: string;
}

/**
 * "7 dias" = hoje e os 6 dias anteriores, contando da meia-noite de Brasília.
 * O mesmo recorte vai pro Meta (time_range com datas), pra cadastro e gasto
 * falarem dos mesmos dias.
 */
export function janelaDoPeriodo(periodo: PeriodoCampanha, agora = Date.now()): Janela {
  const until = dataBRT(agora);
  if (periodo === "tudo") return { iniMs: null, since: null, until };
  const dias = Number(periodo);
  const brt = agora - OFFSET_BRT_MS;
  const meiaNoiteHoje = Math.floor(brt / DIA_MS) * DIA_MS + OFFSET_BRT_MS;
  const iniMs = meiaNoiteHoje - (dias - 1) * DIA_MS;
  return { iniMs, since: dataBRT(iniMs), until };
}

/** Campanhas que já trouxeram cadastro, da mais recente pra mais antiga. */
export function listarCampanhas(
  cadastros: Pick<CadastroCampanha, "campanha" | "criadoEm">[],
): CampanhaDisponivel[] {
  const mapa = new Map<string, CampanhaDisponivel>();
  for (const c of cadastros) {
    const atual = mapa.get(c.campanha);
    if (!atual) {
      mapa.set(c.campanha, { campanha: c.campanha, cadastros: 1, ultimoCadastro: c.criadoEm });
    } else {
      atual.cadastros += 1;
      if (c.criadoEm > atual.ultimoCadastro) atual.ultimoCadastro = c.criadoEm;
    }
  }
  return [...mapa.values()].sort((a, b) => {
    if (a.campanha === SEM_CAMPANHA) return 1;
    if (b.campanha === SEM_CAMPANHA) return -1;
    return b.ultimoCadastro.localeCompare(a.ultimoCadastro);
  });
}

/** Sem escolha explícita, abre na campanha com cadastro mais recente. */
export function campanhaPadrao(lista: CampanhaDisponivel[]): string {
  return lista.find((c) => c.campanha !== SEM_CAMPANHA)?.campanha ?? TODAS;
}

export function filtrarCadastros<T extends Pick<CadastroCampanha, "campanha" | "criadoEm">>(
  cadastros: T[],
  campanha: string,
  iniMs: number | null,
): T[] {
  return cadastros.filter(
    (c) =>
      (campanha === TODAS || c.campanha === campanha) &&
      (iniMs === null || Date.parse(c.criadoEm) >= iniMs),
  );
}

function dividir(gasto: number | null, n: number): number | null {
  if (gasto === null || n <= 0) return null;
  return gasto / n;
}

/**
 * Taxa de uma etapa sobre outra, em %. null quando a base é zero (não existe
 * taxa de nada).
 */
export function taxa(parte: number, base: number): number | null {
  if (base <= 0) return null;
  return (parte / base) * 100;
}

/**
 * O gasto do Meta pertence à campanha escolhida quando o nome da campanha no
 * Meta bate com a utm_campaign (tolerante a caixa e pontuação) ou quando o
 * nome do anúncio já apareceu como utm_content dessa campanha em qualquer
 * época. A segunda regra cobre o caso de a campanha no Meta ter outro nome
 * que a UTM.
 */
export function gastoDaCampanha(
  gastos: GastoMeta[],
  campanha: string,
  anunciosConhecidos: Set<string>,
): GastoMeta[] {
  if (campanha === TODAS) return gastos;
  const alvo = normalizar(campanha);
  const conhecidos = new Set([...anunciosConhecidos].map(normalizar));
  return gastos.filter(
    (g) => normalizar(g.campanhaMeta) === alvo || conhecidos.has(normalizar(g.anuncio)),
  );
}

/**
 * Funil por anúncio, com o gasto do Meta cruzado por nome (ad_name =
 * utm_content). `gastos` null = Meta não conectado: as colunas de dinheiro
 * vêm null. Anúncio com gasto e nenhum cadastro também entra (é justamente o
 * que mais precisa aparecer). Ordem: mais cadastros primeiro.
 */
export function montarLinhas(
  cadastros: CadastroCampanha[],
  gastos: GastoMeta[] | null,
): LinhaAnuncio[] {
  type Acc = Funil & {
    anuncio: string;
    gasto: number;
    impressoes: number;
    cliques: number;
    temGasto: boolean;
  };
  const mapa = new Map<string, Acc>();
  const linha = (anuncio: string) => {
    const chave = anuncio === SEM_ANUNCIO ? SEM_ANUNCIO : normalizar(anuncio) || anuncio;
    let l = mapa.get(chave);
    if (!l) {
      l = {
        anuncio,
        cadastros: 0,
        fezOnboarding: 0,
        calculouPreco: 0,
        assinantes: 0,
        gasto: 0,
        impressoes: 0,
        cliques: 0,
        temGasto: false,
      };
      mapa.set(chave, l);
    }
    return l;
  };

  for (const c of cadastros) {
    const l = linha(c.anuncio);
    l.cadastros += 1;
    if (c.fezOnboarding) l.fezOnboarding += 1;
    if (c.calculouPreco) l.calculouPreco += 1;
    if (c.assinante) l.assinantes += 1;
  }

  for (const g of gastos ?? []) {
    const l = linha(g.anuncio);
    l.gasto += g.gasto;
    l.impressoes += g.impressoes;
    l.cliques += g.cliques;
    l.temGasto = true;
  }

  const conectado = gastos !== null;
  const linhas: LinhaAnuncio[] = [...mapa.values()].map((l) => {
    // Conectado e sem linha no Meta = esse anúncio não gastou no período.
    const gasto = conectado ? l.gasto : null;
    return {
      anuncio: l.anuncio,
      cadastros: l.cadastros,
      fezOnboarding: l.fezOnboarding,
      calculouPreco: l.calculouPreco,
      assinantes: l.assinantes,
      gasto,
      impressoes: conectado ? l.impressoes : null,
      cliques: conectado ? l.cliques : null,
      custoPorCadastro: dividir(gasto, l.cadastros),
      custoPorAtivada: dividir(gasto, l.calculouPreco),
      custoPorAssinante: dividir(gasto, l.assinantes),
    };
  });

  return linhas.sort((a, b) => {
    if (b.cadastros !== a.cadastros) return b.cadastros - a.cadastros;
    if (a.anuncio === SEM_ANUNCIO) return 1;
    if (b.anuncio === SEM_ANUNCIO) return -1;
    return (b.gasto ?? 0) - (a.gasto ?? 0) || a.anuncio.localeCompare(b.anuncio);
  });
}

export function somarTotais(linhas: LinhaAnuncio[], conectado: boolean): Totais {
  const soma = (campo: keyof Funil) => linhas.reduce((s, l) => s + l[campo], 0);
  const funil: Funil = {
    cadastros: soma("cadastros"),
    fezOnboarding: soma("fezOnboarding"),
    calculouPreco: soma("calculouPreco"),
    assinantes: soma("assinantes"),
  };
  const gasto = conectado ? linhas.reduce((s, l) => s + (l.gasto ?? 0), 0) : null;
  const cliques = conectado ? linhas.reduce((s, l) => s + (l.cliques ?? 0), 0) : null;
  return {
    ...funil,
    gasto,
    cliques,
    custoPorCadastro: dividir(gasto, funil.cadastros),
    custoPorAtivada: dividir(gasto, funil.calculouPreco),
    custoPorAssinante: dividir(gasto, funil.assinantes),
  };
}
