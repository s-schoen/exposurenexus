import type { Logger } from "pino";

interface CloseableServer {
  close(callback: (error?: Error) => void): void;
}

interface CloseablePool {
  end(): Promise<void>;
}

export function createApiShutdown(
  server: CloseableServer,
  pool: CloseablePool,
  logger: Logger,
): (signal: NodeJS.Signals) => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;

  return (signal) => {
    shutdownPromise ??= (async () => {
      logger.info({ signal }, "shutting down API");
      try {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      } finally {
        await pool.end();
      }
    })();

    return shutdownPromise;
  };
}
