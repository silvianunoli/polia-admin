import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SkeletonBloco, SkeletonNumero } from "@/components/Skeleton";
import { supabase } from "@/integrations/supabase/client";
import { getResumoMonetizacao, type PlanoResumo } from "@/lib/admin-negocio.functions";
import { ALERTA_ERRO_CLASS, ALERTA_OK_CLASS, BTN_LINK, CARD_CLASS } from "@/lib/botoes";

export const Route = createFileRoute("/numeros")({
  head: () => ({ meta: [{ title: "Números da Pólia One · Gestão Pólia" }] }),
  component: NumerosPolia,
});

type AlertaAberto = {
  id: string;
  titulo: string;
  criado_em: string;
};

type FeatureFlag = {
  key: string;
  enabled: boolean;
};

const LINKS_PROFUNDIDADE = [
  { to: "/painel", label: "Visão geral" },
  { to: "/analytics", label: "Analytics" },
  { to: "/funil", label: "Funil de módulos" },
  { to: "/qualidade", label: "Qualidade" },
  { to: "/governanca", label: "Governança" },
  { to: "/auditoria", label: "Auditoria" },
  { to: "/logs", label: "Logs do sistema" },
] as const;

function formatarBRL(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function NumerosPolia() {
  const [dau, setDau] = useState(0);
  const [wau, setWau] = useState(0);
  const [mau, setMau] = useState(0);
  const [cadastros30d, setCadastros30d] = useState(0);
  const [carregandoUso, setCarregandoUso] = useState(true);
  const [erroUso, setErroUso] = useState(false);

  const [mrrCentavos, setMrrCentavos] = useState(0);
  const [assinantesAtivas, setAssinantesAtivas] = useState(0);
  const [porPlano, setPorPlano] = useState<PlanoResumo[]>([]);
  const [carregandoMonetizacao, setCarregandoMonetizacao] = useState(true);
  const [erroMonetizacao, setErroMonetizacao] = useState(false);

  const [saude, setSaude] = useState<{
    eventos24h: number | null;
    erros24h: number | null;
    latencia: number | null;
  }>({ eventos24h: null, erros24h: null, latencia: null });
  const [carregandoSaude, setCarregandoSaude] = useState(true);
  const [erroSaude, setErroSaude] = useState(false);

  const [alertas, setAlertas] = useState<AlertaAberto[]>([]);
  const [carregandoAlertas, setCarregandoAlertas] = useState(true);
  const [erroAlertas, setErroAlertas] = useState(false);

  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [carregandoFlags, setCarregandoFlags] = useState(true);
  const [erroFlags, setErroFlags] = useState(false);

  useEffect(() => {
    (async () => {
      const dia1 = new Date(Date.now() - 1 * 86400000).toISOString();
      const dia7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const dia30 = new Date(Date.now() - 30 * 86400000).toISOString();

      try {
        const respostas = await Promise.all([
          supabase.from("eventos_analytics").select("sessao_id").gte("criado_em", dia1),
          supabase.from("eventos_analytics").select("sessao_id").gte("criado_em", dia7),
          supabase.from("eventos_analytics").select("sessao_id").gte("criado_em", dia30),
          supabase
            .from("profiles")
            .select("*", { count: "exact", head: true })
            .gte("created_at", dia30),
        ]);
        // O supabase-js devolve o erro no objeto, não lança: sem esta checagem
        // a tela mostraria zero como se fosse número real.
        if (respostas.some((r) => r.error)) setErroUso(true);
        const [{ data: ev1 }, { data: ev7 }, { data: ev30 }, { count: cad30 }] = respostas;

        setDau(new Set((ev1 ?? []).map((e) => e.sessao_id)).size);
        setWau(new Set((ev7 ?? []).map((e) => e.sessao_id)).size);
        setMau(new Set((ev30 ?? []).map((e) => e.sessao_id)).size);
        setCadastros30d(cad30 ?? 0);
      } catch {
        setErroUso(true);
      } finally {
        setCarregandoUso(false);
      }
    })();

    (async () => {
      try {
        const resumo = await getResumoMonetizacao();
        setMrrCentavos(resumo.mrrCentavos);
        setAssinantesAtivas(resumo.assinantesAtivas);
        setPorPlano(resumo.porPlano);
      } catch {
        setErroMonetizacao(true);
      } finally {
        setCarregandoMonetizacao(false);
      }
    })();

    (async () => {
      const dia1 = new Date(Date.now() - 86400000).toISOString();
      try {
        const { data: logs24, error } = await supabase
          .from("edge_function_logs")
          .select("latency_ms, error_message")
          .gte("created_at", dia1);
        if (error) {
          setErroSaude(true);
          return;
        }
        const eventos = (logs24 ?? []) as {
          latency_ms: number | null;
          error_message: string | null;
        }[];
        const comLat = eventos.filter((l) => typeof l.latency_ms === "number");
        setSaude({
          eventos24h: eventos.length,
          erros24h: eventos.filter((l) => l.error_message).length,
          latencia: comLat.length
            ? Math.round(comLat.reduce((s, l) => s + (l.latency_ms ?? 0), 0) / comLat.length)
            : 0,
        });
      } catch {
        setErroSaude(true);
      } finally {
        setCarregandoSaude(false);
      }
    })();

    (async () => {
      try {
        const { data, error } = await supabase
          .from("alertas_abertos")
          .select("id,titulo,criado_em")
          .eq("status", "aberto")
          .order("criado_em", { ascending: false });
        if (error) setErroAlertas(true);
        setAlertas(data ?? []);
      } catch {
        setErroAlertas(true);
      } finally {
        setCarregandoAlertas(false);
      }
    })();

    (async () => {
      try {
        const { data, error } = await supabase
          .from("feature_flags")
          .select("key,enabled")
          .order("key");
        if (error) setErroFlags(true);
        setFlags(data ?? []);
      } catch {
        setErroFlags(true);
      } finally {
        setCarregandoFlags(false);
      }
    })();
  }, []);

  const flagsAtivas = flags.filter((f) => f.enabled).length;

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Números da Pólia One</h1>
      <p className="mb-8 max-w-[640px] font-sans text-[14px] text-[var(--muted)]">
        O resumo do dia: uso, negócio, saúde do sistema e o que está pedindo atenção — tudo numa
        página só, antes de entrar em cada área.
      </p>

      <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Uso
      </h2>
      {erroUso && (
        <div className={`mb-4 ${ALERTA_ERRO_CLASS}`}>
          Não conseguimos carregar os números de uso agora. Atualiza a página pra tentar de novo.
        </div>
      )}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "DAU", desc: "sessões ativas hoje", valor: dau },
          { label: "WAU", desc: "sessões ativas em 7 dias", valor: wau },
          { label: "MAU", desc: "sessões ativas em 30 dias", valor: mau },
          { label: "Cadastros 30d", desc: "contas criadas nos últ. 30 dias", valor: cadastros30d },
        ].map((m) => (
          <div key={m.label} className={`${CARD_CLASS} p-5`}>
            <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              {m.label}
            </p>
            <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
              {carregandoUso ? <SkeletonNumero /> : m.valor}
            </p>
            <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">{m.desc}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Negócio
      </h2>
      {erroMonetizacao ? (
        <div className={`mb-8 ${ALERTA_ERRO_CLASS}`}>
          Não conseguimos buscar os dados do Stripe agora. Atualiza a página pra tentar de novo.
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className={`${CARD_CLASS} p-5`}>
            <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              MRR
            </p>
            <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
              {carregandoMonetizacao ? (
                <SkeletonNumero className="h-8 w-32" />
              ) : (
                formatarBRL(mrrCentavos)
              )}
            </p>
            <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">valor real via Stripe</p>
          </div>
          <div className={`${CARD_CLASS} p-5`}>
            <p className="mb-1 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              Assinantes ativas
            </p>
            <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
              {carregandoMonetizacao ? <SkeletonNumero /> : assinantesAtivas}
            </p>
            <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">
              active + trialing + past_due
            </p>
          </div>
          <div className={`${CARD_CLASS} p-5`}>
            <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              Por plano
            </p>
            {carregandoMonetizacao && (
              <div className="space-y-2">
                <SkeletonBloco className="h-5" />
                <SkeletonBloco className="h-5" />
              </div>
            )}
            {porPlano.length === 0 && !carregandoMonetizacao && (
              <p className="font-sans text-[13px] text-[var(--muted)]">Nenhuma assinatura ativa.</p>
            )}
            <div className="space-y-1">
              {porPlano.map((p) => (
                <div key={p.priceId} className="flex items-center justify-between">
                  <span className="font-sans text-[13px] capitalize text-[var(--ink-soft)]">
                    {p.plano}
                  </span>
                  <span className="font-sans text-[13px] text-[var(--ink)]">
                    {p.quantidade} · {formatarBRL(p.valorMensalCentavos)}/mês
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-4 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Saúde do sistema · 24h
      </h2>
      {erroSaude && (
        <div className={`mb-4 ${ALERTA_ERRO_CLASS}`}>
          Não conseguimos carregar a saúde do sistema agora.
        </div>
      )}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: "Eventos",
            valor: saude.eventos24h === null ? "—" : String(saude.eventos24h),
            cor: "var(--ink)",
          },
          {
            label: "Erros",
            valor: saude.erros24h === null ? "—" : String(saude.erros24h),
            cor: (saude.erros24h ?? 0) > 0 ? "var(--danger)" : "var(--secondary-text)",
          },
          {
            label: "Latência média",
            valor: saude.latencia === null ? "—" : `${saude.latencia} ms`,
            cor: "var(--ink)",
          },
        ].map((m) => (
          <div key={m.label} className={`${CARD_CLASS} p-5`}>
            <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
              {m.label}
            </p>
            <p className="font-cabinet text-[32px] leading-none" style={{ color: m.cor }}>
              {carregandoSaude ? <SkeletonNumero className="h-8 w-20" /> : m.valor}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
              Alertas abertos
            </h2>
            <Link to="/alertas" className={`${BTN_LINK} text-[13px]`}>
              Ver alertas →
            </Link>
          </div>
          {erroAlertas && (
            <div className={ALERTA_ERRO_CLASS}>Não conseguimos carregar os alertas agora.</div>
          )}
          {carregandoAlertas && !erroAlertas && (
            <div className="space-y-3">
              <SkeletonBloco className="h-16" />
              <SkeletonBloco className="h-16" />
            </div>
          )}
          {!carregandoAlertas && !erroAlertas && alertas.length === 0 && (
            <div className={ALERTA_OK_CLASS}>Nenhum alerta aberto no momento.</div>
          )}
          {!carregandoAlertas && !erroAlertas && alertas.length > 0 && (
            <div className="space-y-3">
              {alertas.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-4"
                >
                  <p className="font-sans text-[13px] font-medium text-[var(--danger)]">
                    {a.titulo}
                  </p>
                  <p className="font-sans text-[12px] text-[var(--ink-soft)]">
                    {new Date(a.criado_em).toLocaleString("pt-BR")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
              Feature Flags
            </h2>
            <Link to="/flags" className={`${BTN_LINK} text-[13px]`}>
              Gerenciar flags →
            </Link>
          </div>
          {erroFlags && (
            <div className={ALERTA_ERRO_CLASS}>Não conseguimos carregar as flags agora.</div>
          )}
          {carregandoFlags && !erroFlags && (
            <div className="space-y-3">
              <SkeletonBloco className="h-10" />
              <SkeletonBloco className="h-10" />
            </div>
          )}
          {!carregandoFlags && !erroFlags && flags.length === 0 && (
            <div className={`${CARD_CLASS} p-5`}>
              <p className="font-sans text-[13px] text-[var(--muted)]">
                Nenhuma flag cadastrada no banco ainda.
              </p>
            </div>
          )}
          {!carregandoFlags && !erroFlags && flags.length > 0 && (
            <>
              <p className="mb-3 font-sans text-[13px] text-[var(--ink-soft)]">
                {flagsAtivas} de {flags.length} ligadas
              </p>
              <div className={`${CARD_CLASS} divide-y divide-[var(--line)]`}>
                {flags.map((f) => (
                  <div key={f.key} className="flex items-center justify-between px-5 py-3">
                    <p className="font-mono text-[13px] text-[var(--ink)]">{f.key}</p>
                    <span
                      className="font-accent text-[10px] font-bold uppercase tracking-[1px]"
                      style={{ color: f.enabled ? "var(--secondary-text)" : "var(--muted)" }}
                    >
                      {f.enabled ? "ligada" : "desligada"}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <h2 className="mb-3 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
        Ir mais fundo
      </h2>
      <div className="flex flex-wrap gap-2">
        {LINKS_PROFUNDIDADE.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 font-sans text-[13px] text-[var(--ink-soft)] no-underline hover:border-[var(--secondary)] hover:text-[var(--ink)]"
          >
            {l.label}
          </Link>
        ))}
      </div>
    </>
  );
}
