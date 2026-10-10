import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { z } from "zod";
import { SkeletonBloco, SkeletonNumero } from "@/components/Skeleton";
import { getFunilCampanhas } from "@/lib/campanhas.functions";
import { taxa, TODAS, type LinhaAnuncio, type Totais } from "@/lib/campanhas-funil";
import { btnOutline, cardClass, formatarReais, inputClass, tdClass, thClass } from "@/lib/crm-ui";

// Funil próprio dos anúncios: de qual anúncio (utm_content) a conta veio e até
// onde ela foi. Só contagens; nenhum e-mail ou nome passa por esta tela.
// Sem tempo real de propósito: os números mudam devagar e o botão Atualizar
// refaz a consulta quando ela quiser.

const searchSchema = z.object({
  campanha: z.string().optional().catch(undefined),
  janela: z.enum(["7", "30", "tudo"]).default("30").catch("30"),
});

export const Route = createFileRoute("/campanhas")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Campanhas · Pólia" }] }),
  component: PainelCampanhas,
});

type Resultado = Awaited<ReturnType<typeof getFunilCampanhas>>;

const PERIODOS: { chave: "7" | "30" | "tudo"; label: string }[] = [
  { chave: "7", label: "7 dias" },
  { chave: "30", label: "30 dias" },
  { chave: "tudo", label: "Tudo" },
];

function numero(v: number): string {
  return v.toLocaleString("pt-BR");
}

function pct(v: number | null): string | null {
  if (v === null) return null;
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 })}%`;
}

function horaBRT(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SemDado() {
  return <span className="text-[var(--muted)]">sem dado</span>;
}

function reais(v: number | null) {
  return v === null ? <SemDado /> : formatarReais(v);
}

function CartaoEtapa({
  rotulo,
  valor,
  linhas,
  carregando,
}: {
  rotulo: string;
  valor: number;
  linhas: (string | null)[];
  carregando: boolean;
}) {
  return (
    <div className={`${cardClass} p-5`}>
      <p className="font-sans text-[13px] text-[var(--muted)]">{rotulo}</p>
      <p className="font-cabinet mt-1 text-[36px] leading-none text-[var(--ink)]">
        {carregando ? <SkeletonNumero className="h-9 w-16" /> : numero(valor)}
      </p>
      {!carregando &&
        linhas
          .filter((l): l is string => !!l)
          .map((l) => (
            <p key={l} className="mt-1 font-sans text-[12px] text-[var(--ink-soft)]">
              {l}
            </p>
          ))}
    </div>
  );
}

function Etapas({ t, carregando }: { t: Totais | null; carregando: boolean }) {
  const tt: Totais = t ?? {
    cadastros: 0,
    fezOnboarding: 0,
    calculouPreco: 0,
    assinantes: 0,
    gasto: null,
    cliques: null,
    custoPorCadastro: null,
    custoPorAtivada: null,
    custoPorAssinante: null,
  };
  const deCliques = tt.cliques !== null ? pct(taxa(tt.cadastros, tt.cliques)) : null;
  const dos = (parte: number) => {
    const p = pct(taxa(parte, tt.cadastros));
    return p ? `${p} dos cadastros` : null;
  };
  const daAnterior = (parte: number, base: number, nome: string) => {
    const p = pct(taxa(parte, base));
    return p ? `${p} de quem ${nome}` : null;
  };
  return (
    <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
      <CartaoEtapa
        rotulo="Cadastros"
        valor={tt.cadastros}
        carregando={carregando}
        linhas={[deCliques ? `${deCliques} de quem clicou` : null]}
      />
      <CartaoEtapa
        rotulo="Fizeram onboarding"
        valor={tt.fezOnboarding}
        carregando={carregando}
        linhas={[dos(tt.fezOnboarding)]}
      />
      <CartaoEtapa
        rotulo="Calcularam preço"
        valor={tt.calculouPreco}
        carregando={carregando}
        linhas={[
          dos(tt.calculouPreco),
          daAnterior(tt.calculouPreco, tt.fezOnboarding, "fez onboarding"),
        ]}
      />
      <CartaoEtapa
        rotulo="Assinantes"
        valor={tt.assinantes}
        carregando={carregando}
        linhas={[dos(tt.assinantes), daAnterior(tt.assinantes, tt.calculouPreco, "calculou preço")]}
      />
    </div>
  );
}

function AvisoMeta({ meta }: { meta: Resultado["meta"] }) {
  if (meta.estado === "ok") return null;
  const texto =
    meta.estado === "desconectado"
      ? "Gasto do Meta não conectado."
      : `Gasto do Meta indisponível agora. ${meta.mensagem}`;
  return <p className="font-sans text-[12px] text-[var(--muted)]">{texto}</p>;
}

function Custos({ t, meta }: { t: Totais; meta: Resultado["meta"] }) {
  if (meta.estado !== "ok") {
    return (
      <div className="mb-6">
        <AvisoMeta meta={meta} />
      </div>
    );
  }
  const itens: { rotulo: string; valor: number | null }[] = [
    { rotulo: "Gasto no Meta", valor: t.gasto },
    { rotulo: "Custo por cadastro", valor: t.custoPorCadastro },
    { rotulo: "Custo por ativada", valor: t.custoPorAtivada },
    { rotulo: "Custo por assinante", valor: t.custoPorAssinante },
  ];
  return (
    <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="rounded-2xl bg-[var(--surface)] p-4">
          <p className="font-sans text-[12px] text-[var(--muted)]">{i.rotulo}</p>
          <p className="font-cabinet mt-1 text-[22px] leading-none text-[var(--ink)]">
            {reais(i.valor)}
          </p>
        </div>
      ))}
    </div>
  );
}

function celulaEtapa(valor: number, cadastros: number) {
  const p = pct(taxa(valor, cadastros));
  return (
    <td className={tdClass}>
      {numero(valor)}
      {p && valor > 0 && (
        <span className="ml-1 font-sans text-[12px] text-[var(--muted)]">({p})</span>
      )}
    </td>
  );
}

function Tabela({ linhas, meta }: { linhas: LinhaAnuncio[]; meta: Resultado["meta"] }) {
  const conectado = meta.estado === "ok";
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[var(--line)]">
            <th className={thClass}>Anúncio</th>
            <th className={thClass}>Cadastros</th>
            <th className={thClass}>Onboarding</th>
            <th className={thClass}>Calcularam preço</th>
            <th className={thClass}>Assinantes</th>
            <th className={thClass}>Gasto</th>
            {conectado && (
              <>
                <th className={thClass}>Cliques</th>
                <th className={thClass}>Por cadastro</th>
                <th className={thClass}>Por ativada</th>
                <th className={thClass}>Por assinante</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={l.anuncio} className="border-b border-[var(--line)] last:border-b-0">
              <td className={`${tdClass} font-medium`}>{l.anuncio}</td>
              <td className={tdClass}>{numero(l.cadastros)}</td>
              {celulaEtapa(l.fezOnboarding, l.cadastros)}
              {celulaEtapa(l.calculouPreco, l.cadastros)}
              {celulaEtapa(l.assinantes, l.cadastros)}
              {conectado ? (
                <>
                  <td className={tdClass}>{reais(l.gasto)}</td>
                  <td className={tdClass}>
                    {l.cliques === null ? <SemDado /> : numero(l.cliques)}
                  </td>
                  <td className={tdClass}>{reais(l.custoPorCadastro)}</td>
                  <td className={tdClass}>{reais(l.custoPorAtivada)}</td>
                  <td className={tdClass}>{reais(l.custoPorAssinante)}</td>
                </>
              ) : (
                i === 0 && (
                  <td rowSpan={linhas.length} className="px-5 py-3 align-middle">
                    <AvisoMeta meta={meta} />
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PainelCampanhas() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/campanhas" });
  const [dados, setDados] = useState<Resultado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await getFunilCampanhas({
        data: { campanha: search.campanha, periodo: search.janela },
      });
      setDados(r);
    } catch (e) {
      console.error("[Campanhas]", e);
      setErro("A Pólia não conseguiu carregar o funil agora. Tenta de novo em alguns minutos.");
    } finally {
      setCarregando(false);
    }
  }, [search.campanha, search.janela]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const definir = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ to: ".", search: (prev) => ({ ...prev, ...patch }), replace: true });
  };

  const campanhaAtual = dados?.campanha ?? search.campanha ?? "";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Campanhas</h1>
          <p className="font-sans text-[14px] text-[var(--muted)]">
            Funil dos anúncios pelo cadastro: de qual anúncio a conta veio e até onde foi. Só
            contagens, sem nome nem e-mail.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dados && !carregando && (
            <span className="font-sans text-[12px] text-[var(--muted)]">
              Atualizado às {horaBRT(dados.atualizadoEm)}
            </span>
          )}
          <button type="button" onClick={carregar} disabled={carregando} className={btnOutline}>
            <span className="inline-flex items-center gap-2">
              <RefreshCcw
                size={14}
                className={carregando ? "animate-spin" : ""}
                aria-hidden="true"
              />
              Atualizar
            </span>
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 font-sans text-[13px] text-[var(--ink-soft)]">
          Campanha
          <select
            value={campanhaAtual}
            onChange={(e) => definir({ campanha: e.target.value })}
            disabled={!dados}
            className={`${inputClass} w-auto py-1.5 text-[13px]`}
          >
            <option value={TODAS}>Todas</option>
            {dados?.campanhas.map((c) => (
              <option key={c.campanha} value={c.campanha}>
                {c.campanha} ({numero(c.cadastros)})
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-1 rounded-lg bg-[var(--surface)] p-1">
          {PERIODOS.map((o) => (
            <button
              key={o.chave}
              type="button"
              onClick={() => definir({ janela: o.chave })}
              aria-pressed={search.janela === o.chave}
              className={`cursor-pointer rounded-md px-3 py-1.5 font-sans text-[12px] font-medium ${
                search.janela === o.chave
                  ? "bg-white text-[var(--ink)] shadow-sm"
                  : "text-[var(--ink-soft)]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div className="mb-6 rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-5">
          <p className="font-sans text-[13px] text-[var(--danger)]">{erro}</p>
        </div>
      )}

      <Etapas t={dados?.totais ?? null} carregando={carregando} />
      {dados && !carregando && <Custos t={dados.totais} meta={dados.meta} />}

      <div className={cardClass}>
        {carregando ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBloco key={i} className="h-10" />
            ))}
          </div>
        ) : dados && dados.linhas.length > 0 ? (
          <Tabela linhas={dados.linhas} meta={dados.meta} />
        ) : dados ? (
          <p className="p-6 font-sans text-[13px] text-[var(--muted)]">
            Nenhum cadastro vindo de anúncio nesse recorte.
          </p>
        ) : null}
      </div>

      <p className="mt-4 font-sans text-[12px] text-[var(--muted)]">
        Ativada é quem salvou ao menos um produto pela calculadora. Assinante é plano Premium ou Pro
        hoje. O gasto é cruzado pelo nome do anúncio no Meta igual ao utm_content.
      </p>
    </>
  );
}
