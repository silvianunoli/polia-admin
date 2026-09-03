import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import kanbanHtml from "./boards/kanban-operacional.html?raw";
import estrategicoHtml from "./boards/gerenciamento-estrategico.html?raw";

// O conteúdo dos dois boards só existe dentro do bundle do servidor (import
// ?raw num arquivo consumido só por server functions, nunca por componente
// client). Servido por RPC autenticado em vez de asset estático: um HTML de
// public/ seria entregue pelo ASSETS binding sem passar pelo guard de auth
// (client-side, via __root.tsx) -- exatamente a classe de exposição que o
// GRW-05 achou em /central no polia-app.
async function assertAdmin(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.is_admin) throw new Error("Forbidden");
}

function linhaCatalogoParaFrontend(row: Record<string, unknown>) {
  return {
    id: row.id,
    titulo: row.titulo,
    area: row.area,
    pessoa: row.pessoa,
    sprint: row.sprint,
    status: row.status,
    prioridade: row.prioridade,
    nota: row.nota,
    concluidoEm: row.concluido_em,
  };
}

export const buscarHtmlKanban = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // O board é servido como HTML estático puro (iframe srcDoc) -- ele não
    // consegue chamar de volta uma server function autenticada, então o
    // catálogo vivo do Supabase precisa vir pronto, injetado aqui, antes do
    // script principal do board rodar (ver window.__CATALOGO_SUPABASE__ em
    // carregarEstado() no HTML). Sem isso o board sempre mostra o snapshot
    // estático (TAREFAS) baked no arquivo, por mais que o Claude Code
    // atualize o catálogo via SQL na mesma sessão -- foi exatamente o que
    // aconteceu em 03/09/2026 na migração pro domínio do admin (o antigo
    // /api/estado do polia-office nunca existiu aqui, e location.hostname
    // dentro de um iframe srcDoc vem vazio, então nem a detecção de modo
    // "api" do board disparava).
    const { data } = await supabaseAdmin
      .from("office_tarefas_catalogo")
      .select("*");
    const catalogo = Array.isArray(data) ? data.map(linhaCatalogoParaFrontend) : [];
    // Nota de tarefa é texto livre digitado em sessões passadas -- se algum dia
    // tiver a sequência "</script" dentro, isso fecharia a tag cedo demais.
    const json = JSON.stringify(catalogo).replace(/<\/script/gi, "<\\/script");
    const script = `<script>window.__CATALOGO_SUPABASE__=${json};</script>`;
    return kanbanHtml.replace("<body>", `<body>${script}`);
  });

export const buscarHtmlEstrategico = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return estrategicoHtml;
  });

// Escrita do Kanban embutido (tarefas soltas que a Sil cria direto no board, e
// marcações de concluído) -- espelha as rotas /api/tarefas-locais e
// /api/concluidos que existiam no polia-office. Chamadas via postMessage
// pela ponte em kanban.tsx, nunca por fetch direto do iframe (ele não tem
// como anexar o Bearer token).
const novaTarefaLocalInput = z.object({
  titulo: z.string().trim().min(1).max(500),
  area: z.string().max(100).default("produto"),
  pessoa: z.string().max(100).default("silvia"),
  sprint: z.string().max(100).nullable().default(null),
  status: z.string().max(50).default("backlog"),
  prioridade: z.string().max(50).default("media"),
  nota: z.string().max(2000).nullable().default(null),
});

export const criarTarefaLocalKanban = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => novaTarefaLocalInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { data: criada, error } = await supabaseAdmin
      .from("office_tarefas_locais")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return criada;
  });

const moverTarefaLocalInput = z.object({
  id: z.string().uuid(),
  status: z.string().max(50),
});

export const moverTarefaLocalKanban = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => moverTarefaLocalInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("office_tarefas_locais")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const removerTarefaLocalInput = z.object({ id: z.string().uuid() });

export const removerTarefaLocalKanban = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => removerTarefaLocalInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.from("office_tarefas_locais").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// tarefaId aceita tanto um UUID de tarefa local quanto um id de catálogo tipo
// "COPY-02" -- sem formato fixo, por isso só limite de tamanho.
const marcarConcluidoInput = z.object({ tarefaId: z.string().min(1).max(200) });

export const marcarConcluidoKanban = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => marcarConcluidoInput.parse(input))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("office_concluidos_locais")
      .upsert({ tarefa_id: data.tarefaId }, { onConflict: "tarefa_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
