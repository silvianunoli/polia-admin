import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

// Registrado como functionMiddleware global em src/start.ts — sem isso, o
// browser nunca anexa o bearer token nas chamadas de serverFn.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
);
