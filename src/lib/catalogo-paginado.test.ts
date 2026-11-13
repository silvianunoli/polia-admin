import { describe, expect, it } from "vitest";
import { buscarCatalogoInteiro, TAMANHO_PAGINA_CATALOGO } from "./catalogo-paginado";

// Simula o PostgREST: devolve no máximo uma página por chamada, como o
// Supabase faz com o limite de 1000 linhas.
function bancoFalso(total: number) {
  const linhas = Array.from({ length: total }, (_, i) => ({ id: `T-${i}` }));
  const chamadas: [number, number][] = [];
  const lerPagina = async (de: number, ate: number) => {
    chamadas.push([de, ate]);
    return { data: linhas.slice(de, ate + 1), error: null };
  };
  return { lerPagina, chamadas };
}

describe("buscarCatalogoInteiro", () => {
  it("traz as 1446 linhas, não só as primeiras 1000", async () => {
    const { lerPagina, chamadas } = bancoFalso(1446);
    const linhas = await buscarCatalogoInteiro(lerPagina);
    expect(linhas).toHaveLength(1446);
    expect(linhas.at(-1)).toEqual({ id: "T-1445" });
    expect(chamadas).toEqual([
      [0, TAMANHO_PAGINA_CATALOGO - 1],
      [TAMANHO_PAGINA_CATALOGO, 2 * TAMANHO_PAGINA_CATALOGO - 1],
    ]);
  });

  it("com múltiplo exato de 1000, para na página vazia", async () => {
    const { lerPagina, chamadas } = bancoFalso(2000);
    expect(await buscarCatalogoInteiro(lerPagina)).toHaveLength(2000);
    expect(chamadas).toHaveLength(3);
  });

  it("erro em qualquer página derruba o carregamento em vez de mostrar board pela metade", async () => {
    let n = 0;
    const lerPagina = async () => {
      n += 1;
      if (n === 2) return { data: null, error: { message: "timeout" } };
      return { data: Array.from({ length: TAMANHO_PAGINA_CATALOGO }, () => ({})), error: null };
    };
    await expect(buscarCatalogoInteiro(lerPagina)).rejects.toThrow("timeout");
  });
});
