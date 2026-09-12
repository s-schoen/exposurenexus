import type { WorkerDatabase } from "./worker.js";
import type { BackendRuntime } from "@exposurenexus/backend";
import type { Logger } from "pino";

export function openWorkerDatabase<Database extends { destroy(): Promise<void> }>(
  url: string,
  logger: Logger,
  factories: {
    createPostgresDatabase(url: string): {
      database: Database;
      pool: {
        on(event: "error", listener: () => void): unknown;
        query(sql: string): Promise<unknown>;
      };
    };
    checkDatabaseMigrations(database: Database): Promise<void>;
    createBackendRuntime(options: { database: Database; logger: Logger }): BackendRuntime;
  },
): WorkerDatabase {
  const { database, pool } = factories.createPostgresDatabase(url);
  pool.on("error", () => logger.error("worker database connection error"));
  return {
    async check() {
      await pool.query("select 1");
      try {
        await factories.checkDatabaseMigrations(database);
      } catch {
        logger.error("worker migration verification failed; ensure API migrations have completed");
        throw new Error("Worker database migration verification failed");
      }
    },
    createRuntime: () => factories.createBackendRuntime({ database, logger }),
    // Kysely owns and closes the pool; do not call pool.end() twice.
    close: () => database.destroy(),
  };
}
