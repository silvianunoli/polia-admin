import { useEffect, useState, type ComponentType } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import {
  Home,
  PackageOpen,
  FolderOpen,
  CalendarDays,
  Lightbulb,
  Store,
  Link2,
  BarChart3,
  Handshake,
  Users,
  CreditCard,
  LifeBuoy,
  Moon,
  Sun,
  ExternalLink,
} from "lucide-react";
import { useFabricaSocialWorkspace } from "@/context/fabrica-social/WorkspaceContext";

/*
  Busca global Ctrl+K — cmdk, mesmo visual e mesma lista de páginas do
  original (src/components/layout/CommandPalette.tsx). Páginas ainda não
  portadas abrem o app separado numa aba nova em vez de navegar pra uma rota
  interna que não existe; o ícone de link externo avisa isso na lista.
*/
const APP_SEPARADO =
  import.meta.env.VITE_FABRICA_SOCIAL_APP_URL || "https://app.silvianunoli.com.br";

type Pagina =
  | { to: string; label: string; icon: ComponentType<{ className?: string }> }
  | { href: string; label: string; icon: ComponentType<{ className?: string }> };

const PAGINAS: Pagina[] = [
  { href: APP_SEPARADO, label: "Início", icon: Home },
  { to: "/fabrica-social/criar-postagem", label: "Criar postagem (upload)", icon: PackageOpen },
  { to: "/fabrica-social/biblioteca", label: "Biblioteca", icon: FolderOpen },
  { href: `${APP_SEPARADO}/calendario`, label: "Calendário", icon: CalendarDays },
  { href: `${APP_SEPARADO}/inspiracao`, label: "Inspiração", icon: Lightbulb },
  { href: `${APP_SEPARADO}/brands`, label: "Marcas", icon: Store },
  { href: `${APP_SEPARADO}/conexoes`, label: "Conexões (Instagram, TikTok)", icon: Link2 },
  { href: `${APP_SEPARADO}/analytics`, label: "Analytics", icon: BarChart3 },
  { href: `${APP_SEPARADO}/portal-cliente`, label: "Portal do Cliente", icon: Handshake },
  { href: `${APP_SEPARADO}/equipe`, label: "Equipe", icon: Users },
  { href: `${APP_SEPARADO}/assinatura`, label: "Assinatura & Créditos", icon: CreditCard },
  { href: `${APP_SEPARADO}/suporte`, label: "Suporte", icon: LifeBuoy },
];

export function FabricaSocialCommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { brands, activeBrand, setActiveBrandId, theme, toggleTheme } = useFabricaSocialWorkspace();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("fabrica-social:open-cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("fabrica-social:open-cmdk", onOpen);
    };
  }, []);

  function run(fn: () => void) {
    fn();
    setOpen(false);
  }

  function abrir(p: Pagina) {
    if ("to" in p) navigate({ to: p.to });
    else window.open(p.href, "_blank", "noopener,noreferrer");
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Busca global"
      className="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border bg-card shadow-2xl"
      overlayClassName="fixed inset-0 z-40 bg-black/30"
    >
      <Command.Input
        placeholder="Buscar páginas, marcas, ações…"
        className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className="notion-scroll max-h-80 overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
          Nada encontrado.
        </Command.Empty>

        <Command.Group
          heading="Páginas"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
        >
          {PAGINAS.map((p) => (
            <Command.Item
              key={p.label}
              onSelect={() => run(() => abrir(p))}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm normal-case tracking-normal text-foreground data-[selected=true]:bg-accent"
            >
              <p.icon className="h-4 w-4 text-muted-foreground" />
              {p.label}
              {"href" in p && <ExternalLink className="ml-auto h-3 w-3 opacity-40" />}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group
          heading="Marcas"
          className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
        >
          {brands.map((b) => (
            <Command.Item
              key={b.id}
              onSelect={() => run(() => setActiveBrandId(b.id))}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm normal-case tracking-normal text-foreground data-[selected=true]:bg-accent"
            >
              <span>{b.emoji}</span>
              Ativar {b.name}
              {b.id === activeBrand.id && (
                <span className="ml-auto text-xs text-primary">ativa</span>
              )}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group
          heading="Ações"
          className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
        >
          <Command.Item
            onSelect={() => run(toggleTheme)}
            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm normal-case tracking-normal text-foreground data-[selected=true]:bg-accent"
          >
            {theme === "light" ? (
              <Moon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Sun className="h-4 w-4 text-muted-foreground" />
            )}
            Alternar tema
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
