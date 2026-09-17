import { createFileRoute } from "@tanstack/react-router";
import { getOperacaoIntegracoes } from "@/lib/founder-operacao.functions";
import { ALERTA_ERRO_CLASS, CARD_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarDataHoraBRT } from "@/lib/founder-formato";
import { EstadoPill, type Estado } from "@/components/founder/EstadoPill";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";
import { SkeletonBloco } from "@/components/Skeleton";

export const Route = createFileRoute("/founder/operacao/integracoes")({
  component: Integracoes,
});

function Integracoes() {
  const { dados, carregando, erro } = useCarregar(() => getOperacaoIntegracoes(), []);
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar as integrações.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Estado de cada serviço externo que a Pólia depende: último check do monitor, última
        sincronização real e falhas registradas nos últimos 7 dias.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {carregando || !d
          ? [0, 1, 2, 3].map((i) => <SkeletonBloco key={i} className="h-32 rounded-2xl" />)
          : d.integracoes.map((i) => (
              <div key={i.nome} className={`${CARD_CLASS} p-5`}>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="font-cabinet text-[18px] text-[var(--ink)]">{i.nome}</p>
                  <EstadoPill estado={i.status as Estado} />
                </div>
                {i.detalhe ? (
                  <p className="font-sans text-[13px] text-[var(--ink-soft)]">{i.detalhe}</p>
                ) : null}
                <p className="mt-2 font-sans text-[12px] text-[var(--muted)]">
                  Última sincronização: {formatarDataHoraBRT(i.ultimaSincronizacao)}
                  {i.falhas7d > 0 ? (
                    <span className="text-[var(--danger)]"> · {i.falhas7d} falha(s) em 7 dias</span>
                  ) : (
                    " · sem falhas em 7 dias"
                  )}
                </p>
                <p className="mt-1 font-sans text-[12px] text-[var(--muted)]">{i.extra}</p>
              </div>
            ))}
      </div>

      <Secao
        titulo="Falhas de integração (7 dias)"
        carregando={carregando}
        semPadding
        altura="h-32"
      >
        {!d || d.falhasRecentes.length === 0 ? (
          <Vazio>Nenhuma falha de integração registrada nos últimos 7 dias.</Vazio>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Quando</th>
                <th className={TH_CLASS}>Tipo</th>
                <th className={TH_CLASS}>Serviço</th>
                <th className={TH_CLASS}>Origem</th>
                <th className={TH_CLASS}>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {d.falhasRecentes.map((f, i) => (
                <tr
                  key={`${f.quando}-${i}`}
                  className="border-b border-[var(--line)] last:border-0"
                >
                  <td className="whitespace-nowrap px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                    {formatarDataHoraBRT(f.quando)}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink)]">{f.tipo}</td>
                  <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                    {f.servico ?? "—"}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                    {f.origem}
                  </td>
                  <td className="px-5 py-2.5 font-mono text-[11px] text-[var(--muted)]">
                    {f.detalhes}
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
