// O PostgREST do Supabase devolve no máximo 1000 linhas por consulta, sem
// avisar. Em 13/11/2026 a tabela passou de 1446 linhas e o board mostrava só
// as primeiras 1000: o histórico do Lab (Loveless, Mundo de Aimer, Pólia One)
// sumiu da tela embora estivesse no banco. Por isso lê em páginas, em ordem
// de id, até vir uma página incompleta.
export const TAMANHO_PAGINA_CATALOGO = 1000;

export async function buscarCatalogoInteiro(
  lerPagina: (de: number, ate: number) => PromiseLike<{
    data: Record<string, unknown>[] | null;
    error: { message: string } | null;
  }>,
) {
  const linhas: Record<string, unknown>[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA_CATALOGO) {
    const { data, error } = await lerPagina(de, de + TAMANHO_PAGINA_CATALOGO - 1);
    // Página com erro derruba o carregamento inteiro: board pela metade
    // parece completo e esconde tarefa, que é pior do que não abrir.
    if (error) throw new Error(error.message);
    const pagina = data ?? [];
    linhas.push(...pagina);
    if (pagina.length < TAMANHO_PAGINA_CATALOGO) return linhas;
  }
}
