// O que as automações guardaram no contato (crm_contatos.campos), como as respostas do FALA.
// "marca_instagram" aparece como "Marca instagram" só pra leitura; a chave no banco não muda.
export function Respostas({ campos }: { campos: Record<string, unknown> | null | undefined }) {
  const itens = Object.entries(campos ?? {}).filter(
    ([, v]) => (typeof v === "string" && v.trim()) || typeof v === "number",
  );
  if (itens.length === 0) return null;
  return (
    <section aria-label="Respostas guardadas">
      <p className="mb-2 font-accent text-[10px] font-bold uppercase tracking-[1.5px] text-[var(--muted)]">
        Respostas
      </p>
      <dl className="flex flex-col gap-2 font-sans text-[13px]">
        {itens.map(([chave, valor]) => (
          <div key={chave}>
            <dt className="text-[var(--muted)]">
              {chave.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
            </dt>
            <dd className="whitespace-pre-wrap text-[var(--ink)]">{String(valor)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
