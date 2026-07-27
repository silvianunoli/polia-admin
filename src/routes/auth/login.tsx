import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  next: z.string().optional(),
  motivo: z.enum(["sem-acesso"]).optional(),
});

export const Route = createFileRoute("/auth/login")({
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Entrar · Gestão Pólia" }] }),
  component: LoginPage,
});

function LoginPage() {
  const { next, motivo } = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setLoading(false);
    if (error) {
      toast.error("E-mail ou senha errados.");
      return;
    }
    window.location.href = next && next.startsWith("/") ? next : "/central";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-[380px] rounded-2xl border border-[var(--line)] bg-white p-8"
      >
        <h1 className="mb-1 font-cabinet text-[24px] text-[var(--ink)]">Gestão Pólia</h1>
        <p className="mb-6 text-[13px] text-[var(--muted)]">Área interna, acesso restrito.</p>

        {motivo === "sem-acesso" && (
          <p className="mb-4 rounded-lg bg-[var(--danger-soft)] p-3 text-[13px] text-[var(--danger)]">
            Essa conta não tem acesso à área de gestão.
          </p>
        )}

        <label className="mb-3 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--ink-soft)]">E-mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-lg border border-[var(--line)] px-3 text-[14px]"
          />
        </label>
        <label className="mb-6 flex flex-col gap-1.5">
          <span className="text-[12px] font-medium text-[var(--ink-soft)]">Senha</span>
          <input
            type="password"
            required
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            className="h-11 rounded-lg border border-[var(--line)] px-3 text-[14px]"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-lg bg-[var(--secondary)] text-[14px] font-semibold text-[var(--secondary-ink)] disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
