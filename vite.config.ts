// Mesmo padrão do polia-app (produto): @lovable.dev/vite-tanstack-config já
// inclui tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare
// (build-only) — não adicionar de novo, duplica plugin.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    cloudflare: {
      wrangler: {
        assets: {
          not_found_handling: "single-page-application",
          run_worker_first: true,
        },
      },
    } as { nodeCompat?: boolean; deployConfig?: boolean },
  },
});
