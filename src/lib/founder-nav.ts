// Arquitetura da seção 2 do direcionamento (polia_founder_dashboard_direcionamento.pdf).
// Todos os itens aparecem desde o bloco 1; o que ainda não foi construído abre
// uma página "em construção" em vez de sumir da navegação.
export interface ItemFounder {
  to: string;
  label: string;
  exato?: boolean;
}

export const GRUPOS_FOUNDER: { titulo: string; itens: ItemFounder[] }[] = [
  {
    titulo: "Overview",
    itens: [
      { to: "/founder", label: "Founder Pulse", exato: true },
      { to: "/founder/saude", label: "Saúde do sistema" },
      { to: "/founder/alertas", label: "Alertas" },
      { to: "/founder/numeros", label: "Números principais" },
    ],
  },
  {
    titulo: "Analytics",
    itens: [
      { to: "/founder/analytics", label: "Visão geral", exato: true },
      { to: "/founder/analytics/usuarias", label: "Usuárias" },
      { to: "/founder/analytics/sessoes", label: "Sessões" },
      { to: "/founder/analytics/retencao", label: "Retenção" },
      { to: "/founder/analytics/comportamento", label: "Comportamento" },
      { to: "/founder/analytics/funcionalidades", label: "Funcionalidades" },
      { to: "/founder/analytics/jornadas", label: "Jornadas" },
      { to: "/founder/analytics/segmentos", label: "Segmentos" },
    ],
  },
  {
    titulo: "Produto",
    itens: [
      { to: "/founder/produto/ativacao", label: "Ativação" },
      { to: "/founder/produto/funil", label: "Funil" },
      { to: "/founder/produto/experimentos", label: "Experimentos" },
      { to: "/founder/produto/feedback", label: "Feedback" },
    ],
  },
  {
    titulo: "Features",
    itens: [
      { to: "/founder/features/flags", label: "Feature Flags" },
      { to: "/founder/features/releases", label: "Releases" },
      { to: "/founder/features/experimentos", label: "Experimentos" },
    ],
  },
  {
    titulo: "Operação",
    itens: [
      { to: "/founder/operacao/erros", label: "Erros" },
      { to: "/founder/operacao/logs", label: "Logs" },
      { to: "/founder/operacao/jobs", label: "Jobs" },
      { to: "/founder/operacao/integracoes", label: "Integrações" },
    ],
  },
  {
    titulo: "Infra",
    itens: [
      { to: "/founder/infra/api", label: "API" },
      { to: "/founder/infra/banco", label: "Banco de dados" },
      { to: "/founder/infra/storage", label: "Storage" },
      { to: "/founder/infra/ia", label: "IA" },
    ],
  },
  {
    titulo: "Negócio",
    itens: [
      { to: "/founder/negocio/receita", label: "Receita" },
      { to: "/founder/negocio/assinaturas", label: "Assinaturas" },
      { to: "/founder/negocio/conversao", label: "Conversão" },
      { to: "/founder/negocio/churn", label: "Churn" },
    ],
  },
];

export function itemAtivo(item: ItemFounder, pathname: string): boolean {
  if (item.exato) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

export function tituloDaRota(pathname: string): { grupo: string; label: string } | null {
  for (const g of GRUPOS_FOUNDER) {
    for (const i of g.itens) {
      if (itemAtivo(i, pathname)) return { grupo: g.titulo, label: i.label };
    }
  }
  return null;
}
