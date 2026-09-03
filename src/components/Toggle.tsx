// Interruptor liga/desliga -- estava duplicado byte a byte em alertas.tsx e
// flags.tsx antes desta extração (achado na auditoria de design system,
// 03/09). `label` é o nome da coisa sendo ligada/desligada (ex: "a regra
// Fricção do checkout", "a flag novo-onboarding"), pro aria-label ficar
// completo sem cada tela ter que montar a frase.
export function Toggle({
  ligado,
  onChange,
  label,
}: {
  ligado: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative h-6 w-12 shrink-0 cursor-pointer rounded-full transition-all hover:opacity-80"
      style={{ backgroundColor: ligado ? "var(--secondary)" : "var(--line)" }}
      aria-label={`${ligado ? "Desligar" : "Ligar"} ${label}`}
      aria-pressed={ligado}
    >
      <span
        className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${ligado ? "translate-x-7" : "translate-x-1"}`}
      />
    </button>
  );
}
