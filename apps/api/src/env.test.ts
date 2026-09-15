import { afterEach, describe, expect, it, vi } from "vitest";

const AUTH_SECRET = "012345678901234567890123456789012345678901234567890123456789";
const DATABASE_URL = "postgres://exposurenexus:exposurenexus@localhost:5432/exposurenexus";

async function loadEnv(
  overrides: Record<string, string | undefined> = {},
): Promise<typeof import("./env.js").env> {
  vi.resetModules();
  vi.stubEnv("AUTH_SECRET", AUTH_SECRET);
  vi.stubEnv("DATABASE_URL", DATABASE_URL);
  vi.stubEnv("APP_ORIGIN", "");
  vi.stubEnv("CORS_ORIGIN", "");
  vi.stubEnv("STATIC_DIR", "");
  vi.stubEnv("RABBITMQ_URL", "amqp://api:secret@localhost/jobs");
  vi.stubEnv("RABBITMQ_EXCHANGE", "jobs");
  vi.stubEnv("SHUTDOWN_TIMEOUT_MS", "");
  vi.stubEnv("STARTUP_TIMEOUT_MS", "");
  vi.stubEnv("S3_BUCKET", "private-imports");
  vi.stubEnv("S3_REGION", "us-east-1");
  vi.stubEnv("S3_ACCESS_KEY_ID", "test-access-key");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "test-secret-key");
  vi.stubEnv("S3_ENDPOINT", "");
  vi.stubEnv("S3_FORCE_PATH_STYLE", "");
  vi.stubEnv("IMPORT_SOURCE_MAX_SIZE_BYTES", "");
  vi.stubEnv("IMPORT_SOURCE_RETENTION_POLICY", "");

  for (const [key, value] of Object.entries(overrides)) {
    vi.stubEnv(key, value);
  }

  const module = await import("./env.js");
  return module.env;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("api environment", () => {
  it.each([
    { RABBITMQ_URL: undefined },
    { RABBITMQ_URL: "" },
    { RABBITMQ_URL: "not-a-url" },
    { RABBITMQ_URL: "https://api:do-not-log@localhost/jobs" },
    { RABBITMQ_EXCHANGE: "" },
    { RABBITMQ_EXCHANGE: undefined },
    { RABBITMQ_EXCHANGE: "   " },
    { AUTH_SECRET: "do-not-log" },
    { AUTH_TRUSTED_PROXIES: "do-not-log" },
    { DATABASE_URL: "do-not-log" },
    { S3_BUCKET: undefined },
    { S3_BUCKET: "   " },
    { S3_REGION: undefined },
    { S3_REGION: "   " },
    { S3_ACCESS_KEY_ID: undefined },
    { S3_ACCESS_KEY_ID: "   " },
    { S3_SECRET_ACCESS_KEY: undefined },
    { S3_SECRET_ACCESS_KEY: "   " },
    { S3_ENDPOINT: "not-a-url" },
    { S3_ENDPOINT: "ftp://user:do-not-log@storage" },
    { S3_FORCE_PATH_STYLE: "yes" },
    { IMPORT_SOURCE_MAX_SIZE_BYTES: "-1" },
    { IMPORT_SOURCE_MAX_SIZE_BYTES: "0.5" },
    { IMPORT_SOURCE_MAX_SIZE_BYTES: "9007199254740992" },
    { IMPORT_SOURCE_MAX_SIZE_BYTES: "Infinity" },
    { IMPORT_SOURCE_MAX_SIZE_BYTES: "   " },
    { IMPORT_SOURCE_RETENTION_POLICY: "expire" },
  ])("rejects invalid configuration with field-only diagnostics: %j", async (invalid) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(loadEnv(invalid)).rejects.toEqual(
      new Error(`Invalid API configuration: ${Object.keys(invalid).join(", ")}`),
    );
    expect(log).not.toHaveBeenCalled();
  });

  it.each(["0", "-1", "1.5", "Infinity", "2147483648", "abc", "   "])(
    "rejects invalid deadlines %s",
    async (value) => {
      for (const field of ["SHUTDOWN_TIMEOUT_MS", "STARTUP_TIMEOUT_MS"]) {
        await expect(loadEnv({ [field]: value })).rejects.toThrow(
          `Invalid API configuration: ${field}`,
        );
      }
    },
  );

  it.each([undefined, ""])(
    "defaults unset or empty deadlines to match the worker: %s",
    async (value) => {
      const env = await loadEnv({ SHUTDOWN_TIMEOUT_MS: value, STARTUP_TIMEOUT_MS: value });
      expect(env.SHUTDOWN_TIMEOUT_MS).toBe(60_000);
      expect(env.STARTUP_TIMEOUT_MS).toBe(30_000);
    },
  );

  it.each(["1", "42", "2147483647"])("accepts bounded integer deadlines %s", async (value) => {
    const env = await loadEnv({ SHUTDOWN_TIMEOUT_MS: value, STARTUP_TIMEOUT_MS: value });
    expect(env.SHUTDOWN_TIMEOUT_MS).toBe(Number(value));
    expect(env.STARTUP_TIMEOUT_MS).toBe(Number(value));
  });

  it.each(["amqp", "amqps"])(
    "reads required %s broker settings and trims the exchange",
    async (protocol) => {
      const url = `${protocol}://api:secret@localhost/jobs`;
      const env = await loadEnv({ RABBITMQ_URL: url, RABBITMQ_EXCHANGE: "  jobs  " });

      expect(env.RABBITMQ_URL).toBe(url);
      expect(env.RABBITMQ_EXCHANGE).toBe("jobs");
    },
  );

  it("defaults the app origin for local split development", async () => {
    const env = await loadEnv();

    expect(env.APP_ORIGIN).toBe("http://localhost:3000");
  });

  it("requires storage credentials and defaults import policy without an endpoint", async () => {
    const env = await loadEnv();
    expect(env).toMatchObject({
      S3_BUCKET: "private-imports",
      S3_REGION: "us-east-1",
      S3_ACCESS_KEY_ID: "test-access-key",
      S3_SECRET_ACCESS_KEY: "test-secret-key",
      S3_FORCE_PATH_STYLE: false,
      IMPORT_SOURCE_MAX_SIZE_BYTES: 104857600,
      IMPORT_SOURCE_RETENTION_POLICY: "temporary",
      API_TIMEOUT_MS: 5000,
    });
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  it.each(["0", "9007199254740991"])(
    "accepts configured storage addressing, retention and size boundary %s",
    async (sizeBytes) => {
      const env = await loadEnv({
        S3_ENDPOINT: "http://localhost:7070",
        S3_FORCE_PATH_STYLE: "true",
        IMPORT_SOURCE_MAX_SIZE_BYTES: sizeBytes,
        IMPORT_SOURCE_RETENTION_POLICY: "keep",
      });
      expect(env.S3_ENDPOINT).toBe("http://localhost:7070");
      expect(env.S3_FORCE_PATH_STYLE).toBe(true);
      expect(env.IMPORT_SOURCE_MAX_SIZE_BYTES).toBe(Number(sizeBytes));
      expect(env.IMPORT_SOURCE_RETENTION_POLICY).toBe("keep");
    },
  );

  it("prefers APP_ORIGIN for browser origin validation", async () => {
    const env = await loadEnv({
      APP_ORIGIN: "https://exposurenexus.example",
      CORS_ORIGIN: "http://localhost:3000",
    });

    expect(env.APP_ORIGIN).toBe("https://exposurenexus.example");
  });

  it("keeps CORS_ORIGIN as a deprecated alias", async () => {
    const env = await loadEnv({
      CORS_ORIGIN: "http://localhost:3000",
    });

    expect(env.APP_ORIGIN).toBe("http://localhost:3000");
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000");
  });

  it("exposes the opt-in static asset directory", async () => {
    const env = await loadEnv({
      STATIC_DIR: "/app/public",
    });

    expect(env.STATIC_DIR).toBe("/app/public");
  });

  it("coerces numeric settings from process environment strings", async () => {
    const env = await loadEnv({
      PORT: "3002",
      API_TIMEOUT_MS: "7000",
      AUTH_SESSION_LIFETIME: "24",
    });

    expect(env.PORT).toBe(3002);
    expect(env.API_TIMEOUT_MS).toBe(7000);
    expect(env.AUTH_SESSION_LIFETIME).toBe(24);
  });
});
