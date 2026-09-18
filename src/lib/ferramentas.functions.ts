import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/founder-auth.server";
import { FERRAMENTAS_SETUP } from "./ferramentas-setup";

// O runbook é servido por RPC autenticado, nunca importado direto pela
// página: importar no componente joga o texto inteiro no bundle do client,
// que a Cloudflare entrega como asset estático sem passar pelo guard de auth
// (client-side, via __root.tsx) -- a mesma classe de exposição que o GRW-05
// achou e que os boards em boards.functions.ts já evitam. Não tem chave
// nenhuma aqui, mas tem a planta da operação: ids de projeto, nomes de
// secret, e o que ainda está frágil em cada integração.
export const buscarFerramentasSetup = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    return FERRAMENTAS_SETUP;
  });
