import { Link } from "@tanstack/react-router";
import { TH_CLASS } from "@/lib/botoes";
import { formatarDataHoraBRT, nomePlano } from "@/lib/founder-formato";

export interface UsuariaLinha {
  id: string;
  nome: string;
  plano: string | null;
  pagante: boolean;
  ultimoAcesso: string | null;
  diasAtivos: number;
  sessoes: number;
}

// Drill-down comum: toda lista de usuárias do /founder (segmentos, funil,
// analytics) desemboca aqui e daqui vai pro perfil individual.
export function TabelaUsuarias({
  usuarias,
  vazio = "Ninguém nesse grupo no período.",
  limite = 50,
}: {
  usuarias: UsuariaLinha[];
  vazio?: string;
  limite?: number;
}) {
  if (usuarias.length === 0) {
    return <p className="p-5 font-sans text-[13px] text-[var(--muted)]">{vazio}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-[var(--line)]">
          <tr>
            <th className={TH_CLASS}>Usuária</th>
            <th className={TH_CLASS}>Plano</th>
            <th className={TH_CLASS}>Último acesso</th>
            <th className={TH_CLASS}>Dias ativos</th>
            <th className={TH_CLASS}>Sessões</th>
          </tr>
        </thead>
        <tbody>
          {usuarias.slice(0, limite).map((u) => (
            <tr key={u.id} className="border-b border-[var(--line)] last:border-0">
              <td className="px-5 py-2.5">
                <Link
                  to="/founder/analytics/usuarias/$id"
                  params={{ id: u.id }}
                  search={(prev) => prev}
                  className="font-sans text-[13px] text-[var(--ink)] no-underline hover:underline"
                >
                  {u.nome}
                </Link>
              </td>
              <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--ink-soft)]">
                {nomePlano(u.plano)}
                {u.pagante ? " · paga" : ""}
              </td>
              <td className="px-5 py-2.5 font-sans text-[12px] text-[var(--muted)]">
                {formatarDataHoraBRT(u.ultimoAcesso)}
              </td>
              <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                {u.diasAtivos}
              </td>
              <td className="px-5 py-2.5 font-mono text-[12px] text-[var(--ink-soft)]">
                {u.sessoes}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {usuarias.length > limite && (
        <p className="px-5 py-3 font-sans text-[12px] text-[var(--muted)]">
          e mais {usuarias.length - limite}.
        </p>
      )}
    </div>
  );
}
