import { createFileRoute } from "@tanstack/react-router";
import { getInfraBanco } from "@/lib/founder-infra.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarBytes, formatarMs, formatarNumero } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/infra/banco")({
  component: Banco,
});

function Banco() {
  const { dados, carregando, erro } = useCarregar(() => getInfraBanco(), []);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o banco.</div>;
  const d = dados;
  const ativas = d?.conexoes.find((c) => c.estado === "active")?.n ?? 0;
  const ociosas = d?.conexoes.find((c) => c.estado === "idle")?.n ?? 0;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Foto do Postgres agora (`pg_database_size`, `pg_stat_activity`, `pg_stat_statements`). As
        consultas lentas incluem as do painel do Supabase e do próprio monitor; o que importa é ver
        se alguma consulta da Pólia aparece no topo.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Tamanho do banco"
          valor={d ? formatarBytes(d.tamanhoBytes) : null}
          carregando={carregando}
        />
        <StatCard
          label="Conexões"
          valor={d?.conexoesTotal}
          descricao={d ? `${ativas} ativas · ${ociosas} ociosas` : undefined}
          carregando={carregando}
        />
        <StatCard
          label="Tabelas maiores"
          valor={d?.tabelas.length}
          descricao="listadas abaixo"
          carregando={carregando}
        />
        <StatCard
          label="Consultas lentas"
          valor={d?.lentas.length}
          descricao="top por tempo médio"
          carregando={carregando}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Secao titulo="Tabelas por tamanho" carregando={carregando} className="lg:col-span-2">
          <BarraLista
            itens={(d?.tabelas ?? []).map((t) => ({
              rotulo: t.tabela,
              valor: t.bytes,
              detalhe: `~${formatarNumero(t.linhas)} linhas`,
            }))}
            formatar={formatarBytes}
            vazio="Sem tabelas."
          />
        </Secao>
        <Secao titulo="Conexões por estado" carregando={carregando}>
          <BarraLista
            itens={(d?.conexoes ?? []).map((c) => ({ rotulo: c.estado, valor: c.n }))}
            vazio="Sem conexões."
          />
        </Secao>
      </div>

      <Secao
        titulo="Consultas mais lentas (média)"
        carregando={carregando}
        semPadding
        altura="h-48"
      >
        {!d || d.lentas.length === 0 ? (
          <Vazio>pg_stat_statements sem consulta com mais de 20 chamadas.</Vazio>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Consulta</th>
                <th className={TH_CLASS}>Chamadas</th>
                <th className={TH_CLASS}>Média</th>
                <th className={TH_CLASS}>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.lentas.map((q, i) => (
                <tr key={i} className="border-b border-[var(--line)] last:border-0 align-top">
                  <td className="max-w-[560px] px-5 py-2.5 font-mono text-[11px] text-[var(--ink)] break-all">
                    {q.consulta}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarNumero(q.chamadas)}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarMs(q.mediaMs)}
                  </td>
                  <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarMs(q.totalMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>
    </>
  );
}
