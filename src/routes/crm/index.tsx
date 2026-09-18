import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCcw, Cake, Users, Handshake, Mail, TrendingUp } from "lucide-react";
import { resumoCrm, sincronizarFontes, type ResumoCrm } from "@/lib/crm.functions";
import { toastErro, toastSucesso } from "@/lib/toast";
import {
  btnOutline,
  cardClass,
  formatarData,
  formatarReais,
  linkWhatsApp,
  STATUS_META,
} from "@/lib/crm-ui";

export const Route = createFileRoute("/crm/")({
  head: () => ({ meta: [{ title: "Visão geral · CRM Pólia" }] }),
  component: CrmVisaoGeral,
});

function CrmVisaoGeral() {
  const [resumo, setResumo] = useState<ResumoCrm | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      setResumo(await resumoCrm());
    } catch {
      toastErro("Não carregou o resumo do CRM.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSincronizar() {
    setSincronizando(true);
    try {
      const r = await sincronizarFontes();
      toastSucesso(
        r.criados > 0
          ? `${r.criados} contato(s) novo(s) vieram das iscas e do app.`
          : "Nada novo pra importar. Tudo já estava aqui.",
      );
      carregar();
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "A importação falhou.");
    } finally {
      setSincronizando(false);
    }
  }

  if (carregando && !resumo) {
    return <p className="font-sans text-[14px] text-[var(--muted)]">Carregando...</p>;
  }
  if (!resumo) return null;

  const taxaFechamento =
    resumo.negociosAbertos.quantidade + resumo.fechadoNoMes.quantidade > 0
      ? Math.round(
          (resumo.fechadoNoMes.quantidade /
            (resumo.negociosAbertos.quantidade + resumo.fechadoNoMes.quantidade)) *
            100,
        )
      : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-[14px] text-[var(--muted)]">
          {resumo.total} pessoa(s) no CRM. {resumo.novos7d} chegaram nos últimos 7 dias.
        </p>
        <button
          type="button"
          onClick={handleSincronizar}
          disabled={sincronizando}
          className={`inline-flex items-center gap-2 ${btnOutline}`}
        >
          <RefreshCcw size={14} />
          {sincronizando ? "Importando..." : "Puxar das iscas e do app"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Cartao
          icone={<Users size={16} />}
          rotulo="Em conversa"
          valor={String(resumo.porStatus.conversando ?? 0)}
          nota={`${resumo.porStatus.lead ?? 0} lead(s) ainda sem contato`}
        />
        <Cartao
          icone={<Handshake size={16} />}
          rotulo="Negociações abertas"
          valor={formatarReais(resumo.negociosAbertos.valor)}
          nota={`${resumo.negociosAbertos.quantidade} em aberto`}
        />
        <Cartao
          icone={<TrendingUp size={16} />}
          rotulo="Fechou este mês"
          valor={formatarReais(resumo.fechadoNoMes.valor)}
          nota={
            taxaFechamento > 0
              ? `${resumo.fechadoNoMes.quantidade} negociação(ões), ${taxaFechamento}% do que estava na mesa`
              : "Nada fechado ainda neste mês"
          }
        />
        <Cartao
          icone={<Mail size={16} />}
          rotulo="Podem receber campanha"
          valor={String(resumo.contatosMarketing)}
          nota="Com consentimento e sem descadastro"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className={cardClass}>
          <div className="border-b border-[var(--line)] px-5 py-4">
            <h2 className="font-cabinet text-[18px] text-[var(--ink)]">Vencido e pra hoje</h2>
            <p className="mt-0.5 font-sans text-[12px] text-[var(--muted)]">
              {resumo.followupsVencidos.length === 0
                ? "Sem pendência. Raro e bom."
                : `${resumo.followupsVencidos.length} lembrete(s) esperando, ${resumo.followupsHoje} pra hoje.`}
            </p>
          </div>
          <ul className="divide-y divide-[var(--line)]">
            {resumo.followupsVencidos.slice(0, 8).map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate font-sans text-[14px] text-[var(--ink)]">{t.titulo}</p>
                  <p className="font-sans text-[12px] text-[var(--muted)]">
                    {t.contato ? `${t.contato} · ` : ""}
                    {formatarData(t.prazo)}
                  </p>
                </div>
                {t.contato_id && (
                  <Link
                    to="/crm/contatos/$id"
                    params={{ id: t.contato_id }}
                    className="shrink-0 font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
                  >
                    Abrir
                  </Link>
                )}
              </li>
            ))}
            {resumo.followupsVencidos.length === 0 && (
              <li className="px-5 py-6 font-sans text-[13px] text-[var(--muted)]">
                Nenhum lembrete vencido.
              </li>
            )}
          </ul>
          <div className="border-t border-[var(--line)] px-5 py-3">
            <Link
              to="/crm/tarefas"
              className="font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
            >
              Ver todos os lembretes
            </Link>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section className={cardClass}>
            <div className="border-b border-[var(--line)] px-5 py-4">
              <h2 className="font-cabinet text-[18px] text-[var(--ink)]">Como estão divididas</h2>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {Object.entries(resumo.porStatus).map(([chave, qtd]) => (
                <Link
                  key={chave}
                  to="/crm/contatos"
                  search={{ status: chave }}
                  className={`rounded-full px-3 py-1.5 font-sans text-[13px] no-underline ${
                    STATUS_META[chave]?.className ?? "bg-[var(--line)] text-[var(--ink-soft)]"
                  }`}
                >
                  {STATUS_META[chave]?.label ?? chave} · {qtd}
                </Link>
              ))}
            </div>
            <p className="border-t border-[var(--line)] px-5 py-3 font-sans text-[12px] text-[var(--muted)]">
              {resumo.semContato30d} pessoa(s) sem nenhum contato há mais de 30 dias.
            </p>
          </section>

          <section className={cardClass}>
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-4">
              <Cake size={16} className="text-[var(--muted)]" />
              <h2 className="font-cabinet text-[18px] text-[var(--ink)]">Aniversário hoje</h2>
            </div>
            <ul className="divide-y divide-[var(--line)]">
              {resumo.aniversariantesHoje.map((a) => {
                const wa = linkWhatsApp(
                  a.telefone,
                  `Oi, ${a.nome.split(" ")[0]}. Feliz aniversário.`,
                );
                return (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link
                      to="/crm/contatos/$id"
                      params={{ id: a.id }}
                      className="font-sans text-[14px] text-[var(--ink)] no-underline hover:underline"
                    >
                      {a.nome}
                    </Link>
                    {wa && (
                      <a
                        href={wa}
                        target="_blank"
                        rel="noreferrer"
                        className="font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
                      >
                        Mandar mensagem
                      </a>
                    )}
                  </li>
                );
              })}
              {resumo.aniversariantesHoje.length === 0 && (
                <li className="px-5 py-6 font-sans text-[13px] text-[var(--muted)]">
                  Ninguém faz aniversário hoje.
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>

      <section className={cardClass}>
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <h2 className="font-cabinet text-[18px] text-[var(--ink)]">Últimas campanhas</h2>
          <Link
            to="/crm/campanhas"
            className="font-sans text-[13px] text-[var(--secondary-text)] no-underline hover:underline"
          >
            Ver todas
          </Link>
        </div>
        <ul className="divide-y divide-[var(--line)]">
          {resumo.ultimasCampanhas.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <Link
                to="/crm/campanhas/$id"
                params={{ id: c.id }}
                className="min-w-0 truncate font-sans text-[14px] text-[var(--ink)] no-underline hover:underline"
              >
                {c.nome}
              </Link>
              <span className="shrink-0 font-sans text-[12px] text-[var(--muted)]">
                {c.status === "enviada"
                  ? `${c.destinatarios} destinatária(s) · ${formatarData(c.enviada_em)}`
                  : c.status}
              </span>
            </li>
          ))}
          {resumo.ultimasCampanhas.length === 0 && (
            <li className="px-5 py-6 font-sans text-[13px] text-[var(--muted)]">
              Nenhuma campanha criada ainda.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}

function Cartao(props: { icone: React.ReactNode; rotulo: string; valor: string; nota: string }) {
  return (
    <div className={`${cardClass} px-5 py-4`}>
      <div className="flex items-center gap-2 text-[var(--muted)]">
        {props.icone}
        <span className="font-accent text-[10px] font-bold uppercase tracking-[1.5px]">
          {props.rotulo}
        </span>
      </div>
      <p className="mt-2 font-cabinet text-[28px] leading-none text-[var(--ink)]">{props.valor}</p>
      <p className="mt-2 font-sans text-[12px] text-[var(--muted)]">{props.nota}</p>
    </div>
  );
}
