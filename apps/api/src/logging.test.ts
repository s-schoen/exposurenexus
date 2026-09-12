import { beforeEach, expect, it, vi } from "vitest";

import { createApiLoggers, createLogger } from "./logging.js";

const logs = vi.hoisted(() => [] as string[]);

vi.mock("pino", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pino")>();
  return {
    ...actual,
    pino: (options: import("pino").LoggerOptions) =>
      actual.pino(options, {
        write: (line: string) => {
          logs.push(line);
        },
      }),
  };
});
vi.mock("./env.js", () => ({ env: { LOG_LEVEL: "info" } }));

beforeEach(() => {
  logs.length = 0;
});

it("defaults to the environment level but honors an explicit createLogger level", () => {
  createLogger("default").debug("hidden");
  createLogger("default").info("visible");
  createLogger("override", { level: "debug" }).debug("explicit level");

  expect(logs.map((line) => JSON.parse(line))).toEqual([
    expect.objectContaining({ name: "default", level: 30, msg: "visible" }),
    expect.objectContaining({ name: "override", level: 20, msg: "explicit level" }),
  ]);
});

it.each(["debug", "warn"])("uses the provided %s level for all API and module loggers", (level) => {
  const { logger, accessLogger, infrastructureLogger, dbLogger, loggerFactory } =
    createApiLoggers(level);
  const loggers = [
    logger,
    accessLogger,
    infrastructureLogger,
    dbLogger,
    loggerFactory("container"),
    loggerFactory("backend"),
    loggerFactory("events"),
  ];

  for (const output of loggers) {
    output.debug("debug message");
    output.warn("warn message");
  }

  expect(logs.map((line) => JSON.parse(line))).toEqual(
    ["api", "audit/api", "infrastructure", "db", "container", "backend", "events"].flatMap(
      (name) =>
        level === "debug"
          ? [
              expect.objectContaining({ name, level: 20, msg: "debug message" }),
              expect.objectContaining({ name, level: 40, msg: "warn message" }),
            ]
          : [expect.objectContaining({ name, level: 40, msg: "warn message" })],
    ),
  );
});

it("keeps credentials out of infrastructure and DB errors while preserving explicit messages", () => {
  const { infrastructureLogger, dbLogger } = createApiLoggers("info");
  const error = new Error("connection failed: postgres://user:credential-secret@database/app");

  for (const logger of [infrastructureLogger, dbLogger]) {
    logger.error(error);
    logger.error({ err: error });
    logger.error({ err: error }, "failed to migrate");
    logger.error(error, "connection failed");
  }

  expect(logs).toHaveLength(8);
  expect(logs.join("")).not.toContain("credential-secret");
  expect(logs.map((line) => JSON.parse(line))).toEqual(
    ["infrastructure", "db"].flatMap((name) =>
      [
        "infrastructure error",
        "infrastructure error",
        "failed to migrate",
        "connection failed",
      ].map((msg) => expect.objectContaining({ name, err: "infrastructure error", msg })),
    ),
  );
});
