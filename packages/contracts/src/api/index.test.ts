import { describe, expect, expectTypeOf, it } from "vitest";

import {
  authLoginSchema,
  authSessionDataReplySchema,
  authSessionReplySchema,
  authSignOutDataReplySchema,
  registerImportSourceDataReplySchema,
  registerImportSourceSchema,
  submitImportSourceDataReplySchema,
} from "./index.js";

import type {
  RegisterImportSource,
  RegisterImportSourceDataReply,
  SubmitImportSourceDataReply,
} from "@exposurenexus/contracts/api";

const serializedSession = {
  id: "11003daa-67df-40e4-894f-ada5de7bd1be",
  userId: "8b2648c7-945c-49bb-9a3f-66e02a35df52",
  sourceIp: "203.0.113.10",
  userAgent: "Mozilla/5.0",
  createdAt: "2026-08-31T12:00:00.000Z",
  expiresAt: "2026-09-01T12:00:00.000Z",
};

const user = {
  id: serializedSession.userId,
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  roleIds: ["fce4b0c8-f63f-4b21-84f5-f5f4de71f9cb"],
};

describe("auth API schemas", () => {
  it("preserves credentials and requires a non-blank username and non-empty password", () => {
    expect(authLoginSchema.parse({ username: " alice ", password: " secret " })).toEqual({
      username: " alice ",
      password: " secret ",
    });

    expect(authLoginSchema.safeParse({ username: "   ", password: "secret" }).success).toBe(false);
    expect(authLoginSchema.safeParse({ username: "\t\n\u00a0", password: "secret" }).success).toBe(
      false,
    );
    expect(authLoginSchema.safeParse({ username: "", password: "secret" }).success).toBe(false);
    expect(authLoginSchema.safeParse({ username: "alice", password: "" }).success).toBe(false);
  });

  it("decodes serialized session dates", () => {
    expect(
      authSessionDataReplySchema.parse({
        user,
        session: serializedSession,
      }),
    ).toEqual({
      user,
      session: {
        ...serializedSession,
        createdAt: new Date(serializedSession.createdAt),
        expiresAt: new Date(serializedSession.expiresAt),
      },
    });
  });

  it("rejects malformed session and sign-out replies", () => {
    expect(
      authSessionReplySchema.safeParse({ ...serializedSession, sessionId: "private-token" })
        .success,
    ).toBe(false);
    expect(
      authSessionDataReplySchema.safeParse({
        user,
        session: { ...serializedSession, expiresAt: "not-a-date" },
      }).success,
    ).toBe(false);
    expect(authSignOutDataReplySchema.safeParse({ revoked: "yes" }).success).toBe(false);
  });
});

describe("scan registration API schemas", () => {
  it("accepts zero-byte Nuclei registration without altering declared metadata", () => {
    const request = {
      source: "nuclei",
      originalFilename: " ../../scan.jsonl ",
      sizeBytes: 0,
      mimeType: "unverified scanner metadata",
    };
    expect(registerImportSourceSchema.parse(request)).toEqual(request);
    expectTypeOf<RegisterImportSource>().toEqualTypeOf<{
      source: "nuclei";
      originalFilename: string;
      sizeBytes: number;
      mimeType?: string;
    }>();
  });

  it("requires strict registration metadata and accepts the full nonnegative safe-integer range", () => {
    const request = { source: "nuclei", originalFilename: "scan.jsonl", sizeBytes: 0 };
    for (const sizeBytes of [0, 104857600, Number.MAX_SAFE_INTEGER]) {
      expect(registerImportSourceSchema.parse({ ...request, sizeBytes })).toEqual({
        ...request,
        sizeBytes,
      });
    }
    for (const invalid of [
      null,
      [],
      "scan.jsonl",
      { ...request, source: undefined },
      { ...request, source: "manual" },
      { ...request, source: "other-scanner" },
      { ...request, originalFilename: undefined },
      { ...request, originalFilename: "" },
      { ...request, originalFilename: " \t\n\u00a0" },
      { ...request, originalFilename: 123 },
      ...[undefined, null, "0", -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1].map(
        (sizeBytes) => ({ ...request, sizeBytes }),
      ),
      { ...request, mimeType: null },
      { ...request, mimeType: 123 },
      { ...request, retentionPolicy: "keep" },
      { ...request, performedBy: user.id },
    ]) {
      expect(registerImportSourceSchema.safeParse(invalid).success).toBe(false);
    }
  });

  it("returns only a UUIDv4 import-source reference in registration data", () => {
    const data = { importSourceId: "11003daa-67df-40e4-894f-ada5de7bd1be" };
    expect(registerImportSourceDataReplySchema.parse(data)).toEqual(data);
    expectTypeOf<RegisterImportSourceDataReply>().toEqualTypeOf<{ importSourceId: string }>();
    for (const invalid of [
      {},
      { importSourceId: "not-a-uuid" },
      { importSourceId: "11003daa-67df-50e4-894f-ada5de7bd1be" },
      { ...data, ingestionId: data.importSourceId },
      { ...data, jobId: data.importSourceId },
      { ...data, bucket: "private-input" },
      { ...data, objectKey: "private-key" },
    ]) {
      expect(registerImportSourceDataReplySchema.safeParse(invalid).success).toBe(false);
    }
  });
});

describe("scan submission API schemas", () => {
  const data = {
    importSourceId: "11003daa-67df-40e4-894f-ada5de7bd1be",
    ingestionId: "8b2648c7-945c-49bb-9a3f-66e02a35df52",
    jobId: "fce4b0c8-f63f-4b21-84f5-f5f4de71f9cb",
  };

  it("returns only source, ingestion, and job references as submission data", () => {
    expect(submitImportSourceDataReplySchema.parse(data)).toEqual(data);
    expectTypeOf<SubmitImportSourceDataReply>().toEqualTypeOf<{
      importSourceId: string;
      ingestionId: string;
      jobId: string;
    }>();
  });

  it.each(["importSourceId", "ingestionId", "jobId"])("requires a UUIDv4 %s", (field) => {
    for (const invalid of [
      undefined,
      null,
      123,
      "not-a-uuid",
      "11003daa-67df-50e4-894f-ada5de7bd1be",
    ]) {
      expect(
        submitImportSourceDataReplySchema.safeParse({ ...data, [field]: invalid }).success,
      ).toBe(false);
    }
  });

  it("rejects extra metadata and leaves response enveloping to the API adapter", () => {
    for (const invalid of [
      { ...data, status: "succeeded" },
      { ...data, source: "nuclei" },
      { ...data, bucket: "private-input" },
      { ...data, objectKey: "private-key" },
      { correlationId: "request-id", data },
    ]) {
      expect(submitImportSourceDataReplySchema.safeParse(invalid).success).toBe(false);
    }
  });
});
