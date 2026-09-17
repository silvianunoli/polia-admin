import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { getOperacaoErros } from "@/lib/founder-operacao.functions";
import { ALERTA_ERRO_CLASS, BTN_LINK, TH_CLASS } from "@/lib/botoes";
import { formatarDataHoraBRT } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { BarraLista, BarrasDiarias } from "@/components/founder/Graficos";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/operacao/erros")({
  component: Erros,
});

function Erros() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getOperacaoErros({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar os erros.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Erros capturados pelo app em produção (client e server), da tabela{" "}
        <code className="font-mono text-[12px]">erros_app</code>. Agrupados por origem, página e
        mensagem pra achar o padrão antes do caso.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Erros"
          valor={d?.total}
          variacaoPct={d?.variacao}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
          invertido
        />
        <StatCard
          label="Usuárias afetadas"
          valor={d?.usuariasAfetadas}
          descricao="com erro atribuído"
          carregando={carregando}
          invertido
        />
        <StatCard
          label="Origens"
          valor={d?.porOrigem.length}
          descricao="client, server, edge…"
          carregando={carregando}
        />
        <StatCard
          label="Páginas com erro"
          valor={d?.porPagina.length}
          descricao="distintas"
          carregando={carregando}
        />
      </div>

      <Secao titulo="Erros por dia" carregando={carregando} className="mb-6">
        {d && d.serie.some((p) => p.valor > 0) ? (
          <BarrasDiarias pontos={d.serie} />
        ) : (
          <p className="font-sans text-[13px] text-[var(--muted)]">Nenhum erro no período.</p>
        )}
      </Secao>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Secao titulo="Por origem" carregando={carregando}>
          <BarraLista itens={d?.porOrigem ?? []} vazio="Nenhum erro no período." />
        </Secao>
        <Secao titulo="Por página" carregando={carregando}>
          <BarraLista itens={d?.porPagina ?? []} vazio="Nenhum erro no período." />
        </Secao>
        <Secao titulo="Mensagens mais comuns" carregando={carregando}>
          <BarraLista itens={d?.porMensagem ?? []} vazio="Nenhum erro no período." />
        </Secao>
      </div>

      <Secao titulo="Erros recentes" carregando={carregando} semPadding altura="h-48">
        {!d || d.recentes.length === 0 ? (
          <Vazio>Nenhum erro no período.</Vazio>
        ) : (
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full">
              <thead className="border-b border-[var(--line)]">
                <tr>
                  <th className={TH_CLASS}>Quando</th>
                  <th className={TH_CLASS}>Origem</th>
                  <th className={TH_CLASS}>Página</th>
                  <th className={TH_CLASS}>Mensagem</th>
                  <th className={TH_CLASS}>Usuária</th>
                </tr>
              </thead>
              <tbody>
                {d.recentes.map((e) => (
                  <tr key={e.id} className="border-b border-[var(--line)] last:border-0">
                    <td className="whitespace-nowrap px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                      {formatarDataHoraBRT(e.quando)}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                      {e.origem}
                    </td>
                    <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                      {e.pagina ?? "—"}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[13px] text-[var(--ink)]">
                      {e.mensagem}
                    </td>
                    <td className="px-5 py-2.5 font-sans text-[12px]">
                      {e.userId ? (
                        <Link
                          to="/founder/analytics/usuarias/$id"
                          params={{ id: e.userId }}
                          search={(prev) => prev}
                          className={`${BTN_LINK} text-[12px]`}
                        >
                          ver perfil
                        </Link>
                      ) : (
                        <span className="text-[var(--muted)]">anônima</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </>
  );
}
