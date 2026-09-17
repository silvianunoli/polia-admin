import { useEffect, useState } from "react";

// Padrão de carga das páginas do /founder: dispara a server fn quando o
// período (search param) muda, guarda erro em vez de zero fingido.
export function useCarregar<T>(
  carregar: () => Promise<T>,
  deps: unknown[],
): { dados: T | null; carregando: boolean; erro: boolean; recarregar: () => void } {
  const [dados, setDados] = useState<T | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    (async () => {
      try {
        const r = await carregar();
        if (!vivo) return;
        setDados(r);
        setErro(false);
      } catch {
        if (vivo) setErro(true);
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao]);

  return { dados, carregando, erro, recarregar: () => setVersao((v) => v + 1) };
}
