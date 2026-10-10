import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createVulnerability,
  deleteVulnerability,
  getVulnerabilityByID,
  listVulnerabilities,
  updateVulnerability,
} from "@/features/vulnerabilities/api/vulnerabilities.ts";
import { APIError } from "@/lib/api-client.ts";
import { SEED_VULNERABILITIES } from "@/mocks/fixtures/index.ts";
import { mockApiError, mockApiReply } from "@/test/msw.ts";

// Happy-path requests and bodies are covered by src/mocks/handlers/handlers.test.ts, whose
// handlers validate bodies with the contracts schemas. This covers error and reply handling.

const [entry] = SEED_VULNERABILITIES;
const input = {
  type: entry.type,
  identifier: entry.identifier,
  title: entry.title,
  severity: entry.severity,
  description: entry.description,
  metadata: entry.metadata,
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("vulnerability api", () => {
  it.each([
    ["list", "get", "/vulnerabilities", () => listVulnerabilities()],
    ["get", "get", "/vulnerabilities/:id", () => getVulnerabilityByID(entry.id)],
    ["create", "post", "/vulnerabilities", () => createVulnerability(input)],
    ["update", "put", "/vulnerabilities/:id", () => updateVulnerability(entry.id, input)],
    ["delete", "delete", "/vulnerabilities/:id", () => deleteVulnerability(entry.id)],
  ] as const)("turns %s error replies into APIErrors", async (_name, method, path, call) => {
    mockApiError(method, path, 422, "Catalog endpoint rejected the request", "catalog-reason");

    const request = call();
    await expect(request).rejects.toBeInstanceOf(APIError);
    await expect(request).rejects.toMatchObject({
      statusCode: 422,
      message: "Catalog endpoint rejected the request",
      reason: "catalog-reason",
    });
  });

  it("rejects replies that break the catalog contract", async () => {
    mockApiReply("get", "/vulnerabilities/:id", { data: { ...entry, severity: "urgent" } });

    await expect(getVulnerabilityByID(entry.id)).rejects.toThrow();
  });
});
