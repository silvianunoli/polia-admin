import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TOKEN_BRIDGE_V3 } from "@/lib/uiTokenBridge";

// Confirmação na cara da Pólia, no lugar do window.confirm do navegador.
// Vira promise de propósito: no call site troca
//   if (!window.confirm("...")) return;
// por
//   if (!(await confirmar({ ... }))) return;
// e o resto do fluxo continua igual.
//
// O Content é portalado pro document.body, então sai da árvore .polia-v3 e
// perderia os tokens por herança — daí a classe e o TOKEN_BRIDGE_V3 de volta,
// mesmo padrão já usado no modal de excluir post do blog.

export interface PedidoConfirmacao {
  titulo: string;
  descricao: ReactNode;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  /** Ação destrutiva: botão vermelho. Envio de campanha não é destrutivo, é irreversível. */
  perigo?: boolean;
}

export function useConfirmacao() {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirmar = useCallback((p: PedidoConfirmacao) => {
    setPedido(p);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const responder = useCallback((ok: boolean) => {
    setPedido(null);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const dialogo = (
    <AlertDialog
      open={pedido !== null}
      onOpenChange={(aberto) => {
        // Fechar pelo Esc ou clicando fora conta como cancelar, nunca como sim.
        if (!aberto) responder(false);
      }}
    >
      <AlertDialogContent
        className="polia-v3 border border-[var(--line)] bg-white"
        style={TOKEN_BRIDGE_V3}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-cabinet text-[20px] text-[var(--ink)]">
            {pedido?.titulo}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="font-sans text-[14px] leading-relaxed text-[var(--ink-soft)]">
              {pedido?.descricao}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={(e) => {
              e.preventDefault();
              responder(false);
            }}
            className="border-[var(--line)] bg-white font-sans text-[14px] text-[var(--ink-soft)] hover:bg-[var(--surface)]"
          >
            {pedido?.rotuloCancelar ?? "Cancelar"}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              responder(true);
            }}
            className={
              pedido?.perigo
                ? "bg-[var(--danger)] font-sans text-[14px] text-white hover:bg-[var(--danger)] hover:opacity-90"
                : "bg-[var(--secondary)] font-sans text-[14px] font-semibold text-[var(--secondary-ink)] hover:bg-[var(--secondary)] hover:opacity-90"
            }
          >
            {pedido?.rotuloConfirmar ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmar, dialogo };
}
