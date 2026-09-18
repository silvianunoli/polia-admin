import { defineConfig } from "vitest/config";
import path from "node:path";

// Config de teste isolada do vite.config.ts, que envolve o wrapper
// @lovable.dev/vite-tanstack-config (tanstackStart + cloudflare) e não foi
// pensado pra rodar sob Vitest. Mesmo desenho do polia-app.
//
// Aqui é bem mais enxuto que lá: o que este repo testa hoje é a casca de
// e-mail, função pura que devolve string. Sem jsdom, sem React, sem setup.
// Se um dia entrar teste de componente, aí sim copia o resto da config do app.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
  },
});
