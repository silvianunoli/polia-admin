import { z } from "zod";

// Regras puras da loja de serviços (servicos.usepolia.com.br/loja). Nada aqui
// toca banco nem React: roda igual no client, no servidor e no Vitest.
// Schema real: polia-app/supabase/migrations/20261001150000_loja_servicos.sql.
//
// Preço SEMPRE em centavos (integer) no banco. A conversão de/para texto em
// reais é feita só com inteiros, sem float, pra "29,90" nunca virar 2989.

// ---------------------------------------------------------------------------
// Dinheiro
// ---------------------------------------------------------------------------

/** Teto de sanidade: R$ 100.000,00. Serviço acima disso é erro de digitação. */
export const PRECO_MAXIMO_CENTAVOS = 10_000_000;

export type ResultadoPreco = { ok: true; centavos: number | null } | { ok: false; erro: string };

/**
 * Converte o que a Sil digita ("29,90", "1.500", "R$ 1.234,56", "29.9") em
 * centavos. Campo vazio = null (no produto, null é "sob orçamento").
 *
 * Separador decimal: quando aparecem vírgula e ponto, o último é o decimal.
 * Só ponto: "1.500" (grupos de 3) é milhar; "29.9" é decimal.
 */
export function reaisParaCentavos(texto: string): ResultadoPreco {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!limpo) return { ok: true, centavos: null };
  if (!/^[\d.,]+$/.test(limpo)) {
    return { ok: false, erro: "Use só números, com vírgula nos centavos. Ex.: 290,00" };
  }

  const ultimaVirgula = limpo.lastIndexOf(",");
  const ultimoPonto = limpo.lastIndexOf(".");
  let inteiro: string;
  let decimal = "";

  if (ultimaVirgula >= 0 || ultimoPonto >= 0) {
    let sep: number;
    if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
      sep = Math.max(ultimaVirgula, ultimoPonto);
    } else if (ultimaVirgula >= 0) {
      sep = ultimaVirgula;
    } else {
      // Só ponto: grupos de 3 depois de cada ponto = separador de milhar.
      sep = /^\d{1,3}(\.\d{3})+$/.test(limpo) ? -1 : ultimoPonto;
    }
    if (sep === -1) {
      inteiro = limpo.replace(/\./g, "");
    } else {
      const parteInteira = limpo.slice(0, sep);
      // Antes do decimal só cabe número puro ou milhar bem formado com o
      // OUTRO separador ("1.234,56" ou "1,234.56"). "1,2,3" é recusado.
      const outro = limpo[sep] === "," ? "\\." : ",";
      const milharOk = new RegExp(`^\\d{1,3}(${outro}\\d{3})+$`);
      if (parteInteira && !/^\d+$/.test(parteInteira) && !milharOk.test(parteInteira)) {
        return { ok: false, erro: "Valor confuso. Ex.: 1.290,00" };
      }
      inteiro = parteInteira.replace(/[.,]/g, "");
      decimal = limpo.slice(sep + 1);
      if (/[.,]/.test(decimal)) return { ok: false, erro: "Valor confuso. Ex.: 1.290,00" };
    }
  } else {
    inteiro = limpo;
  }

  if (decimal.length > 2) return { ok: false, erro: "Centavos só vão até duas casas." };
  if (!inteiro) inteiro = "0";
  if (!/^\d+$/.test(inteiro) || (decimal && !/^\d+$/.test(decimal))) {
    return { ok: false, erro: "Use só números, com vírgula nos centavos. Ex.: 290,00" };
  }
  if (inteiro.length > 9) return { ok: false, erro: "Valor alto demais." };

  const centavos = Number(inteiro) * 100 + Number(decimal.padEnd(2, "0") || "0");
  if (centavos > PRECO_MAXIMO_CENTAVOS) {
    return { ok: false, erro: "Valor acima de R$ 100.000,00. Vale olhar se não sobrou zero." };
  }
  return { ok: true, centavos };
}

/** "R$ 1.234,56". null vira "Sob orçamento". */
export function formatarCentavos(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "Sob orçamento";
  const negativo = centavos < 0;
  const abs = Math.abs(Math.trunc(centavos));
  const reais = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const cents = String(abs % 100).padStart(2, "0");
  return `${negativo ? "-" : ""}R$ ${reais},${cents}`;
}

/** Valor pro campo de edição: 129000 -> "1290,00". null -> "". */
export function centavosParaCampo(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return "";
  const abs = Math.abs(Math.trunc(centavos));
  return `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SLUG_MAX = 80;

/** "Identidade Visual: Pacote Básico" -> "identidade-visual-pacote-basico". */
export function slugify(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, SLUG_MAX)
    .replace(/^-+|-+$/g, "");
}

/** Primeiro slug livre: base, base-2, base-3... */
export function slugLivre(base: string, ocupados: Iterable<string>): string {
  const usados = new Set(ocupados);
  const raiz = slugify(base) || "produto";
  if (!usados.has(raiz)) return raiz;
  for (let n = 2; n < 1000; n++) {
    const sufixo = `-${n}`;
    const candidato = `${raiz.slice(0, SLUG_MAX - sufixo.length).replace(/-+$/g, "")}${sufixo}`;
    if (!usados.has(candidato)) return candidato;
  }
  return `${raiz.slice(0, SLUG_MAX - 9)}-${Date.now().toString(36)}`;
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

export const BUCKET_IMAGENS = "loja-imagens";
export const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export const TAMANHO_MAX_IMAGEM = 5 * 1024 * 1024;
export const MAX_IMAGENS = 12;

const EXT_POR_TIPO: Record<(typeof TIPOS_IMAGEM)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/** Mensagem de erro, ou null se o arquivo pode subir. */
export function validarArquivoImagem(arquivo: { type: string; size: number }): string | null {
  if (!(TIPOS_IMAGEM as readonly string[]).includes(arquivo.type)) {
    return "Use JPG, PNG, WebP ou AVIF.";
  }
  if (arquivo.size > TAMANHO_MAX_IMAGEM) return "Imagem acima de 5 MB. Reduz e envia de novo.";
  if (arquivo.size === 0) return "Esse arquivo está vazio.";
  return null;
}

/**
 * Nome no Storage: "<uuid>-<nome-limpo>.<ext>". O nome original passa pelo
 * slugify (sem "/", "..", acento ou espaço) e a extensão vem do tipo MIME já
 * validado, nunca do nome que o navegador mandou.
 */
export function nomeArquivoSeguro(nomeOriginal: string, tipo: string, uuid: string): string {
  const ext = EXT_POR_TIPO[tipo as (typeof TIPOS_IMAGEM)[number]] ?? "jpg";
  const semExt = nomeOriginal.replace(/\.[^./\\]*$/, "");
  const base = slugify(semExt.split(/[/\\]/).pop() ?? "").slice(0, 40) || "imagem";
  const id = uuid.replace(/[^a-f0-9-]/gi, "").toLowerCase();
  return `${id}-${base}.${ext}`;
}

/** Só aceita URL pública do bucket da loja (nada de link externo na vitrine). */
export function ehUrlDaLoja(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      u.protocol === "https:" && u.pathname.includes(`/storage/v1/object/public/${BUCKET_IMAGENS}/`)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Cupom
// ---------------------------------------------------------------------------

export type TipoCupom = "percentual" | "valor_fixo";

export interface CupomRegra {
  codigo: string;
  tipo: TipoCupom;
  valor: number;
  ativo: boolean;
  valido_ate: string | null;
  usos_maximos: number | null;
  usos: number;
}

export type ResultadoCupom =
  | { valido: true; descontoCentavos: number }
  | { valido: false; motivo: "inativo" | "vencido" | "esgotado" | "sem_valor" };

export const MOTIVO_CUPOM: Record<Exclude<ResultadoCupom, { valido: true }>["motivo"], string> = {
  inativo: "Cupom desligado",
  vencido: "Validade passou",
  esgotado: "Limite de usos atingido",
  sem_valor: "Não dá desconto nesse valor",
};

/**
 * Mesma regra que o checkout precisa aplicar no servidor: ativo, dentro da
 * validade, com uso sobrando. O desconto nunca passa do subtotal.
 */
export function validarCupom(
  cupom: CupomRegra,
  subtotalCentavos: number,
  agora: Date = new Date(),
): ResultadoCupom {
  if (!cupom.ativo) return { valido: false, motivo: "inativo" };
  if (cupom.valido_ate && new Date(cupom.valido_ate).getTime() < agora.getTime()) {
    return { valido: false, motivo: "vencido" };
  }
  if (cupom.usos_maximos !== null && cupom.usos >= cupom.usos_maximos) {
    return { valido: false, motivo: "esgotado" };
  }
  const desconto =
    cupom.tipo === "percentual"
      ? Math.floor((subtotalCentavos * Math.min(cupom.valor, 100)) / 100)
      : Math.min(cupom.valor, subtotalCentavos);
  if (desconto <= 0) return { valido: false, motivo: "sem_valor" };
  return { valido: true, descontoCentavos: desconto };
}

/** Situação do cupom pra lista, sem depender de subtotal. */
export function situacaoCupom(
  cupom: CupomRegra,
  agora: Date = new Date(),
): "ativo" | "inativo" | "vencido" | "esgotado" {
  const r = validarCupom(cupom, 1_000_000, agora);
  if (r.valido) return "ativo";
  return r.motivo === "sem_valor" ? "ativo" : r.motivo;
}

export function normalizarCodigoCupom(codigo: string): string {
  return codigo.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, "").trim();
}

// ---------------------------------------------------------------------------
// Status do pedido
// ---------------------------------------------------------------------------

export const STATUS_PEDIDO = [
  "aguardando_pagamento",
  "pago",
  "em_andamento",
  "entregue",
  "cancelado",
  "reembolsado",
] as const;
export type StatusPedido = (typeof STATUS_PEDIDO)[number];

export const STATUS_PEDIDO_META: Record<StatusPedido, { label: string; className: string }> = {
  aguardando_pagamento: {
    label: "Aguardando pagamento",
    className: "bg-[var(--line)] text-[var(--ink-soft)]",
  },
  // Pêssego, não amarelo: a lista pode ter vários pagos e amarelo é um por tela.
  pago: { label: "Pago, a começar", className: "bg-[var(--accent)] text-[var(--accent-ink)]" },
  em_andamento: {
    label: "Em andamento",
    className: "bg-[var(--secondary-light)] text-[var(--secondary-ink)]",
  },
  entregue: { label: "Entregue", className: "bg-[var(--secondary)] text-[var(--secondary-ink)]" },
  cancelado: { label: "Cancelado", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
  reembolsado: { label: "Reembolsado", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

/**
 * Pra onde cada status pode ir na mão. Pedido não pago só confirma ou cancela;
 * pago nunca "cancela" (dinheiro já entrou, então é reembolso); cancelado e
 * reembolsado são finais. Entregue pode voltar pra em andamento (ajuste pedido
 * depois da entrega).
 */
export const TRANSICOES_STATUS: Record<StatusPedido, readonly StatusPedido[]> = {
  aguardando_pagamento: ["pago", "cancelado"],
  pago: ["em_andamento", "entregue", "reembolsado"],
  em_andamento: ["entregue", "reembolsado"],
  entregue: ["em_andamento", "reembolsado"],
  cancelado: [],
  reembolsado: [],
};

export function podeMudarStatus(de: StatusPedido, para: StatusPedido): boolean {
  return TRANSICOES_STATUS[de].includes(para);
}

/** Status que contam como venda feita (dinheiro entrou e não voltou). */
export const STATUS_VENDA: readonly StatusPedido[] = ["pago", "em_andamento", "entregue"];
/** Status que pedem trabalho da Sil. */
export const STATUS_A_ENTREGAR: readonly StatusPedido[] = ["pago", "em_andamento"];

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

/** wa.me exige só dígitos com DDI. Número brasileiro sem 55 ganha o 55. */
export function linkWhatsAppPedido(whatsapp: string | null, mensagem?: string): string | null {
  if (!whatsapp) return null;
  let d = whatsapp.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  if (d.length < 12 || d.length > 15) return null;
  const texto = mensagem?.trim() ? `?text=${encodeURIComponent(mensagem.trim())}` : "";
  return `https://wa.me/${d}${texto}`;
}

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

/**
 * O formato do briefing é decidido pelo polia-servicos (coluna jsonb livre).
 * Esta leitura aceita os dois desenhos prováveis sem quebrar com nenhum:
 * objeto { pergunta: resposta } ou lista [{ pergunta, resposta }].
 * Qualquer outra coisa vira texto cru, nunca some.
 */
export function briefingEmLinhas(briefing: unknown): { rotulo: string; valor: string }[] {
  if (briefing === null || briefing === undefined) return [];
  const texto = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(", ");
    return JSON.stringify(v);
  };
  if (Array.isArray(briefing)) {
    return briefing.map((item, i) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        const rotulo = texto(o.pergunta ?? o.label ?? o.rotulo ?? o.campo) || `Resposta ${i + 1}`;
        return { rotulo, valor: texto(o.resposta ?? o.valor ?? o.value) };
      }
      return { rotulo: `Resposta ${i + 1}`, valor: texto(item) };
    });
  }
  if (typeof briefing === "object") {
    return Object.entries(briefing as Record<string, unknown>).map(([k, v]) => ({
      rotulo: k.replace(/_/g, " "),
      valor: texto(v),
    }));
  }
  return [{ rotulo: "Briefing", valor: texto(briefing) }];
}

// ---------------------------------------------------------------------------
// Schemas (zod) das mutações. Usados nas server functions e no formulário.
// ---------------------------------------------------------------------------

const centavosOpcional = z.number().int().min(0).max(PRECO_MAXIMO_CENTAVOS).nullable();

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

export const imagemSchema = z.object({
  url: z.string().url().max(500).refine(ehUrlDaLoja, "Imagem fora do bucket da loja."),
  alt: z.string().trim().max(200),
});
export type ImagemProduto = z.infer<typeof imagemSchema>;

export const produtoSchema = z
  .object({
    nome: z.string().trim().min(1, "Dá um nome pro serviço.").max(120),
    slug: z
      .string()
      .trim()
      .min(1, "Endereço vazio.")
      .max(SLUG_MAX)
      .regex(SLUG_REGEX, "Só letras minúsculas, números e hífen."),
    categoria_id: z.string().uuid().nullable(),
    resumo: z.string().trim().max(300),
    descricao: z.string().trim().max(8000),
    preco_centavos: centavosOpcional,
    preco_original_centavos: centavosOpcional,
    prazo_entrega: textoOpcional(80),
    itens: z.array(z.string().trim().min(1).max(200)).max(30),
    imagens: z.array(imagemSchema).max(MAX_IMAGENS),
    capa_url: z.string().url().max(500).nullable(),
    destaque: z.boolean(),
    publicado: z.boolean(),
    exige_briefing: z.boolean(),
    preco_sugerido: z.boolean(),
  })
  .superRefine((p, ctx) => {
    if (p.preco_original_centavos !== null) {
      if (p.preco_centavos === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["preco_original_centavos"],
          message: "Preço riscado só faz sentido com preço definido.",
        });
      } else if (p.preco_original_centavos <= p.preco_centavos) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["preco_original_centavos"],
          message: "O preço riscado precisa ser maior que o preço.",
        });
      }
    }
    if (p.capa_url && !p.imagens.some((i) => i.url === p.capa_url)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["capa_url"],
        message: "A capa precisa ser uma das imagens da galeria.",
      });
    }
  });
export type ProdutoInput = z.infer<typeof produtoSchema>;

export const categoriaSchema = z.object({
  nome: z.string().trim().min(1, "Dá um nome pra categoria.").max(80),
  slug: z.string().trim().min(1).max(SLUG_MAX).regex(SLUG_REGEX, "Endereço inválido."),
  descricao: textoOpcional(300),
  ativo: z.boolean(),
});
export type CategoriaInput = z.infer<typeof categoriaSchema>;

export const cupomSchema = z
  .object({
    codigo: z
      .string()
      .transform(normalizarCodigoCupom)
      .pipe(
        z
          .string()
          .min(3, "Código com pelo menos 3 letras.")
          .max(40)
          .regex(/^[A-Z0-9_-]+$/, "Código só com letras, números, hífen e _."),
      ),
    tipo: z.enum(["percentual", "valor_fixo"]),
    valor: z.number().int().positive("O desconto precisa ser maior que zero."),
    ativo: z.boolean(),
    valido_ate: z.string().datetime({ offset: true }).nullable(),
    usos_maximos: z.number().int().positive().max(100_000).nullable(),
  })
  .superRefine((c, ctx) => {
    if (c.tipo === "percentual" && c.valor > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["valor"],
        message: "Percentual vai de 1 a 100.",
      });
    }
    if (c.tipo === "valor_fixo" && c.valor > PRECO_MAXIMO_CENTAVOS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["valor"], message: "Valor alto demais." });
    }
  });
export type CupomInput = z.input<typeof cupomSchema>;

export const configSchema = z.object({
  loja_aberta: z.boolean(),
  aviso: textoOpcional(300),
});

/** Primeira mensagem de erro do zod, pra mostrar em toast. */
export function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos.";
}
