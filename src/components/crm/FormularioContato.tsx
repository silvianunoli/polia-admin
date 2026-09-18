import { useState, type FormEvent } from "react";
import { salvarContato, STATUS_CONTATO, type Contato } from "@/lib/crm.functions";
import { toastErro, toastSucesso } from "@/lib/toast";
import {
  btnOutline,
  btnPrimary,
  cardClass,
  inputClass,
  labelClass,
  STATUS_META,
} from "@/lib/crm-ui";

export function FormularioContato(props: {
  contato?: Contato;
  onSalvo: (id: string) => void;
  onCancelar: () => void;
}) {
  const c = props.contato;
  const [nome, setNome] = useState(c?.nome ?? "");
  const [email, setEmail] = useState(c?.email ?? "");
  const [telefone, setTelefone] = useState(c?.telefone ?? "");
  const [instagram, setInstagram] = useState(c?.instagram ?? "");
  const [negocio, setNegocio] = useState(c?.negocio ?? "");
  const [tipoNegocio, setTipoNegocio] = useState(c?.tipo_negocio ?? "");
  const [cidade, setCidade] = useState(c?.cidade ?? "");
  const [status, setStatus] = useState(c?.status ?? "lead");
  const [tags, setTags] = useState((c?.tags ?? []).join(", "));
  const [aniversario, setAniversario] = useState(c?.aniversario ?? "");
  const [observacoes, setObservacoes] = useState(c?.observacoes ?? "");
  const [consent, setConsent] = useState(c?.consent_marketing ?? false);
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    try {
      const r = await salvarContato({
        data: {
          ...(c ? { id: c.id } : {}),
          nome,
          email,
          telefone,
          instagram,
          negocio,
          tipo_negocio: tipoNegocio,
          cidade,
          origem: c?.origem ?? "manual",
          status: status as (typeof STATUS_CONTATO)[number],
          tags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          aniversario,
          observacoes,
          consent_marketing: consent,
          proximo_followup: c?.proximo_followup ?? "",
        },
      });
      toastSucesso(c ? "Contato atualizado." : "Contato criado.");
      props.onSalvo(r.id);
    } catch (err) {
      toastErro(err instanceof Error ? err.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={`${cardClass} p-5`}>
      <h2 className="mb-4 font-cabinet text-[20px] text-[var(--ink)]">
        {c ? "Editar contato" : "Novo contato"}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className={labelClass}>Nome</span>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            required
            maxLength={160}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>WhatsApp com DDD</span>
          <input
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            placeholder="(11) 99999-9999"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Negócio</span>
          <input
            value={negocio}
            onChange={(e) => setNegocio(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Tipo de negócio</span>
          <input
            value={tipoNegocio}
            onChange={(e) => setTipoNegocio(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Instagram</span>
          <input
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="@perfil"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Cidade</span>
          <input
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Onde está</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className={inputClass}
          >
            {STATUS_CONTATO.map((s) => (
              <option key={s} value={s}>
                {STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>Aniversário</span>
          <input
            type="date"
            value={aniversario}
            onChange={(e) => setAniversario(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className={labelClass}>Marcadores, separados por vírgula</span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="parceria, indicou alguém, quer o Pro"
            className={inputClass}
          />
        </label>
        <label className="block sm:col-span-2 lg:col-span-3">
          <span className={labelClass}>Observações</span>
          <textarea
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-4 flex items-start gap-2">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-1 accent-[var(--secondary)]"
        />
        <span className="font-sans text-[13px] text-[var(--ink-soft)]">
          Autorizou receber e-mail da Pólia.
          <span className="block font-sans text-[12px] text-[var(--muted)]">
            Sem isso ela fica fora de qualquer campanha, mesmo que o filtro da lista a alcance.
          </span>
        </span>
      </label>

      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={salvando} className={btnPrimary}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>
        <button type="button" onClick={props.onCancelar} className={btnOutline}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
