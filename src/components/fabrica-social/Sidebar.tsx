import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  Lightbulb,
  Store,
  Link2,
  PackageOpen,
  FolderOpen,
  BarChart3,
  Users,
  Handshake,
  CreditCard,
  LifeBuoy,
  ChevronsLeft,
  Plus,
  Search,
  Home,
  Moon,
  Sun,
  ChevronDown,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { useState, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/fabrica-social/cn";
import { useFabricaSocialWorkspace } from "@/context/fabrica-social/WorkspaceContext";
import { useFabricaSocialAuth } from "@/context/fabrica-social/AuthContext";
import { fabricaSocialNaoConfigurado as isMockMode } from "@/lib/fabrica-social/supabase";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

/*
  Réplica da src/components/layout/Sidebar.tsx do repo original — mesmos
  grupos, mesma ordem, mesmo rodapé. A única diferença de propósito: cada
  item que ainda não foi portado pra dentro da Central aponta pro app
  separado (com o ícone de link externo), em vez de uma rota interna que não
  existiria. Ver §Fábrica Social no CLAUDE.md pra ordem de migração.
*/
const APP_SEPARADO =
  import.meta.env.VITE_FABRICA_SOCIAL_APP_URL || "https://app.silvianunoli.com.br";

type ItemNav =
  | { to: string; icon: ComponentType<{ className?: string }>; label: string; badge?: string }
  | { href: string; icon: ComponentType<{ className?: string }>; label: string; badge?: string };

function NavItem(item: ItemNav) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const Icone = item.icon;
  const classe = (ativo: boolean) =>
    cn(
      "group flex items-center gap-2 rounded-md px-2 py-[5px] text-sm text-sidebar-foreground transition-colors",
      "hover:bg-sidebar-hover",
      ativo && "bg-sidebar-active font-medium text-foreground",
    );

  if ("href" in item) {
    return (
      <a href={item.href} target="_blank" rel="noopener noreferrer" className={classe(false)}>
        <span className="flex h-5 w-5 items-center justify-center opacity-80">
          <Icone className="h-4 w-4" />
        </span>
        <span className="flex-1 truncate">{item.label}</span>
        <ExternalLink className="h-3 w-3 opacity-40" aria-label="abre no app separado" />
      </a>
    );
  }

  const ativo = pathname === item.to || pathname.startsWith(item.to + "/");
  return (
    <Link to={item.to} className={classe(ativo)}>
      <span className="flex h-5 w-5 items-center justify-center opacity-80">
        <Icone className="h-4 w-4" />
      </span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded bg-primary/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="mb-1 flex w-full items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-sidebar-hover"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
        {label}
      </button>
      {open && <div className="space-y-px">{children}</div>}
    </div>
  );
}

export function FabricaSocialSidebar() {
  const { brands, activeBrand, setActiveBrandId, user, theme, toggleTheme, setSidebarOpen } =
    useFabricaSocialWorkspace();
  const { signOut } = useFabricaSocialAuth();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r bg-sidebar">
      {/* Switcher de marca (workspace switcher, estilo Notion) */}
      <div className="flex items-center gap-1 p-2">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-foreground hover:bg-sidebar-hover">
              <span className="text-base leading-none">{activeBrand.emoji}</span>
              <span className="truncate">{activeBrand.name}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              className="z-50 w-64 rounded-lg border bg-card p-1 shadow-lg"
            >
              <div className="px-2 py-1.5 text-xs text-muted-foreground">Marcas · {user.email}</div>
              {brands.map((b) => (
                <DropdownMenu.Item
                  key={b.id}
                  onSelect={() => setActiveBrandId(b.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none",
                    "data-[highlighted]:bg-accent",
                    b.id === activeBrand.id && "font-medium",
                  )}
                >
                  <span>{b.emoji}</span>
                  <span className="flex-1 truncate">{b.name}</span>
                  {b.id === activeBrand.id && <span className="text-primary">✓</span>}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item asChild>
                <a
                  href={`${APP_SEPARADO}/brands`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground outline-none data-[highlighted]:bg-accent"
                >
                  <Plus className="h-4 w-4" /> Gerenciar marcas
                  <ExternalLink className="ml-auto h-3 w-3 opacity-40" />
                </a>
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button
          onClick={() => setSidebarOpen(false)}
          title="Recolher menu"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-hover"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>
      </div>

      {/* Busca + ação principal */}
      <div className="space-y-px px-2">
        <button
          onClick={() => window.dispatchEvent(new Event("fabrica-social:open-cmdk"))}
          className="flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-sm text-sidebar-foreground hover:bg-sidebar-hover"
        >
          <Search className="h-4 w-4 opacity-80" />
          Buscar
          <kbd className="ml-auto rounded border bg-background px-1 text-[10px] text-muted-foreground">
            Ctrl K
          </kbd>
        </button>
        <NavItem href={APP_SEPARADO} icon={Home} label="Início" />
      </div>

      {/* Navegação em grupos (árvore Notion) */}
      <nav className="notion-scroll flex-1 overflow-y-auto px-2 pb-2">
        <Group label="Planejamento">
          <NavItem to="/fabrica-social/calendario" icon={CalendarDays} label="Calendário" />
          <NavItem
            href={`${APP_SEPARADO}/inspiracao`}
            icon={Lightbulb}
            label="Inspiração"
            badge="beta"
          />
        </Group>
        <Group label="Conteúdo">
          <NavItem to="/fabrica-social/criar-postagem" icon={PackageOpen} label="Criar postagem" />
          <NavItem to="/fabrica-social/biblioteca" icon={FolderOpen} label="Biblioteca" />
        </Group>
        <Group label="Marcas & Medição">
          <NavItem href={`${APP_SEPARADO}/brands`} icon={Store} label="Marcas" />
          <NavItem to="/fabrica-social/conexoes" icon={Link2} label="Conexões" />
          <NavItem
            href={`${APP_SEPARADO}/analytics`}
            icon={BarChart3}
            label="Analytics"
            badge="beta"
          />
        </Group>
        <Group label="Agência">
          <NavItem
            href={`${APP_SEPARADO}/portal-cliente`}
            icon={Handshake}
            label="Portal do Cliente"
          />
          <NavItem href={`${APP_SEPARADO}/equipe`} icon={Users} label="Equipe" />
        </Group>
      </nav>

      {/* Rodapé: créditos, assinatura, suporte, tema */}
      <div className="border-t p-2">
        <NavItem
          href={`${APP_SEPARADO}/assinatura`}
          icon={CreditCard}
          label={`${user.credits} créditos`}
        />
        <NavItem href={`${APP_SEPARADO}/suporte`} icon={LifeBuoy} label="Suporte" />
        <button
          onClick={toggleTheme}
          className="mt-px flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-sm text-sidebar-foreground hover:bg-sidebar-hover"
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4 opacity-80" />
          ) : (
            <Sun className="h-4 w-4 opacity-80" />
          )}
          {theme === "light" ? "Tema escuro" : "Tema claro"}
        </button>
        {!isMockMode && (
          <button
            onClick={() => signOut()}
            title={user.email}
            className="mt-px flex w-full items-center gap-2 rounded-md px-2 py-[5px] text-sm text-sidebar-foreground hover:bg-sidebar-hover"
          >
            <LogOut className="h-4 w-4 opacity-80" />
            <span className="truncate">Sair ({user.name})</span>
          </button>
        )}
      </div>
    </aside>
  );
}
