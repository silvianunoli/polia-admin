import { LayoutDashboard, Package, Tags, TicketPercent, ShoppingBag, Settings } from "lucide-react";
import type { ComponentType } from "react";

// Itens e títulos da navegação da loja. Fora do componente pra o Fast Refresh
// não reclamar (arquivo de componente só exporta componente).
type Item = { to: string; label: string; icone: ComponentType<{ size?: number }> };

export const LOJA_ITENS: Item[] = [
  { to: "/loja", label: "Resumo", icone: LayoutDashboard },
  { to: "/loja/produtos", label: "Serviços à venda", icone: Package },
  { to: "/loja/categorias", label: "Categorias", icone: Tags },
  { to: "/loja/cupons", label: "Cupons", icone: TicketPercent },
  { to: "/loja/pedidos", label: "Pedidos", icone: ShoppingBag },
  { to: "/loja/config", label: "Abrir ou fechar a loja", icone: Settings },
];

export function tituloDaRotaLoja(pathname: string): string {
  if (pathname === "/loja/produtos/novo") return "Novo serviço";
  if (pathname.startsWith("/loja/produtos/")) return "Editar serviço";
  if (pathname.startsWith("/loja/pedidos/")) return "Pedido";
  return LOJA_ITENS.find((i) => i.to === pathname.replace(/\/$/, ""))?.label ?? "Loja";
}

export function itemLojaAtivo(to: string, pathname: string): boolean {
  if (to === "/loja") return pathname === "/loja" || pathname === "/loja/";
  return pathname === to || pathname.startsWith(to + "/");
}
