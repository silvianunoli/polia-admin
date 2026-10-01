import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import {
  categoriaSchema,
  configSchema,
  cupomSchema,
  podeMudarStatus,
  produtoSchema,
  slugLivre,
  STATUS_A_ENTREGAR,
  STATUS_PEDIDO,
  STATUS_VENDA,
  type ImagemProduto,
  type StatusPedido,
  type TipoCupom,
} from "@/lib/loja";

// CMS da loja de serviços. Diferente do CRM (service role + assertAdmin), aqui
// tudo passa pelo client AUTENTICADO da própria admin (context.supabase, com o
// JWT dela): as tabelas loja_* têm policy "admin gerencia tudo" com
// is_admin(auth.uid()), então o banco é a trava de verdade e esta camada não
// precisa da service role pra nada. O zod em cada .inputValidator é a segunda
// trava (o formulário já valida antes, pra mensagem sair bonita).
//
// Log de auditoria vai pelo mesmo client: a policy de admin_audit_log deixa a
// admin logada gravar em nome dela mesma (ver src/lib/audit-log.ts).

type Db = SupabaseClient;

const idInput = z.object({ id: z.string().uuid() });

async function assertAdmin(db: Db, userId: string) {
  const { data } = await db.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (!(data as { is_admin?: boolean } | null)?.is_admin) throw new Error("Sem acesso.");
}

async function auditar(
  db: Db,
  adminId: string,
  acao: string,
  alvo?: string,
  detalhes?: Record<string, unknown>,
) {
  try {
    await db.from("admin_audit_log").insert({
      admin_id: adminId,
      acao,
      alvo: alvo ?? null,
      detalhes: (detalhes ?? {}) as Json,
    });
  } catch {
    // Log nunca derruba a ação que ele registra.
  }
}

// ---------------------------------------------------------------------------
// Tipos de linha
// ---------------------------------------------------------------------------

export interface Categoria {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Produto {
  id: string;
  slug: string;
  categoria_id: string | null;
  nome: string;
  resumo: string;
  descricao: string;
  preco_centavos: number | null;
  preco_original_centavos: number | null;
  prazo_entrega: string | null;
  itens: string[];
  imagens: ImagemProduto[];
  capa_url: string | null;
  destaque: boolean;
  publicado: boolean;
  exige_briefing: boolean;
  preco_sugerido: boolean;
  ordem: number;
  created_at: string;
  updated_at: string;
}

export interface Cupom {
  id: string;
  codigo: string;
  tipo: TipoCupom;
  valor: number;
  ativo: boolean;
  valido_ate: string | null;
  usos_maximos: number | null;
  usos: number;
  created_at: string;
}

export interface Pedido {
  id: string;
  numero: number;
  status: StatusPedido;
  nome: string;
  email: string;
  whatsapp: string | null;
  subtotal_centavos: number;
  desconto_centavos: number;
  total_centavos: number;
  cupom_codigo: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  briefing: Json | null;
  observacoes_internas: string | null;
  pago_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  produto_id: string | null;
  nome: string;
  preco_centavos: number;
  quantidade: number;
}

export interface ConfigLoja {
  loja_aberta: boolean;
  aviso: string | null;
  updated_at: string;
}

function normalizarProduto(p: Record<string, unknown>): Produto {
  const itens = Array.isArray(p.itens)
    ? (p.itens as unknown[]).filter((i) => typeof i === "string")
    : [];
  const imagens = Array.isArray(p.imagens)
    ? (p.imagens as unknown[])
        .filter(
          (i): i is { url: string; alt?: unknown } =>
            !!i && typeof i === "object" && typeof (i as { url?: unknown }).url === "string",
        )
        .map((i) => ({ url: i.url, alt: typeof i.alt === "string" ? i.alt : "" }))
    : [];
  return { ...(p as unknown as Produto), itens: itens as string[], imagens };
}

// ---------------------------------------------------------------------------
// Resumo
// ---------------------------------------------------------------------------

export const resumoLoja = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);

    const [configRes, produtosRes, pedidosRes, recentesRes] = await Promise.all([
      db.from("loja_config").select("loja_aberta, aviso, updated_at").eq("id", 1).maybeSingle(),
      db.from("loja_produtos").select("id, publicado"),
      db.from("loja_pedidos").select("status, total_centavos").limit(10000),
      db
        .from("loja_pedidos")
        .select("id, numero, nome, status, total_centavos, created_at")
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    if (configRes.error || produtosRes.error || pedidosRes.error || recentesRes.error) {
      throw new Error("Não deu pra carregar o resumo da loja.");
    }

    const pedidos = (pedidosRes.data ?? []) as { status: StatusPedido; total_centavos: number }[];
    const produtos = (produtosRes.data ?? []) as { publicado: boolean }[];
    const vendas = pedidos.filter((p) => STATUS_VENDA.includes(p.status));

    return {
      config: (configRes.data as ConfigLoja | null) ?? null,
      produtosTotal: produtos.length,
      produtosPublicados: produtos.filter((p) => p.publicado).length,
      pedidosPagos: vendas.length,
      recebidoCentavos: vendas.reduce((s, p) => s + p.total_centavos, 0),
      aEntregar: pedidos.filter((p) => STATUS_A_ENTREGAR.includes(p.status)).length,
      aguardandoPagamento: pedidos.filter((p) => p.status === "aguardando_pagamento").length,
      recentes: (recentesRes.data ?? []) as Pick<
        Pedido,
        "id" | "numero" | "nome" | "status" | "total_centavos" | "created_at"
      >[],
    };
  });

// ---------------------------------------------------------------------------
// Produtos
// ---------------------------------------------------------------------------

export const listarProdutos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const [produtosRes, categoriasRes] = await Promise.all([
      db
        .from("loja_produtos")
        .select("*")
        .order("ordem", { ascending: true })
        .order("created_at", { ascending: true }),
      db.from("loja_categorias").select("*").order("ordem", { ascending: true }),
    ]);
    if (produtosRes.error || categoriasRes.error)
      throw new Error("Não deu pra carregar os serviços.");
    return {
      produtos: (produtosRes.data ?? []).map((p) =>
        normalizarProduto(p as Record<string, unknown>),
      ),
      categorias: (categoriasRes.data ?? []) as Categoria[],
    };
  });

export const obterProduto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const [produtoRes, categoriasRes] = await Promise.all([
      db.from("loja_produtos").select("*").eq("id", data.id).maybeSingle(),
      db.from("loja_categorias").select("*").order("ordem", { ascending: true }),
    ]);
    if (produtoRes.error || categoriasRes.error) throw new Error("Não deu pra abrir esse serviço.");
    return {
      produto: produtoRes.data
        ? normalizarProduto(produtoRes.data as Record<string, unknown>)
        : null,
      categorias: (categoriasRes.data ?? []) as Categoria[],
    };
  });

export const listarCategoriasParaEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data, error } = await db
      .from("loja_categorias")
      .select("*")
      .order("ordem", { ascending: true });
    if (error) throw new Error("Não deu pra carregar as categorias.");
    return { categorias: (data ?? []) as Categoria[] };
  });

export const salvarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), novo: z.boolean(), dados: produtoSchema }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const linha = {
      ...data.dados,
      itens: data.dados.itens as Json,
      imagens: data.dados.imagens as Json,
    };

    if (data.novo) {
      const { data: ultimo } = await db
        .from("loja_produtos")
        .select("ordem")
        .order("ordem", { ascending: false })
        .limit(1)
        .maybeSingle();
      const ordem = ((ultimo as { ordem?: number } | null)?.ordem ?? -1) + 1;
      const { error } = await db.from("loja_produtos").insert({ id: data.id, ...linha, ordem });
      if (error) {
        if (error.code === "23505")
          throw new Error("Já existe um serviço com esse endereço. Troca o endereço.");
        throw new Error("Não deu pra criar o serviço.");
      }
      await auditar(db, context.userId, "loja_criar_produto", data.id, {
        nome: linha.nome,
        publicado: linha.publicado,
      });
      return { id: data.id };
    }

    const { data: atualizado, error } = await db
      .from("loja_produtos")
      .update(linha)
      .eq("id", data.id)
      .select("id")
      .maybeSingle();
    if (error) {
      if (error.code === "23505")
        throw new Error("Já existe um serviço com esse endereço. Troca o endereço.");
      throw new Error("Não deu pra salvar o serviço.");
    }
    if (!atualizado) throw new Error("Esse serviço não existe mais.");
    await auditar(db, context.userId, "loja_editar_produto", data.id, {
      nome: linha.nome,
      publicado: linha.publicado,
      preco_centavos: linha.preco_centavos,
    });
    return { id: data.id };
  });

export const alternarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        campo: z.enum(["publicado", "destaque"]),
        valor: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { error } = await db
      .from("loja_produtos")
      .update({ [data.campo]: data.valor })
      .eq("id", data.id);
    if (error) throw new Error("Não deu pra mudar agora.");
    await auditar(db, context.userId, `loja_produto_${data.campo}`, data.id, { valor: data.valor });
    return { ok: true };
  });

export const reordenarProdutos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const resultados = await Promise.all(
      data.ids.map((id, ordem) => db.from("loja_produtos").update({ ordem }).eq("id", id)),
    );
    if (resultados.some((r) => r.error)) throw new Error("A nova ordem não salvou inteira.");
    await auditar(db, context.userId, "loja_reordenar_produtos");
    return { ok: true };
  });

export const duplicarProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data: original, error } = await db
      .from("loja_produtos")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !original) throw new Error("Não achei o serviço pra duplicar.");

    const o = normalizarProduto(original as Record<string, unknown>);
    const { data: slugs } = await db.from("loja_produtos").select("slug");
    const slug = slugLivre(
      `${o.slug}-copia`,
      ((slugs ?? []) as { slug: string }[]).map((s) => s.slug),
    );
    const { data: ultimo } = await db
      .from("loja_produtos")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const novoId = crypto.randomUUID();
    const { error: erroInsert } = await db.from("loja_produtos").insert({
      id: novoId,
      slug,
      categoria_id: o.categoria_id,
      nome: `${o.nome} (cópia)`.slice(0, 120),
      resumo: o.resumo,
      descricao: o.descricao,
      preco_centavos: o.preco_centavos,
      preco_original_centavos: o.preco_original_centavos,
      prazo_entrega: o.prazo_entrega,
      itens: o.itens as Json,
      // Mesmas URLs: a cópia aponta pros mesmos arquivos do bucket.
      imagens: o.imagens as Json,
      capa_url: o.capa_url,
      // Cópia nasce escondida: nunca aparece duplicada na vitrine sem querer.
      destaque: false,
      publicado: false,
      exige_briefing: o.exige_briefing,
      preco_sugerido: o.preco_sugerido,
      ordem: ((ultimo as { ordem?: number } | null)?.ordem ?? -1) + 1,
    });
    if (erroInsert) throw new Error("Não deu pra duplicar.");
    await auditar(db, context.userId, "loja_duplicar_produto", novoId, { origem: data.id });
    return { id: novoId };
  });

export const excluirProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data: apagado, error } = await db
      .from("loja_produtos")
      .delete()
      .eq("id", data.id)
      .select("id, nome")
      .maybeSingle();
    if (error) throw new Error("Não deu pra excluir.");
    if (!apagado) throw new Error("Esse serviço já não existe.");
    // Pedidos antigos continuam: loja_pedido_itens.produto_id vira NULL e o
    // nome/preço da venda ficam gravados no próprio item.
    await auditar(db, context.userId, "loja_excluir_produto", data.id, {
      nome: (apagado as { nome: string }).nome,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

export const listarCategorias = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const [catRes, prodRes] = await Promise.all([
      db.from("loja_categorias").select("*").order("ordem", { ascending: true }),
      db.from("loja_produtos").select("categoria_id"),
    ]);
    if (catRes.error || prodRes.error) throw new Error("Não deu pra carregar as categorias.");
    const contagem: Record<string, number> = {};
    for (const p of (prodRes.data ?? []) as { categoria_id: string | null }[]) {
      if (p.categoria_id) contagem[p.categoria_id] = (contagem[p.categoria_id] ?? 0) + 1;
    }
    return { categorias: (catRes.data ?? []) as Categoria[], contagem };
  });

export const salvarCategoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().nullable(), dados: categoriaSchema }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    if (data.id) {
      const { error } = await db.from("loja_categorias").update(data.dados).eq("id", data.id);
      if (error) {
        if (error.code === "23505") throw new Error("Já existe uma categoria com esse endereço.");
        throw new Error("Não deu pra salvar a categoria.");
      }
      await auditar(db, context.userId, "loja_editar_categoria", data.id, {
        nome: data.dados.nome,
      });
      return { id: data.id };
    }
    const { data: ultimo } = await db
      .from("loja_categorias")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: criada, error } = await db
      .from("loja_categorias")
      .insert({ ...data.dados, ordem: ((ultimo as { ordem?: number } | null)?.ordem ?? -1) + 1 })
      .select("id")
      .single();
    if (error || !criada) {
      if (error?.code === "23505") throw new Error("Já existe uma categoria com esse endereço.");
      throw new Error("Não deu pra criar a categoria.");
    }
    const id = (criada as { id: string }).id;
    await auditar(db, context.userId, "loja_criar_categoria", id, { nome: data.dados.nome });
    return { id };
  });

export const reordenarCategorias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const resultados = await Promise.all(
      data.ids.map((id, ordem) => db.from("loja_categorias").update({ ordem }).eq("id", id)),
    );
    if (resultados.some((r) => r.error)) throw new Error("A nova ordem não salvou inteira.");
    await auditar(db, context.userId, "loja_reordenar_categorias");
    return { ok: true };
  });

export const excluirCategoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    // Serviços da categoria ficam sem categoria (FK ON DELETE SET NULL).
    const { data: apagada, error } = await db
      .from("loja_categorias")
      .delete()
      .eq("id", data.id)
      .select("nome")
      .maybeSingle();
    if (error) throw new Error("Não deu pra excluir a categoria.");
    await auditar(db, context.userId, "loja_excluir_categoria", data.id, {
      nome: (apagada as { nome?: string } | null)?.nome,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Cupons
// ---------------------------------------------------------------------------

export const listarCupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data, error } = await db
      .from("loja_cupons")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Não deu pra carregar os cupons.");
    return { cupons: (data ?? []) as Cupom[] };
  });

export const salvarCupom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid().nullable(), dados: cupomSchema }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    if (data.id) {
      const { error } = await db.from("loja_cupons").update(data.dados).eq("id", data.id);
      if (error) {
        if (error.code === "23505") throw new Error("Já existe um cupom com esse código.");
        throw new Error("Não deu pra salvar o cupom.");
      }
      await auditar(db, context.userId, "loja_editar_cupom", data.id, {
        codigo: data.dados.codigo,
      });
      return { id: data.id };
    }
    const { data: criado, error } = await db
      .from("loja_cupons")
      .insert(data.dados)
      .select("id")
      .single();
    if (error || !criado) {
      if (error?.code === "23505") throw new Error("Já existe um cupom com esse código.");
      throw new Error("Não deu pra criar o cupom.");
    }
    const id = (criado as { id: string }).id;
    await auditar(db, context.userId, "loja_criar_cupom", id, { codigo: data.dados.codigo });
    return { id };
  });

export const excluirCupom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data: cupom } = await db
      .from("loja_cupons")
      .select("codigo, usos")
      .eq("id", data.id)
      .maybeSingle();
    if (!cupom) throw new Error("Esse cupom já não existe.");
    // Cupom já usado fica, desligado: o pedido guarda só o código em texto e
    // apagar o cupom tiraria o rastro de qual regra deu aquele desconto.
    if ((cupom as { usos: number }).usos > 0) {
      throw new Error("Esse cupom já foi usado. Desliga em vez de excluir.");
    }
    const { error } = await db.from("loja_cupons").delete().eq("id", data.id);
    if (error) throw new Error("Não deu pra excluir o cupom.");
    await auditar(db, context.userId, "loja_excluir_cupom", data.id, {
      codigo: (cupom as { codigo: string }).codigo,
    });
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Pedidos
// ---------------------------------------------------------------------------

export const listarPedidos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data, error } = await db
      .from("loja_pedidos")
      .select(
        "id, numero, status, nome, email, whatsapp, total_centavos, cupom_codigo, pago_em, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error("Não deu pra carregar os pedidos.");
    return {
      pedidos: (data ?? []) as Pick<
        Pedido,
        | "id"
        | "numero"
        | "status"
        | "nome"
        | "email"
        | "whatsapp"
        | "total_centavos"
        | "cupom_codigo"
        | "pago_em"
        | "created_at"
      >[],
    };
  });

export const obterPedido = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const [pedidoRes, itensRes] = await Promise.all([
      db.from("loja_pedidos").select("*").eq("id", data.id).maybeSingle(),
      db.from("loja_pedido_itens").select("*").eq("pedido_id", data.id),
    ]);
    if (pedidoRes.error || itensRes.error) throw new Error("Não deu pra abrir esse pedido.");
    return {
      pedido: (pedidoRes.data as Pedido | null) ?? null,
      itens: (itensRes.data ?? []) as PedidoItem[],
    };
  });

export const mudarStatusPedido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        de: z.enum(STATUS_PEDIDO),
        para: z.enum(STATUS_PEDIDO),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    if (!podeMudarStatus(data.de, data.para)) {
      throw new Error("Essa mudança de status não é permitida.");
    }

    const mudanca: { status: StatusPedido; pago_em?: string } = { status: data.para };
    if (data.para === "pago") {
      const { data: atual } = await db
        .from("loja_pedidos")
        .select("pago_em")
        .eq("id", data.id)
        .maybeSingle();
      if (!(atual as { pago_em?: string | null } | null)?.pago_em) {
        mudanca.pago_em = new Date().toISOString();
      }
    }

    // .eq("status", de): se o webhook do Stripe (ou outra aba) mudou o status
    // no meio do caminho, nada é gravado e a tela recarrega o que é real.
    const { data: atualizado, error } = await db
      .from("loja_pedidos")
      .update(mudanca)
      .eq("id", data.id)
      .eq("status", data.de)
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Não deu pra mudar o status.");
    if (!atualizado) {
      throw new Error("O status desse pedido mudou enquanto a tela estava aberta. Recarregue.");
    }
    await auditar(db, context.userId, "loja_status_pedido", data.id, {
      de: data.de,
      para: data.para,
    });
    return { ok: true };
  });

export const salvarObservacoesPedido = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), texto: z.string().max(5000) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const texto = data.texto.trim() || null;
    const { error } = await db
      .from("loja_pedidos")
      .update({ observacoes_internas: texto })
      .eq("id", data.id);
    if (error) throw new Error("Não deu pra salvar a observação.");
    await auditar(db, context.userId, "loja_observacao_pedido", data.id);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export const obterConfigLoja = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data, error } = await db
      .from("loja_config")
      .select("loja_aberta, aviso, updated_at")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error("Não deu pra carregar a configuração.");
    if (!data) throw new Error("A linha de configuração da loja não existe no banco.");
    return { config: data as ConfigLoja };
  });

export const salvarConfigLoja = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => configSchema.parse(input))
  .handler(async ({ context, data }) => {
    const db = context.supabase;
    await assertAdmin(db, context.userId);
    const { data: antes } = await db
      .from("loja_config")
      .select("loja_aberta")
      .eq("id", 1)
      .maybeSingle();
    const { data: depois, error } = await db
      .from("loja_config")
      .update({ loja_aberta: data.loja_aberta, aviso: data.aviso })
      .eq("id", 1)
      .select("loja_aberta, aviso, updated_at")
      .maybeSingle();
    if (error || !depois) throw new Error("Não deu pra salvar a configuração.");
    const abriuOuFechou =
      (antes as { loja_aberta?: boolean } | null)?.loja_aberta !== data.loja_aberta;
    await auditar(
      db,
      context.userId,
      abriuOuFechou ? (data.loja_aberta ? "loja_abrir" : "loja_fechar") : "loja_editar_aviso",
      "loja_config",
      { loja_aberta: data.loja_aberta },
    );
    return { config: depois as ConfigLoja };
  });
