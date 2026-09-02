import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getResumoMonetizacao, type PlanoResumo } from "@/lib/admin-negocio.functions";

export const Route = createFileRoute("/negocio")({
  head: () => ({
    meta: [{ title: "Negócio · Pólia" }],
  }),
  component: AdminNegocio,
});

function formatarBRL(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function AdminNegocio() {
  const [dau, setDau] = useState(0);
  const [wau, setWau] = useState(0);
  const [mau, setMau] = useState(0);
  const [cadastros30d, setCadastros30d] = useState(0);
  const [carregandoUso, setCarregandoUso] = useState(true);

  const [mrrCentavos, setMrrCentavos] = useState(0);
  const [assinantesAtivas, setAssinantesAtivas] = useState(0);
  const [porPlano, setPorPlano] = useState<PlanoResumo[]>([]);
  const [carregandoMonetizacao, setCarregandoMonetizacao] = useState(true);
  const [erroMonetizacao, setErroMonetizacao] = useState(false);

  useEffect(() => {
    (async () => {
      const dia1 = new Date(Date.now() - 1 * 86400000).toISOString();
      const dia7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const dia30 = new Date(Date.now() - 30 * 86400000).toISOString();

      const [{ data: ev1 }, { data: ev7 }, { data: ev30 }, { count: cad30 }] = await Promise.all([
        supabase.from("eventos_analytics").select("sessao_id").gte("criado_em", dia1),
        supabase.from("eventos_analytics").select("sessao_id").gte("criado_em", dia7),
        supabase.from("eventos_analytics").select("sessao_id").gte("criado_em", dia30),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_at", dia30),
      ]);

      setDau(new Set((ev1 ?? []).map((e) => e.sessao_id)).size);
      setWau(new Set((ev7 ?? []).map((e) => e.sessao_id)).size);
      setMau(new Set((ev30 ?? []).map((e) => e.sessao_id)).size);
      setCadastros30d(cad30 ?? 0);
      setCarregandoUso(false);
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
  }, []);

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Negócio</h1>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Uso real (a partir dos eventos rastreados) e monetização (dados ao vivo do Stripe).
      </p>

      <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
        Uso
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "DAU", desc: "sessões ativas hoje", valor: dau },
          { label: "WAU", desc: "sessões ativas em 7 dias", valor: wau },
          { label: "MAU", desc: "sessões ativas em 30 dias", valor: mau },
          { label: "Cadastros 30d", desc: "contas criadas nos últ. 30 dias", valor: cadastros30d },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              {m.label}
            </p>
            <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
              {carregandoUso ? "…" : m.valor}
            </p>
            <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">{m.desc}</p>
          </div>
        ))}
      </div>
      <p className="mb-6 -mt-3 font-sans text-[12px] text-[var(--muted)]">
        DAU/WAU/MAU contam sessões distintas com pelo menos 1 evento no período — só quem aceitou
        cookies de análise entra na conta.
      </p>

      <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
        Monetização
      </p>
      {erroMonetizacao ? (
        <div className="mb-6 rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-5">
          <p className="font-sans text-[13px] text-[var(--danger)]">
            Não consegui buscar os dados do Stripe agora.
          </p>
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              MRR
            </p>
            <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
              {carregandoMonetizacao ? "…" : formatarBRL(mrrCentavos)}
            </p>
            <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">valor real via Stripe</p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              Assinantes ativas
            </p>
            <p className="font-cabinet text-[32px] leading-none text-[var(--ink)]">
              {carregandoMonetizacao ? "…" : assinantesAtivas}
            </p>
            <p className="mt-1 font-sans text-[11px] text-[var(--muted)]">
              active + trialing + past_due
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              Por plano
            </p>
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
    </>
  );
}
