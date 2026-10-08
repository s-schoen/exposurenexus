import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { describe, expect, it, vi } from "vitest";

import { findingIdentitySourceFrom } from "./finding-identity-adapter.js";

import type { FindingIdentity } from "@exposurenexus/backend/findings";

const assetId = "asset";

function identity(id: string, fields: Partial<FindingIdentity> = {}): FindingIdentity {
  return {
    id,
    assetId,
    status: FindingStatus.Active,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    weakness: { identifiers: { cwe: ["CWE-79"] } },
    affectedResource: { type: AffectedResourceType.WebEndpoint, path: "/search" },
    fingerprints: { semgrep: ["a", "b"] },
    ...fields,
  };
}

function source(findings: unknown) {
  const listIdentities = vi.fn(async () => findings as FindingIdentity[]);
  return { listIdentities, adapter: findingIdentitySourceFrom({ listIdentities }) };
}

describe("findingIdentitySourceFrom", () => {
  it("lists the identities of one asset's findings in any status", async () => {
    const findings = [
      identity("active"),
      identity("risk-accepted", { status: FindingStatus.RiskAccepted, fingerprints: {} }),
    ];
    const { listIdentities, adapter } = source(findings);

    await expect(adapter.listFindings(assetId)).resolves.toEqual(findings);
    expect(listIdentities).toHaveBeenCalledWith(assetId);
  });

  it.each([
    ["a non-array response", { findings: "x" }],
    ["a finding on another asset", [identity("other", { assetId: "other-asset" })]],
    ["a repeated finding ID", [identity("same"), identity("same")]],
    ["an unknown status", [identity("x", { status: "open" as FindingStatus })]],
    ["an invalid creation time", [identity("x", { createdAt: new Date(Number.NaN) })]],
    [
      "an invalid affected resource",
      [identity("x", { affectedResource: { type: "nope" } as never })],
    ],
    ["non-canonical fingerprints", [identity("x", { fingerprints: { semgrep: ["b", "a"] } })]],
    [
      "non-canonical weakness identifiers",
      [identity("x", { weakness: { identifiers: { cwe: ["79"] } } })],
    ],
  ])("rejects %s with a log-safe error", async (_label, findings) => {
    await expect(source(findings).adapter.listFindings(assetId)).rejects.toThrow(
      /^Invalid finding identity response\.$/,
    );
  });

  it("propagates read failures", async () => {
    const adapter = findingIdentitySourceFrom({
      listIdentities: async () => {
        throw new Error("failed to list finding identities");
      },
    });

    await expect(adapter.listFindings(assetId)).rejects.toThrow(
      "failed to list finding identities",
    );
  });
});
