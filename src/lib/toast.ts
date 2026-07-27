import { toast } from "sonner";

interface ToastOpts {
  action?: { label: string; onClick: () => void };
}

export function toastSucesso(mensagem: string, opts?: ToastOpts) {
  return toast.success(mensagem, { duration: 4000, action: opts?.action });
}

export function toastInfo(mensagem: string, opts?: ToastOpts) {
  return toast(mensagem, { duration: 4000, action: opts?.action });
}

function getAssertiveRegion(): HTMLDivElement | null {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("toast-assertive-live") as HTMLDivElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-assertive-live";
    el.setAttribute("role", "alert");
    el.setAttribute("aria-live", "assertive");
    el.className = "sr-only";
    document.body.appendChild(el);
  }
  return el;
}

export function toastErro(mensagem: string, opts?: ToastOpts) {
  const region = getAssertiveRegion();
  if (region) {
    region.textContent = "";
    window.setTimeout(() => {
      region.textContent = mensagem;
    }, 30);
  }
  return toast.error(mensagem, { duration: 6000, action: opts?.action });
}
