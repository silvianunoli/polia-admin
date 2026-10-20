import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { testesAbertosPorUsuaria, type TesteProLinha } from "@/lib/teste-pro";

// Leitura de public.testes_pro (teste de 7 dias do Pro, GRW-66). A tabela é
// nova (20/10/2026) e pode ainda não existir no banco em que este código roda:
// qualquer erro de leitura vira "nenhum teste", nunca derruba a página. O
// efeito disso é a conta em teste aparecer como Pro e contar como assinante
// por profiles.plano, que é o comportamento de antes da tabela existir.

const POR_PAGINA = 1000;
const LOTE_IDS = 100; // .in() com mais que isso estoura o tamanho da URL do PostgREST
const COLUNAS = "user_id, inicio, fim, origem, encerrado_em, resultado";

/**
 * Todos os testes (abertos e encerrados). ok=false quando a leitura falhou
 * (tabela ainda não criada, por exemplo): aí testes vem vazio.
 */
export async function lerTestesProComStatus(): Promise<{ ok: boolean; testes: TesteProLinha[] }> {
  const testes: TesteProLinha[] = [];
  try {
    for (let de = 0; de < 100 * POR_PAGINA; de += POR_PAGINA) {
      const { data, error } = await supabaseAdmin
        .from("testes_pro")
        .select(COLUNAS)
        .order("user_id", { ascending: true })
        .range(de, de + POR_PAGINA - 1);
      if (error) {
        console.error("[testes_pro] leitura falhou, tratando como nenhum teste:", error.message);
        return { ok: false, testes: [] };
      }
      const linhas = (data ?? []) as TesteProLinha[];
      testes.push(...linhas);
      if (linhas.length < POR_PAGINA) break;
    }
  } catch (err) {
    console.error("[testes_pro] leitura falhou, tratando como nenhum teste:", err);
    return { ok: false, testes: [] };
  }
  return { ok: true, testes };
}

/** Todos os testes (abertos e encerrados). [] se a leitura falhar. */
export async function lerTestesPro(): Promise<TesteProLinha[]> {
  return (await lerTestesProComStatus()).testes;
}

/**
 * user_id -> fim do teste, só de quem está com teste aberto agora. Com `ids`,
 * lê só essas contas (em lotes). Mapa vazio se a leitura falhar.
 */
export async function testesAbertos(ids?: string[]): Promise<Map<string, string>> {
  if (!ids) return testesAbertosPorUsuaria(await lerTestesPro());
  const testes: TesteProLinha[] = [];
  try {
    for (let i = 0; i < ids.length; i += LOTE_IDS) {
      const lote = ids.slice(i, i + LOTE_IDS);
      const { data, error } = await supabaseAdmin
        .from("testes_pro")
        .select(COLUNAS)
        .in("user_id", lote)
        .is("encerrado_em", null);
      if (error) {
        console.error("[testes_pro] leitura falhou, tratando como nenhum teste:", error.message);
        return new Map();
      }
      testes.push(...((data ?? []) as TesteProLinha[]));
    }
  } catch (err) {
    console.error("[testes_pro] leitura falhou, tratando como nenhum teste:", err);
    return new Map();
  }
  return testesAbertosPorUsuaria(testes);
}
