// Fórmula única do churn (FND-09, 11/10/2026). Antes a Visão geral dividia
// por "ativas agora + canceladas" e a tela Churn pelo snapshot do início do
// período: o card e a tela mostravam números diferentes com o mesmo nome.

export interface ChurnCalculado {
  pct: number | null;
  base: number;
  origem: "snapshot" | "estimada";
}

/**
 * Canceladas no período ÷ assinantes no início do período. O início vem do
 * snapshot diário do monitor (founder_metricas_diarias); sem snapshot, a base
 * é estimada como ativas agora + canceladas no período.
 */
export function calcularChurn(
  canceladas: number,
  assinantesNoInicio: number | null | undefined,
  ativasAgora: number,
): ChurnCalculado {
  const temSnapshot = assinantesNoInicio !== null && assinantesNoInicio !== undefined;
  const base = temSnapshot ? Number(assinantesNoInicio) : ativasAgora + canceladas;
  return {
    pct: base > 0 ? (canceladas / base) * 100 : null,
    base,
    origem: temSnapshot ? "snapshot" : "estimada",
  };
}
