import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SkeletonBloco, SkeletonNumero } from "@/components/Skeleton";
import { supabase } from "@/integrations/supabase/client";
import { CARD_CLASS } from "@/lib/botoes";
import { MODULOS, TOTAL_MODULOS } from "@/lib/planejamento-constants";

export const Route = createFileRoute("/funil")({
  head: () => ({
    meta: [{ title: "Funil de módulos · Pólia" }],
  }),
  component: AdminFunil,
});

type LinhaFunil = { n: number; nome: string; concluidas: number; dropoff: number };

function AdminFunil() {
  const [linhas, setLinhas] = useState<LinhaFunil[]>([]);
  const [total, setTotal] = useState(0);
  const [seg, setSeg] = useState({ progressoras: 0, estagnadas: 0, silenciosas: 0 });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const respostas = await Promise.all([
          supabase.from("profiles").select("id,updated_at", { count: "exact" }),
          supabase.from("planejamento_secoes").select("user_id,modulo").eq("concluido", true),
        ]);
        // O supabase-js devolve o erro no objeto, não lança.
        if (respostas.some((r) => r.error)) setErro(true);
        const [{ data: profiles, count }, { data: secoes }] = respostas;
        const totalC = count ?? 0;
        setTotal(totalC);

        // Módulo mais avançado que cada usuária já concluiu ao menos 1 seção.
        const maxModuloPorUsuaria = new Map<string, number>();
        (secoes ?? []).forEach((s) => {
          const atual = maxModuloPorUsuaria.get(s.user_id) ?? 0;
          if (s.modulo > atual) maxModuloPorUsuaria.set(s.user_id, s.modulo);
        });
        const maxModulos = Array.from(maxModuloPorUsuaria.values());

        const contagem: number[] = Array(TOTAL_MODULOS + 1).fill(0);
        maxModulos.forEach((max) => {
          for (let i = 1; i <= max; i++) contagem[i]++;
        });
        const out = MODULOS.map((m) => {
          const concluidas = contagem[m.n];
          const anterior = m.n === 1 ? totalC : contagem[m.n - 1];
          const dropoff = anterior > 0 ? Math.round(((anterior - concluidas) / anterior) * 100) : 0;
          return { n: m.n, nome: m.nome, concluidas, dropoff };
        });
        setLinhas(out);

        const dias14 = Date.now() - 14 * 86400000;
        let prog = 0,
          estag = 0,
          sil = 0;
        (profiles ?? []).forEach((p) => {
          const ts = new Date(p.updated_at).getTime();
          const maxModulo = maxModuloPorUsuaria.get(p.id) ?? 0;
          if (ts < dias14) sil++;
          else if (maxModulo >= 1) prog++;
          else estag++;
        });
        setSeg({ progressoras: prog, estagnadas: estag, silenciosas: sil });
      } catch {
        setErro(true);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  return (
    <>
      <h1 className="font-cabinet mb-1 text-[40px] text-[var(--ink)]">Funil de módulos</h1>
      <p className="mb-8 font-sans text-[14px] text-[var(--muted)]">
        Quantas usuárias chegaram em cada módulo do Planejamento.
      </p>

      {erro && (
        <div className="mb-6 rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-5">
          <p className="font-sans text-[13px] text-[var(--danger)]">
            Não conseguimos carregar o funil agora. Atualiza a página pra tentar de novo.
          </p>
        </div>
      )}

      <div className={`mb-6 ${CARD_CLASS} p-8`}>
        <h2 className="mb-6 font-accent text-[11px] font-bold uppercase tracking-[2px] text-[var(--muted)]">
          Progresso por módulo
        </h2>
        {carregando ? (
          <div className="space-y-4">
            {Array.from({ length: TOTAL_MODULOS }).map((_, i) => (
              <SkeletonBloco key={i} className="h-10" />
            ))}
          </div>
        ) : linhas.length === 0 ? (
          <p className="font-sans text-[13px] text-[var(--muted)]">
            Nenhum módulo concluído ainda.
          </p>
        ) : (
          linhas.map((linha, i) => (
            <div key={linha.n} className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-sans text-[13px] text-[var(--ink)]">
                  <span className="mr-2 text-[var(--muted)]">M{linha.n}</span> {linha.nome}
                </p>
                <div className="flex items-center gap-4">
                  <p className="font-sans text-[13px] text-[var(--ink-soft)]">
                    {linha.concluidas} usuárias
                  </p>
                  {i > 0 && linha.dropoff > 40 && (
                    <span className="rounded-full bg-[var(--danger-soft)] px-2 py-0.5 font-accent text-[10px] font-bold uppercase tracking-[1px] text-[var(--danger)]">
                      -{linha.dropoff}% drop
                    </span>
                  )}
                </div>
              </div>
              <div className="h-3 w-full rounded-full bg-[var(--line)]">
                <div
                  className="h-3 rounded-full transition-all"
                  style={{
                    width: `${total ? (linha.concluidas / total) * 100 : 0}%`,
                    backgroundColor: linha.dropoff > 40 ? "var(--danger)" : "var(--secondary)",
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          {
            label: "Progressoras Ativas",
            desc: "concluiu ao menos 1 módulo e ativa em 14 dias",
            count: seg.progressoras,
            cor: "var(--secondary-text)",
          },
          {
            label: "Estagnadas",
            desc: "ativa mas sem nenhum módulo concluído",
            count: seg.estagnadas,
            cor: "var(--ink-soft)",
          },
          {
            label: "Silenciosas",
            desc: "sem acesso há mais de 14 dias",
            count: seg.silenciosas,
            cor: "var(--danger)",
          },
        ].map((s) => (
          <div key={s.label} className={`${CARD_CLASS} p-6`}>
            <p className="font-cabinet mb-2 text-[48px] leading-none" style={{ color: s.cor }}>
              {carregando ? <SkeletonNumero className="h-12 w-20" /> : s.count}
            </p>
            <p className="mb-1 font-sans text-[14px] font-medium text-[var(--ink)]">{s.label}</p>
            <p className="font-sans text-[12px] text-[var(--muted)]">{s.desc}</p>
          </div>
        ))}
      </div>
    </>
  );
}
