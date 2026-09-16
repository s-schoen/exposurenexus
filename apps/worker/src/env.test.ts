import { describe, expect, it } from "vitest";

import { readConfig } from "./env.js";

const required = {
  DATABASE_URL: "postgresql://user:secret@localhost/app",
  RABBITMQ_URL: "amqp://worker:secret@localhost/jobs",
  S3_BUCKET: "scan-inputs",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-secret",
};

describe("worker configuration", () => {
  it("requires only worker dependencies and ignores invalid API settings", () => {
    const config = readConfig({
      ...required,
      AUTH_SECRET: "short",
      AUTH_SESSION_LIFETIME: "invalid",
      AUTH_COOKIE_SECURE: "invalid",
      APP_ORIGIN: "invalid",
      STATIC_DIR: "",
      PORT: "invalid",
    });
    expect(config).toEqual({
      ...required,
      LOG_LEVEL: "info",
      RABBITMQ_QUEUE: "EXPOSURENEXUS_JOBS_INGEST",
      SHUTDOWN_TIMEOUT_MS: 60_000,
      STARTUP_TIMEOUT_MS: 30_000,
      S3_FORCE_PATH_STYLE: false,
    });
  });

  it("reads the supplied environment independently on each call", () => {
    expect(readConfig({ ...required, SHUTDOWN_TIMEOUT_MS: "42" }).SHUTDOWN_TIMEOUT_MS).toBe(42);
    expect(readConfig({ ...required, SHUTDOWN_TIMEOUT_MS: "" }).SHUTDOWN_TIMEOUT_MS).toBe(60_000);
    expect(() => readConfig({})).toThrow("DATABASE_URL, RABBITMQ_URL");
  });

  it.each(["0", "-1", "1.5", "Infinity", "2147483648", "abc"])(
    "rejects invalid deadlines %s",
    (value) => {
      expect(() => readConfig({ ...required, SHUTDOWN_TIMEOUT_MS: value })).toThrow(
        "SHUTDOWN_TIMEOUT_MS",
      );
      expect(() => readConfig({ ...required, STARTUP_TIMEOUT_MS: value })).toThrow(
        "STARTUP_TIMEOUT_MS",
      );
    },
  );

  it.each([
    { DATABASE_URL: "https://user:do-not-log@localhost" },
    { RABBITMQ_URL: "https://worker:do-not-log@localhost" },
    { LOG_LEVEL: "do-not-log" },
    { RABBITMQ_QUEUE: "   " },
    { S3_BUCKET: "   " },
    { S3_REGION: "" },
    { S3_ACCESS_KEY_ID: "   " },
    { S3_SECRET_ACCESS_KEY: "" },
    { S3_ENDPOINT: "ftp://do-not-log@host" },
    { S3_FORCE_PATH_STYLE: "do-not-log" },
  ])("rejects invalid settings without exposing input values", (invalid) => {
    expect(() => readConfig({ ...required, ...invalid })).toThrow("Invalid worker configuration:");
    try {
      readConfig({ ...required, ...invalid });
    } catch (error) {
      expect(String(error)).not.toContain("do-not-log");
    }
  });

  it("reads optional storage settings without trimming credentials", () => {
    expect(
      readConfig({
        ...required,
        S3_ENDPOINT: "http://localhost:7070",
        S3_FORCE_PATH_STYLE: "true",
        S3_SECRET_ACCESS_KEY: " secret with whitespace ",
      }),
    ).toMatchObject({
      S3_ENDPOINT: "http://localhost:7070",
      S3_FORCE_PATH_STYLE: true,
      S3_SECRET_ACCESS_KEY: " secret with whitespace ",
    });
  });
});
