import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTurnstile } from "@/hooks/useTurnstile";
import { useCaptchaPronto } from "@/hooks/useCaptchaPronto";

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
  // Anti-robô: o Supabase Auth (projeto "Pólia", o mesmo do produto) está com a
  // proteção de captcha ligada desde 09/10/2026. Sem token, todo login volta
  // captcha_failed, e a tela dizia "senha errada". Mesmo widget do polia-app.
  const ts = useTurnstile();
  const [tentativas, setTentativas] = useState(0);
  const captchaPronto = useCaptchaPronto({ token: ts.token, pedidoDeReset: tentativas });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
      options: { captchaToken: ts.token ?? undefined },
    });
    setLoading(false);
    if (error) {
      // Token é de uso único: cada tentativa pede um novo.
      ts.reset();
      setTentativas((n) => n + 1);
      const ehCaptcha = error.code === "captcha_failed" || /captcha/i.test(error.message ?? "");
      toast.error(
        ehCaptcha
          ? "Confirma que não é um robô e tenta de novo. Se a verificação não aparecer, desativa o bloqueador de anúncios e recarrega a página."
          : "E-mail ou senha errados.",
      );
      return;
    }
    // "/" não conta como destino de verdade — quem chegou aqui a partir da
    // raiz (sem estar logada) deve cair em /central, não pular direto pro
    // admin. Só preserva "next" quando é um link interno de fato (ex.: sessão
    // expirou em /crm e queremos voltar exatamente pra lá).
    const temDestinoReal = next && next.startsWith("/") && next !== "/";
    window.location.href = temDestinoReal ? next : "/central";
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
        <div ref={ts.containerRef} className="mb-4" />
        <button
          type="submit"
          disabled={loading || !captchaPronto}
          className="h-11 w-full rounded-lg bg-[var(--secondary)] text-[14px] font-semibold text-[var(--secondary-ink)] disabled:opacity-60"
        >
          {loading ? "Entrando..." : !captchaPronto ? "Verificando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
