import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useBrands } from "@/lib/fabrica-social/useData";
import { useFabricaSocialAuth } from "./AuthContext";
import type { Brand, CurrentUser } from "@/lib/fabrica-social/mock";

/*
  Mesmo desenho do WorkspaceContext original do Fábrica Social — Context puro
  + cache do TanStack Query, marca ativa persistida em localStorage. Só troca
  `useAuth` pela versão com ponte (`useFabricaSocialAuth`), que não tem
  formulário de login: enquanto a ponte não terminar, `profile` fica null e
  esta tela mostra "carregando", igual a qualquer outra espera de sessão.
*/

interface WorkspaceState {
  user: CurrentUser;
  brands: Brand[];
  activeBrand: Brand;
  setActiveBrandId: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function WorkspaceProviderFabricaSocial({ children }: { children: ReactNode }) {
  const { profile, bridgeError } = useFabricaSocialAuth();
  const { data: brands, isLoading, isError, refetch } = useBrands();
  const [activeBrandId, setActiveBrandIdState] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("fs-active-brand") : null,
  );
  const setActiveBrandId = (id: string) => {
    localStorage.setItem("fs-active-brand", id);
    setActiveBrandIdState(id);
  };

  const brandList = useMemo(() => brands ?? [], [brands]);
  const activeBrand = brandList.find((b) => b.id === activeBrandId) ?? brandList[0] ?? null;

  const value = useMemo<WorkspaceState | null>(
    () =>
      activeBrand && profile
        ? { user: profile, brands: brandList, activeBrand, setActiveBrandId }
        : null,
    [brandList, activeBrand, profile],
  );

  if (bridgeError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">🔒</span>
        <p className="max-w-sm text-[15px] text-[var(--ink-soft)]">{bridgeError}</p>
      </div>
    );
  }

  if (isLoading || (!profile && !isError)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <span className="animate-pulse text-4xl">🏭</span>
      </div>
    );
  }

  if (isError || !value) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <span className="text-4xl">😵</span>
        <p className="text-[15px] text-[var(--ink-soft)]">Não consegui carregar as marcas.</p>
        <button
          onClick={() => refetch()}
          className="text-sm text-[var(--secondary-text)] hover:underline"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useFabricaSocialWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error(
      "useFabricaSocialWorkspace deve ser usado dentro de WorkspaceProviderFabricaSocial",
    );
  return ctx;
}
