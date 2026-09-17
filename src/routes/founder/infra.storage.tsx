import { createFileRoute, useSearch } from "@tanstack/react-router";
import { getInfraStorage } from "@/lib/founder-infra.functions";
import { ALERTA_ERRO_CLASS, TH_CLASS } from "@/lib/botoes";
import { formatarBytes, formatarDataHoraBRT, formatarNumero } from "@/lib/founder-formato";
import { StatCard } from "@/components/founder/StatCard";
import { EstadoPill, type Estado } from "@/components/founder/EstadoPill";
import { Secao, Vazio } from "@/components/founder/Secao";
import { useCarregar } from "@/components/founder/useCarregar";

export const Route = createFileRoute("/founder/infra/storage")({
  component: Storage,
});

function Storage() {
  const search = useSearch({ from: "/founder" });
  const { dados, carregando, erro } = useCarregar(
    () => getInfraStorage({ data: search }),
    [search],
  );
  if (erro) return <div className={ALERTA_ERRO_CLASS}>Não consegui carregar o storage.</div>;
  const d = dados;

  return (
    <>
      <p className="mb-6 font-sans text-[14px] text-[var(--muted)]">
        Buckets do Supabase Storage: objetos, espaço e quantos arquivos entraram no período. O check
        de storage do monitor (lista de buckets) aparece como estado.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Espaço usado"
          valor={d ? formatarBytes(d.totalBytes) : null}
          carregando={carregando}
        />
        <StatCard
          label="Objetos"
          valor={d ? formatarNumero(d.totalObjetos) : null}
          carregando={carregando}
        />
        <StatCard
          label="Novos no período"
          valor={d ? formatarNumero(d.buckets.reduce((s, b) => s + b.novosNoPeriodo, 0)) : null}
          descricao={d?.periodo.rotulo}
          carregando={carregando}
        />
        <StatCard
          label="Checks críticos"
          valor={d?.errosCheck}
          descricao="nos últimos 50 checks"
          carregando={carregando}
          invertido
        />
      </div>

      <Secao
        titulo="Buckets"
        carregando={carregando}
        semPadding
        altura="h-32"
        acao={
          d?.ultimoCheck ? (
            <EstadoPill
              estado={d.ultimoCheck.status as Estado}
              texto={`${d.ultimoCheck.status} · ${formatarDataHoraBRT(d.ultimoCheck.checado_em)}`}
            />
          ) : null
        }
      >
        {!d || d.buckets.length === 0 ? (
          <Vazio>Nenhum bucket.</Vazio>
        ) : (
          <table className="w-full">
            <thead className="border-b border-[var(--line)]">
              <tr>
                <th className={TH_CLASS}>Bucket</th>
                <th className={TH_CLASS}>Acesso</th>
                <th className={TH_CLASS}>Objetos</th>
                <th className={TH_CLASS}>Espaço</th>
                <th className={TH_CLASS}>Novos no período</th>
              </tr>
            </thead>
            <tbody>
              {d.buckets.map((b) => (
                <tr key={b.bucket} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-5 py-3 font-mono text-[13px] text-[var(--ink)]">{b.bucket}</td>
                  <td className="px-5 py-3 font-sans text-[12px] text-[var(--ink-soft)]">
                    {b.publico ? "público" : "privado"}
                  </td>
                  <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarNumero(b.objetos)}
                  </td>
                  <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarBytes(b.bytes)}
                  </td>
                  <td className="px-5 py-3 font-sans text-[13px] text-[var(--ink-soft)]">
                    {formatarNumero(b.novosNoPeriodo)}
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
