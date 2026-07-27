import { renderErrorPage } from "./lib/error-page";

function respostaHealth(): Response {
  return new Response(JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m as { default?: ServerEntry }).default ?? (m as unknown as ServerEntry),
    );
  }
  return serverEntryPromise;
}

function brandedErrorResponse(): Response {
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    const url = new URL(request.url);
    if (url.pathname === "/health") return respostaHealth();

    try {
      const handler = await getServerEntry();
      return await handler.fetch(request, env, ctx);
    } catch (error) {
      console.error(error);
      return brandedErrorResponse();
    }
  },
};
