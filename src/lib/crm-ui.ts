// Rótulos, classes e formatação do CRM. Fica fora dos .functions.ts de
// propósito: isto roda no client, aquilo só no servidor.

export const inputClass =
  "w-full rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[14px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--secondary)] focus:outline-none";
export const btnPrimary =
  "rounded-xl bg-[var(--secondary)] px-5 py-2.5 font-sans text-[14px] font-semibold text-[var(--secondary-ink)] transition-opacity hover:opacity-90 disabled:opacity-50";
export const btnOutline =
  "rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[13px] text-[var(--ink-soft)] transition-colors hover:border-[var(--secondary)] hover:text-[var(--ink)] disabled:opacity-40";
export const btnDanger =
  "rounded-xl border border-[var(--danger)] bg-white px-4 py-2 font-sans text-[13px] text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)] disabled:opacity-40";
export const cardClass = "overflow-hidden rounded-2xl border border-[var(--line)] bg-white";
export const thClass =
  "px-5 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]";
export const tdClass = "px-5 py-3 font-sans text-[14px] text-[var(--ink)]";
export const tdMuted = "px-5 py-3 font-sans text-[13px] text-[var(--muted)]";
export const labelClass = "mb-1 block font-sans text-[12px] font-medium text-[var(--muted)]";

// Escala de 4 estados já usada em /crm e nos pedidos de Clientes do app:
// neutro -> ok (turquesa) -> atenção (amarelo) -> parado (vermelho).
export const STATUS_META: Record<string, { label: string; className: string }> = {
  lead: { label: "Lead", className: "bg-[var(--line)] text-[var(--ink-soft)]" },
  conversando: {
    label: "Conversando",
    className: "bg-[var(--secondary-light)] text-[var(--secondary-text)]",
  },
  cliente: { label: "Cliente", className: "bg-[var(--secondary)] text-[var(--secondary-ink)]" },
  inativa: { label: "Sumiu", className: "bg-[var(--highlight)] text-[var(--highlight-ink)]" },
  perdida: { label: "Perdida", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

export const FASE_META: Record<string, { label: string; className: string }> = {
  novo: { label: "Chegou agora", className: "bg-[var(--line)] text-[var(--ink-soft)]" },
  conversando: {
    label: "Conversando",
    className: "bg-[var(--secondary-light)] text-[var(--secondary-text)]",
  },
  proposta: { label: "Proposta na mesa", className: "bg-[var(--accent)] text-[var(--accent-ink)]" },
  fechado: { label: "Fechou", className: "bg-[var(--secondary)] text-[var(--secondary-ink)]" },
  perdido: { label: "Não rolou", className: "bg-[var(--danger-soft)] text-[var(--danger)]" },
};

export const ORIGEM_LABEL: Record<string, string> = {
  manual: "Cadastrei à mão",
  lista_espera: "Lista de espera",
  quiz: "Quiz",
  manual_gratuito: "Manual gratuito",
  formulario_contato: "Formulário de contato",
  servicos: "Pedido de serviço",
  app: "Usa o app",
  indicacao: "Indicação",
  instagram: "Instagram",
};

export const CANAL_LABEL: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  instagram: "Instagram",
  ligacao: "Ligação",
  reuniao: "Conversa",
  nota: "Nota",
  sistema: "Sistema",
};

export const TIPO_TAREFA_LABEL: Record<string, string> = {
  followup: "Retomar contato",
  pos_venda: "Pós-venda",
  cobranca: "Cobrança",
  aniversario: "Aniversário",
  outro: "Outro",
};

export function rotulo(mapa: Record<string, string>, chave: string | null | undefined): string {
  if (!chave) return "—";
  return mapa[chave] ?? chave;
}

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

// {nome}, {primeiro_nome}, {negocio} — as três que cabem em quase toda
// mensagem. Variável sem valor some em vez de virar "undefined" no WhatsApp.
export function aplicarVariaveis(
  texto: string,
  contato: { nome: string; negocio?: string | null },
): string {
  return texto
    .replace(/\{primeiro_nome\}/g, primeiroNome(contato.nome))
    .replace(/\{nome\}/g, contato.nome)
    .replace(/\{negocio\}/g, contato.negocio ?? "")
    .replace(/  +/g, " ");
}

export function linkWhatsApp(telefone: string | null, mensagem?: string): string | null {
  if (!telefone) return null;
  const numero = telefone.replace(/\D/g, "");
  if (numero.length < 12) return null;
  const texto = mensagem?.trim() ? `?text=${encodeURIComponent(mensagem.trim())}` : "";
  return `https://wa.me/${numero}${texto}`;
}

export function formatarTelefone(telefone: string | null): string {
  if (!telefone) return "—";
  const d = telefone.replace(/\D/g, "");
  const semPais = d.startsWith("55") ? d.slice(2) : d;
  if (semPais.length === 11) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 7)}-${semPais.slice(7)}`;
  }
  if (semPais.length === 10) {
    return `(${semPais.slice(0, 2)}) ${semPais.slice(2, 6)}-${semPais.slice(6)}`;
  }
  return telefone;
}

export function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function formatarDataHora(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
