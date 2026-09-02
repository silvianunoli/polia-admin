import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { TOTAL_MODULOS } from "@/lib/planejamento-constants";
import { TOKEN_BRIDGE_V3 } from "@/lib/uiTokenBridge";

export const Route = createFileRoute("/painel")({
  head: () => ({ meta: [{ title: "Visão geral · Gestão Pólia" }] }),
  component: AdminHome,
});

type AlertaParada = {
  id: string;
  nome: string;
  modulo_atual: number;
  dias_parada: number;
  ultima_atividade: string;
};

function AdminHome() {
  const [stats, setStats] = useState({
    mod_m: 0,
    ativacao_d7: 0,
    mediana_modulo: 0,
    wau2: 0,
    retencao_d30: 0,
    total_cadastros: 0,
    lista_espera_total: 0,
  });
  const [alertasVermelhos, setAlertasVermelhos] = useState<AlertaParada[]>([]);
  const [saude, setSaude] = useState({ eventos24h: 0, erros24h: 0, latencia: 0 });
  const [censo, setCenso] = useState<{ label: string; valor: number }[]>([]);

  useEffect(() => {
    (async () => {
      const dias14 = new Date(Date.now() - 14 * 86400000).toISOString();
      const dias10 = new Date(Date.now() - 10 * 86400000).toISOString();
      const dias7 = new Date(Date.now() - 7 * 86400000).toISOString();
      const dias30 = new Date(Date.now() - 30 * 86400000).toISOString();
      const dias37 = new Date(Date.now() - 37 * 86400000).toISOString();

      const [
        { count: totalCadastros },
        { count: listaEspera },
        { data: profilesAtivos },
        { data: cadastrosD30 },
        { data: cohortD30 },
        { data: secoesFeitas },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("lista_espera").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("id,full_name,updated_at").gte("updated_at", dias14),
        supabase.from("profiles").select("id,created_at").gte("created_at", dias30),
        supabase
          .from("profiles")
          .select("id,updated_at")
          .gte("created_at", dias37)
          .lt("created_at", dias30),
        supabase
          .from("planejamento_secoes")
          .select("user_id,modulo,concluido_em")
          .eq("concluido", true),
      ]);

      const maxModuloPorUsuaria = new Map<string, number>();
      const primeiraConclusaoM1 = new Map<string, string>();
      (secoesFeitas ?? []).forEach((s: any) => {
        const atual = maxModuloPorUsuaria.get(s.user_id) ?? 0;
        if (s.modulo > atual) maxModuloPorUsuaria.set(s.user_id, s.modulo);
        if (s.modulo === 1) {
          const existente = primeiraConclusaoM1.get(s.user_id);
          if (!existente || s.concluido_em < existente) {
            primeiraConclusaoM1.set(s.user_id, s.concluido_em);
          }
        }
      });

      const wau2 = profilesAtivos?.length ?? 0;
      const modulosAtivas = (profilesAtivos ?? [])
        .map((p: any) => maxModuloPorUsuaria.get(p.id) ?? 0)
        .sort((a: number, b: number) => a - b);
      const medianaModulo = modulosAtivas.length
        ? modulosAtivas[Math.floor(modulosAtivas.length / 2)]
        : 0;

      const ativacaoNum = (cadastrosD30 ?? []).filter((p: any) => {
        const dataM1 = primeiraConclusaoM1.get(p.id);
        if (!dataM1) return false;
        return new Date(dataM1).getTime() - new Date(p.created_at).getTime() <= 7 * 86400000;
      }).length;
      const ativacaoD7 = cadastrosD30?.length
        ? Math.round((ativacaoNum / cadastrosD30.length) * 100)
        : 0;

      const retidas = (cohortD30 ?? []).filter((p: any) => p.updated_at >= dias7).length;
      const retencaoD30 = cohortD30?.length ? Math.round((retidas / cohortD30.length) * 100) : 0;

      const modM =
        wau2 > 0
          ? (profilesAtivos ?? []).reduce(
              (s: number, p: any) => s + (maxModuloPorUsuaria.get(p.id) ?? 0),
              0,
            ) / wau2
          : 0;

      const { data: paradas } = await supabase
        .from("profiles")
        .select("id,full_name,updated_at")
        .lt("updated_at", dias10)
        .order("updated_at", { ascending: true })
        .limit(30);

      const paradasComProgresso = (paradas ?? [])
        .map((p: any) => ({ ...p, modulo: maxModuloPorUsuaria.get(p.id) ?? 0 }))
        .filter((p: any) => p.modulo >= 1 && p.modulo < TOTAL_MODULOS)
        .slice(0, 5);

      setAlertasVermelhos(
        paradasComProgresso.map((p: any) => ({
          id: p.id,
          nome: p.full_name ?? "Sem nome",
          modulo_atual: p.modulo,
          dias_parada: Math.floor((Date.now() - new Date(p.updated_at).getTime()) / 86400000),
          ultima_atividade: new Date(p.updated_at).toLocaleDateString("pt-BR"),
        })),
      );

      setStats({
        mod_m: modM,
        ativacao_d7: ativacaoD7,
        mediana_modulo: medianaModulo,
        wau2,
        retencao_d30: retencaoD30,
        total_cadastros: totalCadastros ?? 0,
        lista_espera_total: listaEspera ?? 0,
      });

      const dias1 = new Date(Date.now() - 86400000).toISOString();
      const [
        { data: logs24 },
        { count: cTickets },
        { count: cFeedback },
        { count: cContatos },
        { count: cPosts },
        { count: cLogs },
      ] = await Promise.all([
        supabase
          .from("edge_function_logs")
          .select("latency_ms, error_message")
          .gte("created_at", dias1),
        supabase.from("tickets").select("*", { count: "exact", head: true }),
        supabase.from("feedback_responses").select("*", { count: "exact", head: true }),
        supabase.from("contatos").select("*", { count: "exact", head: true }),
        supabase.from("blog_posts").select("*", { count: "exact", head: true }),
        supabase.from("edge_function_logs").select("*", { count: "exact", head: true }),
      ]);
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
      setCenso([
        { label: "Usuárias", valor: totalCadastros ?? 0 },
        { label: "Chamados", valor: cTickets ?? 0 },
        { label: "Feedbacks", valor: cFeedback ?? 0 },
        { label: "Contatos", valor: cContatos ?? 0 },
        { label: "Posts", valor: cPosts ?? 0 },
        { label: "Eventos (log)", valor: cLogs ?? 0 },
      ]);
    })();
  }, []);

  const metricas: {
    label: string;
    sigla?: string;
    tooltip?: string;
    valor: string | number;
    ok: boolean;
    desc: string;
  }[] = [
    {
      label: "Ativação",
      sigla: "D7",
      tooltip: "em 7 dias depois do cadastro",
      valor: `${stats.ativacao_d7}%`,
      ok: stats.ativacao_d7 >= 40,
      desc: "concluiu M1 em 7 dias",
    },
    {
      label: "Mediana de Módulo",
      tooltip: "módulo onde metade das ativas está",
      valor: `M${stats.mediana_modulo}`,
      ok: true,
      desc: "onde metade das ativas está",
    },
    {
      label: "Ativas",
      sigla: "WAU-2",
      tooltip: "ativas nas últimas 2 semanas com ação real",
      valor: stats.wau2,
      ok: true,
      desc: "últ. 14 dias com ação real",
    },
    {
      label: "Retenção",
      sigla: "D30",
      tooltip: "de quem se cadastrou há ~30 dias, quantas seguem ativas",
      valor: `${stats.retencao_d30}%`,
      ok: stats.retencao_d30 >= 35,
      desc: "coorte de 30-37 dias atrás",
    },
    { label: "Total cadastros", valor: stats.total_cadastros, ok: true, desc: "desde o início" },
  ];

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mb-6 rounded-2xl bg-[var(--ink)] p-8">
        <p className="mb-2 flex items-center gap-1.5 font-sans text-[10px] font-semibold uppercase tracking-[2px] text-[var(--secondary)]">
          <span>NORTH STAR · MÓD-M</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="O que é MÓD-M"
                className="inline-flex min-h-[24px] min-w-[24px] items-center justify-center text-[var(--secondary)]/70 hover:text-[var(--secondary)]"
              >
                <HelpCircle size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent className="polia-v3" style={TOKEN_BRIDGE_V3}>
              módulos do Planejamento concluídos por usuária ativa
            </TooltipContent>
          </Tooltip>
        </p>
        <p className="font-cabinet mb-1 text-[56px] leading-none text-white">
          {stats.mod_m.toFixed(1)}
        </p>
        <p className="font-sans text-[14px] text-white/60">
          módulos concluídos por usuária ativa (14 dias) · meta: acima de 1
        </p>
        <div className="mt-4 h-2 w-full rounded-full bg-white/10">
          <div
            className="h-2 rounded-full bg-[var(--secondary)] transition-all"
            style={{ width: `${Math.min((stats.mod_m / TOTAL_MODULOS) * 100, 100)}%` }}
          />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        {metricas.map((item) => (
          <div key={item.label} className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="mb-2 flex items-center gap-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              <span>
                {item.label}
                {item.sigla ? ` ${item.sigla}` : ""}
              </span>
              {item.tooltip && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`O que é ${item.sigla ?? item.label}`}
                      className="inline-flex min-h-[20px] min-w-[20px] items-center justify-center text-[var(--muted)] hover:text-[var(--ink-soft)]"
                    >
                      <HelpCircle size={11} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="polia-v3" style={TOKEN_BRIDGE_V3}>
                    {item.tooltip}
                  </TooltipContent>
                </Tooltip>
              )}
            </p>
            <p
              className="font-cabinet mb-1 text-[32px] leading-none"
              style={{ color: item.ok ? "var(--secondary-text)" : "var(--danger)" }}
            >
              {item.valor}
            </p>
            <p className="font-sans text-[11px] text-[var(--muted)]">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 space-y-3">
        <p className="font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
          Atenção imediata
        </p>
        {alertasVermelhos.length === 0 ? (
          <div className="rounded-xl border border-[var(--secondary)]/30 bg-[var(--secondary-light)]/30 p-4">
            <p className="font-sans text-[13px] text-[var(--secondary-text)]">
              Nenhum alerta crítico no momento.
            </p>
          </div>
        ) : (
          alertasVermelhos.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between rounded-xl border border-[var(--danger)]/25 bg-[var(--danger-soft)] p-4"
            >
              <div>
                <p className="font-sans text-[13px] font-medium text-[var(--danger)]">
                  {u.nome} · parada há {u.dias_parada} dias no Módulo {u.modulo_atual}
                </p>
                <p className="font-sans text-[12px] text-[var(--ink-soft)]">
                  última atividade: {u.ultima_atividade}
                </p>
              </div>
              <Link
                to="/usuarios/$id"
                params={{ id: u.id }}
                className="font-sans text-[12px] text-[var(--secondary-text)] hover:underline"
              >
                Ver perfil →
              </Link>
            </div>
          ))
        )}
      </div>

      <p className="mb-3 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
        Saúde do sistema · 24h
      </p>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Eventos", valor: String(saude.eventos24h), cor: "var(--ink)" },
          {
            label: "Erros",
            valor: String(saude.erros24h),
            cor: saude.erros24h > 0 ? "var(--danger)" : "var(--secondary-text)",
          },
          { label: "Latência média", valor: `${saude.latencia} ms`, cor: "var(--ink)" },
        ].map((m) => (
          <div key={m.label} className="rounded-2xl border border-[var(--line)] bg-white p-5">
            <p className="mb-2 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              {m.label}
            </p>
            <p className="font-cabinet text-[32px] leading-none" style={{ color: m.cor }}>
              {m.valor}
            </p>
          </div>
        ))}
      </div>

      <div className="mb-6 rounded-2xl border border-[var(--line)] bg-white p-6">
        <p className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[2px] text-[var(--muted)]">
          Censo de dados
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {censo.map((c) => (
            <div key={c.label}>
              <p className="font-cabinet text-[28px] leading-none text-[var(--ink)]">{c.valor}</p>
              <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">{c.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--line)] bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-[1.5px] text-[var(--muted)]">
              Lista de espera
            </p>
            <p className="font-cabinet text-[32px] text-[var(--ink)]">{stats.lista_espera_total}</p>
          </div>
          <Link
            to="/crm"
            className="font-sans text-[13px] text-[var(--secondary-text)] hover:underline"
          >
            Gerenciar →
          </Link>
        </div>
      </div>
    </TooltipProvider>
  );
}
