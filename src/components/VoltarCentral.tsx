import { Link } from "@tanstack/react-router";

// Link de volta pra quem chega numa página que não tem mais Sidebar (ver
// semSidebar em __root.tsx) -- mesma linha que existia dentro do Nav.tsx.
export function VoltarCentral() {
  return (
    <Link
      to="/central"
      className="mb-6 inline-block font-cabinet text-[15px] text-[var(--ink)] no-underline hover:underline"
    >
      ← Central · Gestão Pólia
    </Link>
  );
}
