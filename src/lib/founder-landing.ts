// Cadastros e compras por landing (FND-04, 07/10/2026). Compara /landing-a e
// /landing-b (e os outros pontos do site: home, cabecalho, blog, sobre,
// pesquisa) pelo dinheiro, não só pelo cadastro.
//
// Cadastro: founder_eventos evento="signup", propriedades.origem (o polia-app
// grava a origem da URL no cadastro por e-mail). Compra: eventos_analytics
// evento="checkout_concluido", propriedades.origem e propriedades.plano (o
// webhook do Stripe grava a partir dos metadados do checkout público).
// Compra feita dentro do app (/assinar) não passa pelo checkout público e não
// entra aqui: ela não tem landing.

export const SEM_ORIGEM = "sem origem";

// Valor cobrado por chave de plano, em centavos. Mesmo valor de
// polia-app/src/lib/planos.ts (TIERS_PAGOS): se o preço mudar lá, muda aqui.
const CENTAVOS_POR_PLANO: Record<string, number> = {
  controle_mensal: 2990,
  controle_anual: 29900,
  projete_mensal: 4790,
  projete_anual: 47900,
};

type Propriedades = Record<string, unknown> | null | undefined;

export interface LinhaLanding {
  origem: string;
  cadastros: number;
  compras: number;
  receitaCentavos: number;
}

function origemDe(p: Propriedades): string {
  const o = p?.origem;
  return typeof o === "string" && o.trim() ? o.trim() : SEM_ORIGEM;
}

export function porLanding(cadastros: Propriedades[], compras: Propriedades[]): LinhaLanding[] {
  const linhas = new Map<string, LinhaLanding>();
  const linha = (origem: string) => {
    let l = linhas.get(origem);
    if (!l) {
      l = { origem, cadastros: 0, compras: 0, receitaCentavos: 0 };
      linhas.set(origem, l);
    }
    return l;
  };
  for (const p of cadastros) linha(origemDe(p)).cadastros += 1;
  for (const p of compras) {
    const l = linha(origemDe(p));
    l.compras += 1;
    const plano = typeof p?.plano === "string" ? p.plano : "";
    l.receitaCentavos += CENTAVOS_POR_PLANO[plano] ?? 0;
  }
  // Quem vende mais primeiro; "sem origem" sempre por último.
  return [...linhas.values()].sort((a, b) => {
    if (a.origem === SEM_ORIGEM) return 1;
    if (b.origem === SEM_ORIGEM) return -1;
    return b.receitaCentavos - a.receitaCentavos || b.cadastros - a.cadastros;
  });
}
