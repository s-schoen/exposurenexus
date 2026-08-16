import {
  AffectedResourceType,
  normalizeFindingAffectedResource,
} from "@exposurenexus/types/model/affected-resource";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { describe, expect, it, vi } from "vitest";

import type { NormalizedObservationDraft, ObservationResolver } from "./resolver.js";

const observation: NormalizedObservationDraft = {
  source: "nuclei",
  title: "Exposed admin panel",
  severity: VulnerabilitySeverity.High,
  weakness: { identifiers: { nuclei: ["admin-panel"] } },
  affectedResource: {
    type: AffectedResourceType.WebEndpoint,
    scheme: "https",
    host: "example.com",
    port: 443,
    path: "/admin",
  },
  observedAt: new Date("2026-01-02T03:04:05.000Z"),
};

describe("observation resolver contract", () => {
  it("accepts an asset and normalized observation and can attach it", async () => {
    const resolve = vi.fn<ObservationResolver["resolve"]>().mockResolvedValue({
      kind: "attach",
      findingId: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });
    const resolver: ObservationResolver = { resolve };

    await expect(
      resolver.resolve({
        assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        observation,
      }),
    ).resolves.toEqual({
      kind: "attach",
      findingId: "2713d833-eb13-4517-ac7c-7761545ed42a",
    });
    expect(resolve).toHaveBeenCalledWith({
      assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
      observation,
    });
  });

  it("can create from explicitly supplied canonical finding fields", async () => {
    const resolver: ObservationResolver = {
      resolve: vi.fn().mockResolvedValue({
        kind: "create",
        canonicalFinding: {
          title: observation.title,
          severity: observation.severity,
          weakness: observation.weakness,
          affectedResource: normalizeFindingAffectedResource({
            type: AffectedResourceType.Asset,
          }),
        },
      }),
    };

    await expect(
      resolver.resolve({ assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c", observation }),
    ).resolves.toMatchObject({
      kind: "create",
      canonicalFinding: {
        affectedResource: { type: AffectedResourceType.Asset },
      },
    });
  });

  it("can skip with a structured reason", async () => {
    const resolver: ObservationResolver = {
      resolve: vi.fn().mockResolvedValue({
        kind: "skip",
        reason: {
          code: "insufficient_identity",
          details: { resourceType: AffectedResourceType.WebEndpoint },
        },
      }),
    };

    await expect(
      resolver.resolve({ assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c", observation }),
    ).resolves.toEqual({
      kind: "skip",
      reason: {
        code: "insufficient_identity",
        details: { resourceType: AffectedResourceType.WebEndpoint },
      },
    });
  });
});
