import { serve } from "@hono/node-server";

export interface ApiHttp {
  ready: Promise<void>;
  close(): Promise<void>;
}

export function openHttp({
  fetch,
  port,
  importUploadTimeoutMs,
  onError,
}: {
  fetch: Parameters<typeof serve>[0]["fetch"];
  port: number;
  importUploadTimeoutMs: number;
  onError: () => void;
}): ApiHttp {
  const ready = Promise.withResolvers<void>();
  const server = serve(
    {
      fetch,
      port,
      // Header receipt precedes the application deadline; allow Node's default 60s header budget.
      serverOptions: { requestTimeout: importUploadTimeoutMs + 60_000 },
    },
    () => ready.resolve(),
  );
  server.on("error", () => {
    ready.reject(new Error("HTTP server failed"));
    onError();
  });
  return {
    ready: ready.promise,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error?: NodeJS.ErrnoException) => {
          // A failed bind never started listening, but is still an owned server.
          if (error && error.code !== "ERR_SERVER_NOT_RUNNING") reject(error);
          else resolve();
        });
      }),
  };
}
