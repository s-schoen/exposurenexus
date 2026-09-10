import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, it } from "vitest";

it("really exits nonzero at the deadline even with live handles and permanently pending shutdown", async () => {
  const workerUrl = new URL("./worker.ts", import.meta.url).href;
  const envUrl = new URL("./env.ts", import.meta.url).href;
  const loggingUrl = new URL("./logging.ts", import.meta.url).href;
  const script = `
    import { runWorker } from ${JSON.stringify(workerUrl)};
    import { readConfig } from ${JSON.stringify(envUrl)};
    import { createLogger } from ${JSON.stringify(loggingUrl)};
    const config = readConfig({
      DATABASE_URL: 'postgres://localhost/db', RABBITMQ_URL: 'amqp://localhost',
      SHUTDOWN_TIMEOUT_MS: '20'
    });
    setInterval(() => {}, 1000);
    const worker = runWorker(config, createLogger(), {
      signals: process,
      exit: code => process.exit(code),
      openDatabase: () => ({
        check: async () => {}, createRuntime: () => ({}),
        close: async () => { throw new Error('database must remain open'); }
      }),
      openConsumer: async () => ({ stop: () => new Promise(() => {}) }),
      createHandlers: () => ({})
    });
    await worker.ready;
    process.kill(process.pid, 'SIGTERM');
    await worker.stopped;
  `;
  await expect(
    promisify(execFile)(
      process.execPath,
      ["--import", import.meta.resolve("tsx"), "--input-type=module", "--eval", script],
      { timeout: 5000 },
    ),
  ).rejects.toMatchObject({
    code: 1,
    killed: false,
    stdout: expect.stringContaining("worker shutdown deadline expired"),
  });
});
