import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SkeletonBloco, SkeletonNumero } from "@/components/Skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  getResumoMonetizacao,
  getResumoNumeros,
  type ResumoNumeros,
  type UsuariaResumo,
} from "@/lib/admin-negocio.functions";
import { ALERTA_ERRO_CLASS, BTN_LINK, CARD_CLASS } from "@/lib/botoes";

export const Route = createFileRoute("/numeros")({
  head: () => ({ meta: [{ title: "Números da Pólia One · Gestão Pólia" }] }),
  component: NumerosPolia,
});

const LINKS_PROFUNDIDADE = [
  { to: "/painel", label: "Visão geral" },
  { to: "/negocio", label: "Negócio" },
  { to: "/analytics", label: "Analytics" },
  { to: "/funil", label: "Funil de módulos" },
  { to: "/alertas", label: "Alertas" },
  { to: "/founder/features/flags", label: "Feature Flags" },
] as const;

function formatarBRL(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string | null) {
  if (!iso) return "sem atividade registrada";
  return new Date(iso).toLocaleDateString("pt-BR");
}

function ListaUsuarias({ lista, total }: { lista: UsuariaResumo[]; total: number }) {
  if (lista.length === 0) {
    return <p className="font-sans text-[13px] text-[var(--muted)]">Ninguém nesse grupo agora.</p>;
  }
  return (
    <div className="space-y-2">
      {lista.slice(0, 8).map((u) => (
        <div key={u.id} className="flex items-center justify-between">
          <Link
            to="/usuarios/$id"
            params={{ id: u.id }}
            className="truncate font-sans text-[13px] text-[var(--ink)] no-underline hover:underline"
          >
            {u.nome}
          </Link>
          <span className="shrink-0 pl-2 font-sans text-[11px] text-[var(--muted)]">
            {formatarData(u.ultimaAtividade)}
          </span>
        </div>
      ))}
      {total > 8 && (
        <p className="pt-1 font-sans text-[11px] text-[var(--muted)]">e mais {total - 8}.</p>
      )}
    </div>
  );
}

function NumerosPolia() {
  const [resumo, setResumo] = useState<ResumoNumeros | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  const [mrrCentavos, setMrrCentavos] = useState(0);
  const [assinantesAtivas, setAssinantesAtivas] = useState(0);
  const [carregandoNegocio, setCarregandoNegocio] = useState(true);

  const [alertasAbertos, setAlertasAbertos] = useState(0);
  const [flagsLigadas, setFlagsLigadas] = useState({ ligadas: 0, total: 0 });
  const [carregandoPanorama, setCarregandoPanorama] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await getResumoNumeros();
        setResumo(r);
      } catch {
        setErro(true);
      } finally {
        setCarregando(false);
      }
    })();

    (async () => {
      try {
        const negocio = await getResumoMonetizacao();
        setMrrCentavos(negocio.mrrCentavos);
        setAssinantesAtivas(negocio.assinantesAtivas);
      } catch {
        // painel de negócio detalhado fica em /negocio — aqui é só o chip.
      } finally {
        setCarregandoNegocio(false);
      }
    })();

    (async () => {
      try {
        const [{ count: alertas }, { data: flags }] = await Promise.all([
          supabase
            .from("alertas_abertos")
            .select("*", { count: "exact", head: true })
            .eq("status", "aberto"),
          supabase.from("founder_flags").select("estado").eq("ambiente", "prod"),
        ]);
        setAlertasAbertos(alertas ?? 0);
        const linhas = (flags ?? []) as { estado: string }[];
        setFlagsLigadas({
          ligadas: linhas.filter((f) => f.estado !== "off").length,
          total: linhas.length,
        });
      } catch {
        // idem — detalhe fica em /alertas e /founder/features/flags.
      } finally {
        setCarregandoPanorama(false);
      }
    })();
  }, []);

  const funilPassos = resumo
    ? [
        { label: "Criou conta", valor: resumo.funil.totalCadastros },
        { label: "Completou onboarding", valor: resumo.funil.completaramOnboarding },
        { label: "Criou o primeiro negócio", valor: resumo.funil.criaramPrimeiroNegocio },
        { label: "Usou uma funcionalidade", valor: resumo.funil.usaramFuncionalidade },
        { label: "Voltou depois de 7 dias", valor: resumo.funil.voltaramEm7Dias },
        { label: "Virou recorrente", valor: resumo.funil.recorrentes },
      ]
    : [];

  const deltaSemana =
    resumo && resumo.ativasSemanaAnterior > 0
      ? Math.round(
          ((resumo.ativasSemanaAtual - resumo.ativasSemanaAnterior) / resumo.ativasSemanaAnterior) *
            100,
        )
      : null;

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Números da Pólia One</h1>
      <p className="mb-8 max-w-[640px] font-sans text-[14px] text-[var(--muted)]">
        Não é o que cada usuária fez — é se a Pólia está sendo usada de verdade: quem ativou, quem
        sumiu, quem paga e não usa, e o que está pedindo atenção agora.
      </p>

      {erro && (
        <div className={`mb-8 ${ALERTA_ERRO_CLASS}`}>
          Não conseguimos carregar os números agora. Atualiza a página pra tentar de novo.
        </div>
      )}

      {!erro && (
        <div className="mb-8 rounded-2xl bg-[var(--ink)] p-8">
          <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-[2px] text-[var(--secondary)]">
            Pulso da semana
          </p>
          {carregando ? (
            <SkeletonNumero className="h-8 w-64 bg-white/10" />
          ) : (
            <p className="font-sans text-[16px] leading-relaxed text-white">
              <strong className="font-cabinet text-[22px]">{resumo?.ativasSemanaAtual ?? 0}</strong>{" "}
              usuárias ativas nos últimos 7 dias
              {deltaSemana !== null && (
                <span
                  className={deltaSemana >= 0 ? "text-[var(--secondary)]" : "text-[var(--accent)]"}
                >
                  {" "}
                  ({deltaSemana >= 0 ? "+" : ""}
                  {deltaSemana}% vs. semana anterior)
                </span>
              )}
              . {resumo?.segmentos.emRiscoTotal ?? 0} em risco de sumir,{" "}
              {resumo?.segmentos.assinantesSemUsoTotal ?? 0} pagando sem usar há 14+ dias.
            </p>
          )}
        </div>
      )}

      <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Funil de ativação
      </h2>
      <p className="mb-4 font-sans text-[12px] text-[var(--muted)]">
        Quantas usuárias, desde sempre, já passaram por cada degrau — não é coorte de um mês.
      </p>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {carregando
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonBloco key={i} className="h-24" />)
          : funilPassos.map((p, i) => {
              const anterior = i === 0 ? resumo!.funil.totalCadastros : funilPassos[i - 1].valor;
              const pct = anterior > 0 ? Math.round((p.valor / anterior) * 100) : 0;
              return (
                <div key={p.label} className={`${CARD_CLASS} p-4`}>
                  <p className="font-cabinet text-[26px] leading-none text-[var(--ink)]">
                    {p.valor}
                  </p>
                  <p className="mt-1 font-sans text-[11px] text-[var(--ink-soft)]">{p.label}</p>
                  {i > 0 && (
                    <p className="mt-1 font-sans text-[10px] text-[var(--muted)]">
                      {pct}% do anterior
                    </p>
                  )}
                </div>
              );
            })}
      </div>

      <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Segmentos · uso × pagamento
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className={`${CARD_CLASS} p-5`}>
          <p className="mb-1 font-sans text-[13px] font-medium text-[var(--danger)]">
            Assinantes pagando sem usar
          </p>
          <p className="mb-3 font-sans text-[11px] text-[var(--muted)]">
            Assinatura ativa, sem evento de uso nos últimos 14 dias.
          </p>
          {carregando ? (
            <SkeletonBloco className="h-20" />
          ) : (
            <>
              <p className="font-cabinet mb-2 text-[28px] leading-none text-[var(--ink)]">
                {resumo?.segmentos.assinantesSemUsoTotal ?? 0}
              </p>
              <ListaUsuarias
                lista={resumo?.segmentos.assinantesSemUso ?? []}
                total={resumo?.segmentos.assinantesSemUsoTotal ?? 0}
              />
            </>
          )}
        </div>

        <div className={`${CARD_CLASS} p-5`}>
          <p className="mb-1 font-sans text-[13px] font-medium text-[var(--danger)]">
            Em risco de sumir
          </p>
          <p className="mb-3 font-sans text-[11px] text-[var(--muted)]">
            Tinha uso recorrente no mês, sem nenhum evento nos últimos 7 dias.
          </p>
          {carregando ? (
            <SkeletonBloco className="h-20" />
          ) : (
            <>
              <p className="font-cabinet mb-2 text-[28px] leading-none text-[var(--ink)]">
                {resumo?.segmentos.emRiscoTotal ?? 0}
              </p>
              <ListaUsuarias
                lista={resumo?.segmentos.emRisco ?? []}
                total={resumo?.segmentos.emRiscoTotal ?? 0}
              />
            </>
          )}
        </div>

        <div className={`${CARD_CLASS} p-5`}>
          <p className="mb-1 font-sans text-[13px] font-medium text-[var(--secondary-text)]">
            Gratuitas engajadas
          </p>
          <p className="mb-3 font-sans text-[11px] text-[var(--muted)]">
            Sem assinatura, usou em 5+ dias diferentes nos últimos 30 dias.
          </p>
          {carregando ? (
            <SkeletonBloco className="h-20" />
          ) : (
            <>
              <p className="font-cabinet mb-2 text-[28px] leading-none text-[var(--ink)]">
                {resumo?.segmentos.gratuitasEngajadasTotal ?? 0}
              </p>
              <ListaUsuarias
                lista={resumo?.segmentos.gratuitasEngajadas ?? []}
                total={resumo?.segmentos.gratuitasEngajadasTotal ?? 0}
              />
            </>
          )}
        </div>

        <div className={`${CARD_CLASS} p-5`}>
          <p className="mb-1 font-sans text-[13px] font-medium text-[var(--secondary-text)]">
            Altamente engajadas
          </p>
          <p className="mb-3 font-sans text-[11px] text-[var(--muted)]">
            Usou em 3+ dias diferentes só na última semana.
          </p>
          {carregando ? (
            <SkeletonBloco className="h-20" />
          ) : (
            <>
              <p className="font-cabinet mb-2 text-[28px] leading-none text-[var(--ink)]">
                {resumo?.segmentos.altamenteEngajadasTotal ?? 0}
              </p>
              <ListaUsuarias
                lista={resumo?.segmentos.altamenteEngajadas ?? []}
                total={resumo?.segmentos.altamenteEngajadasTotal ?? 0}
              />
            </>
          )}
        </div>
      </div>

      <h2 className="mb-1 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Funcionalidades mais usadas
      </h2>
      <p className="mb-4 font-sans text-[12px] text-[var(--muted)]">
        Últimos 30 dias, por usuárias únicas que dispararam o evento — sem pageview/click.
      </p>
      <div className={`mb-8 ${CARD_CLASS} p-6`}>
        {carregando ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBloco key={i} className="h-6" />
            ))}
          </div>
        ) : !resumo || resumo.featuresTop.length === 0 ? (
          <p className="font-sans text-[13px] text-[var(--muted)]">
            Sem eventos de uso no período.
          </p>
        ) : (
          <div className="space-y-3">
            {resumo.featuresTop.map((f) => {
              const max = resumo.featuresTop[0].usuariasUnicas || 1;
              return (
                <div key={f.evento}>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="truncate font-mono text-[12px] text-[var(--ink)]">{f.evento}</p>
                    <p className="shrink-0 pl-2 font-sans text-[12px] text-[var(--muted)]">
                      {f.usuariasUnicas} usuárias · {f.total} eventos
                    </p>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[var(--line)]">
                    <div
                      className="h-1.5 rounded-full bg-[var(--secondary)]"
                      style={{ width: `${(f.usuariasUnicas / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <h2 className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Panorama rápido
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          to="/negocio"
          className={`${CARD_CLASS} p-4 no-underline hover:border-[var(--secondary)]`}
        >
          <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            MRR
          </p>
          <p className="font-cabinet text-[22px] leading-none text-[var(--ink)]">
            {carregandoNegocio ? <SkeletonNumero className="h-6 w-20" /> : formatarBRL(mrrCentavos)}
          </p>
        </Link>
        <Link
          to="/negocio"
          className={`${CARD_CLASS} p-4 no-underline hover:border-[var(--secondary)]`}
        >
          <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Assinantes
          </p>
          <p className="font-cabinet text-[22px] leading-none text-[var(--ink)]">
            {carregandoNegocio ? <SkeletonNumero className="h-6 w-12" /> : assinantesAtivas}
          </p>
        </Link>
        <Link
          to="/alertas"
          className={`${CARD_CLASS} p-4 no-underline hover:border-[var(--secondary)]`}
        >
          <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Alertas abertos
          </p>
          <p
            className="font-cabinet text-[22px] leading-none"
            style={{ color: alertasAbertos > 0 ? "var(--danger)" : "var(--ink)" }}
          >
            {carregandoPanorama ? <SkeletonNumero className="h-6 w-8" /> : alertasAbertos}
          </p>
        </Link>
        <Link
          to="/founder/features/flags"
          search={{ periodo: "7" }}
          className={`${CARD_CLASS} p-4 no-underline hover:border-[var(--secondary)]`}
        >
          <p className="font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
            Feature flags
          </p>
          <p className="font-cabinet text-[22px] leading-none text-[var(--ink)]">
            {carregandoPanorama ? (
              <SkeletonNumero className="h-6 w-12" />
            ) : (
              `${flagsLigadas.ligadas}/${flagsLigadas.total}`
            )}
          </p>
        </Link>
      </div>

      <h2 className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Ir mais fundo
      </h2>
      <div className="flex flex-wrap gap-2">
        {LINKS_PROFUNDIDADE.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className={`${BTN_LINK} rounded-xl border border-[var(--line)] bg-white px-4 py-2 no-underline hover:border-[var(--secondary)]`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </>
  );
}
