import { createFileRoute, Link } from "@tanstack/react-router";
import { BTN_LINK, BTN_PRIMARIO, BTN_SECUNDARIO, CARD_CLASS, INPUT_CLASS } from "@/lib/botoes";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Design System · Gestão Pólia" },
      {
        name: "description",
        content: "O sistema visual da Pólia: cores, tipografia, componentes e voz.",
      },
    ],
  }),
  component: DesignSystemPage,
});

// Paleta v3 — a que está em uso hoje no Painel, Sidebar, Clientes, Financeiro,
// CRM etc. (escopo .polia-v3 em src/styles.css). Pêssego e turquesa-claro são
// SÓ fundo/borda/gráfico — nunca texto corrido.
const CORES_V3 = [
  { nome: "Fundo", hex: "#F2F0ED", uso: "bg-[var(--bg)]", borda: true },
  { nome: "Superfície", hex: "#F9EFEE", uso: "bg-[var(--surface)]", borda: true },
  { nome: "Tinta", hex: "#0A0A0A", uso: "text-[var(--ink)] · texto principal" },
  { nome: "Tinta suave", hex: "#2C2C2C", uso: "text-[var(--ink-soft)] · texto secundário" },
  { nome: "Apagado", hex: "#6B6B6B", uso: "text-[var(--muted)] · metadado" },
  { nome: "Pêssego", hex: "#F3B9A9", uso: "bg-[var(--accent)] · só fundo/borda" },
  { nome: "Turquesa", hex: "#7CCBCD", uso: "bg-[var(--secondary)] · botão, progresso" },
  { nome: "Turquesa texto", hex: "#24696B", uso: "text-[var(--secondary-text)] · link, CTA (AA)" },
  { nome: "Amarelo", hex: "#FFC629", uso: "bg-[var(--highlight)] · 1 destaque por tela" },
  { nome: "Vermelho-tijolo", hex: "#C0392B", uso: "text-[var(--danger)] · erro, ação destrutiva" },
  { nome: "Linha", hex: "#E6E6E6", uso: "border-[var(--line)]", borda: true },
];

const TIPOS = [
  {
    fam: "Cabinet Grotesk",
    classe: "font-cabinet",
    amostra: "O dia a dia da sua marca, num lugar só.",
    uso: "títulos (h1-h6) · todas as telas",
  },
  {
    fam: "Inter",
    classe: "font-sans",
    amostra: "sem jargão, sem ruído.",
    uso: "texto corrido, UI",
  },
  {
    fam: "DM Sans",
    classe: "font-accent",
    amostra: "RÓTULOS E ETIQUETAS",
    uso: "labels (caixa alta)",
  },
  {
    fam: "Fraunces",
    classe: "font-fraunces italic",
    amostra: "o retorno de quem toca a marca dela.",
    uso: "SÓ itálico de acento pontual (pull-quote, saudação) — nunca título",
  },
  {
    fam: "Caveat",
    classe: "caveat-informacional",
    amostra: "feito com carinho, sem achismo.",
    uso: "toques manuscritos",
  },
];

function DesignSystemPage() {
  return (
    <div className="polia-v3 min-h-screen bg-[var(--bg)]">
      <header className="border-b border-[var(--line)] bg-white px-6 py-5 md:px-12">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between">
          <Link to="/central" className="font-cabinet text-[20px] text-[var(--ink)] no-underline">
            Pólia
          </Link>
          <span className="font-accent text-[10px] font-bold uppercase tracking-[2px] text-[var(--secondary-text)]">
            Design System
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-[1100px] px-6 py-12 md:px-12">
        <div className="mb-4 max-w-[640px]">
          <h1 className="font-cabinet mb-3 text-[44px] leading-tight text-[var(--ink)] md:text-[56px]">
            O mundo visual da Pólia
          </h1>
          <p className="font-sans text-[17px] leading-relaxed text-[var(--ink-soft)]">
            Quente, humano e claro, feito pra mulher que toca o próprio negócio.
          </p>
        </div>
        <div className="mb-14 max-w-[640px] rounded-xl border border-[var(--line)] bg-white p-4">
          <p className="font-sans text-[13px] text-[var(--ink-soft)]">
            <strong className="text-[var(--ink)]">Paleta única:</strong> a{" "}
            <strong>v3 (pêssego + turquesa)</strong> abaixo é a única em uso, em 100% das rotas. A
            paleta v1 (terracota, Territorial Diurno) foi removida do código em 2026-07-23.
          </p>
        </div>

        {/* CORES */}
        <Secao titulo="Cores">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {CORES_V3.map((c) => (
              <div
                key={c.nome}
                className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white"
              >
                <div
                  className="h-24 w-full"
                  style={{
                    background: c.hex,
                    borderBottom: c.borda ? "1px solid var(--line)" : "none",
                  }}
                />
                <div className="p-3">
                  <p className="font-sans text-[14px] font-medium text-[var(--ink)]">{c.nome}</p>
                  <p className="font-mono text-[11px] uppercase tracking-[1px] text-[var(--muted)]">
                    {c.hex}
                  </p>
                  <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">{c.uso}</p>
                </div>
              </div>
            ))}
          </div>
        </Secao>

        {/* TIPOGRAFIA */}
        <Secao titulo="Tipografia">
          <div className="space-y-5">
            {TIPOS.map((t) => (
              <div
                key={t.fam}
                className="flex flex-col gap-2 rounded-2xl border border-[var(--line)] bg-white p-5 md:flex-row md:items-center md:justify-between"
              >
                <p className={`${t.classe} text-[24px] text-[var(--ink)]`}>{t.amostra}</p>
                <div className="shrink-0 text-right">
                  <p className="font-sans text-[13px] font-medium text-[var(--ink)]">{t.fam}</p>
                  <p className="font-sans text-[12px] text-[var(--muted)]">{t.uso}</p>
                </div>
              </div>
            ))}
          </div>
        </Secao>

        {/* COMPONENTES */}
        <Secao titulo="Componentes · v3">
          <div className="grid gap-5 sm:grid-cols-2">
            {/* Botões */}
            <Bloco titulo="Botões">
              <div className="flex flex-wrap items-center gap-3">
                <button className={BTN_PRIMARIO}>Primário</button>
                <button className={BTN_SECUNDARIO}>Secundário</button>
                <button className={BTN_LINK}>Link</button>
              </div>
              <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
                import {"{ BTN_PRIMARIO, BTN_SECUNDARIO, BTN_LINK }"} from "@/lib/botoes"
              </p>
            </Bloco>

            {/* Pills/badges */}
            <Bloco titulo="Etiquetas de status">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[var(--secondary-light)] px-2.5 py-1 font-sans text-[12px] font-medium text-[var(--secondary-text)]">
                  Em dia
                </span>
                <span className="rounded-full bg-[var(--highlight)] px-2.5 py-1 font-sans text-[12px] font-medium text-[var(--highlight-ink)]">
                  Atenção
                </span>
                <span className="rounded-full bg-[var(--danger-soft)] px-2.5 py-1 font-sans text-[12px] font-medium text-[var(--danger)]">
                  Parado
                </span>
                <span className="rounded-full bg-[var(--line)] px-2.5 py-1 font-sans text-[12px] font-medium text-[var(--ink-soft)]">
                  Neutro
                </span>
              </div>
            </Bloco>

            {/* Input */}
            <Bloco titulo="Campo de texto">
              <input type="text" placeholder="digite aqui…" className={INPUT_CLASS} />
            </Bloco>

            {/* Card */}
            <Bloco titulo="Card">
              <div className={`${CARD_CLASS} p-4`}>
                <p className="text-[17px] text-[var(--ink)]">Quanto sobra este mês</p>
                <p className="mt-1 font-sans text-[13px] text-[var(--muted)]">
                  fundo branco, cantos suaves.
                </p>
              </div>
            </Bloco>
          </div>
        </Secao>

        {/* VOZ */}
        <Secao titulo="Voz · Linguagem Aimer">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[var(--secondary)] bg-[var(--secondary-light)]/40 p-5">
              <p className="mb-3 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--secondary-text)]">
                A gente fala assim
              </p>
              <ul className="space-y-1.5 font-sans text-[14px] text-[var(--ink)]">
                <li>"seus números", "quanto você entrega por semana"</li>
                <li>"o dia a dia da sua marca"</li>
                <li>caloroso, direto, adulto</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-5">
              <p className="mb-3 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--danger)]">
                A gente não fala
              </p>
              <ul className="space-y-1.5 font-sans text-[14px] text-[var(--ink)]">
                <li>KPI, dashboard, pipeline, brand board</li>
                <li>jargão corporativo em inglês</li>
                <li>tom infantilizado ou cheerleader</li>
              </ul>
            </div>
          </div>
        </Secao>
      </main>

      <footer className="border-t border-[var(--line)] px-6 py-8 text-center md:px-12">
        <p className="caveat-decorativo text-[var(--secondary-text)]">
          um sistema vivo, cresce com a Pólia.
        </p>
      </footer>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-14">
      <h2 className="mb-5 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
      <p className="mb-3 font-sans text-[13px] font-medium text-[var(--ink-soft)]">{titulo}</p>
      {children}
    </div>
  );
}
