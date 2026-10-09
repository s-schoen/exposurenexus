import {
  AffectedResourceType,
  findingAffectedResourceSchema,
  observationAffectedResourceSchema,
} from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it } from "vitest";

import { toFindingAffectedResource } from "./affected-resource-rules.js";

const findingResource = (resource: unknown) => findingAffectedResourceSchema.parse(resource);
const observationResource = (resource: unknown) =>
  observationAffectedResourceSchema.parse(resource);

describe("toFindingAffectedResource", () => {
  it("drops observation-only source snapshot fields and keeps finding identity", () => {
    const projections = [
      [
        {
          type: AffectedResourceType.WebEndpoint,
          host: "shop.example.com",
          path: "/search",
          component: { kind: "queryParameter", name: "q" },
          reportedUrl: "https://shop.example.com/search?q=1",
        },
        {
          type: AffectedResourceType.WebEndpoint,
          host: "shop.example.com",
          path: "/search",
          component: { kind: "queryParameter", name: "q" },
        },
      ],
      [
        {
          type: AffectedResourceType.SourceCode,
          file: "src/app.ts",
          location: { startLine: 3 },
          locationFingerprint: "abc",
          revision: "deadbeef",
        },
        {
          type: AffectedResourceType.SourceCode,
          file: "src/app.ts",
          location: { startLine: 3 },
          locationFingerprint: "abc",
        },
      ],
      [
        { type: AffectedResourceType.Package, ecosystem: "npm", name: "lodash", version: "4.0.0" },
        { type: AffectedResourceType.Package, ecosystem: "npm", name: "lodash" },
      ],
      [
        { type: AffectedResourceType.ContainerImage, repository: "library/nginx", tag: "1.27" },
        { type: AffectedResourceType.ContainerImage, repository: "library/nginx" },
      ],
      [
        { type: AffectedResourceType.CloudResource, resourceId: "bucket", displayName: "Bucket" },
        { type: AffectedResourceType.CloudResource, resourceId: "bucket" },
      ],
      [
        { type: AffectedResourceType.NetworkService, host: "db.internal", port: 5432 },
        { type: AffectedResourceType.NetworkService, host: "db.internal", port: 5432 },
      ],
      [{ type: AffectedResourceType.Unspecified }, { type: AffectedResourceType.Unspecified }],
    ] as const;

    for (const [observation, finding] of projections) {
      const projected = toFindingAffectedResource(observationResource(observation));
      expect(projected).toEqual(finding);
      expect(findingResource(projected)).toEqual(finding);
    }
  });
});
