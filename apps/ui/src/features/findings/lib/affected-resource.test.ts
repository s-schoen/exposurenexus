import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it } from "vitest";

import {
  formatResourceType,
  getResourceDetails,
} from "@/features/findings/lib/affected-resource.ts";

describe("formatResourceType", () => {
  it("names each resource type", () => {
    expect(formatResourceType(AffectedResourceType.WebEndpoint)).toBe("Web endpoint");
    expect(formatResourceType(AffectedResourceType.Unspecified)).toBe("Unspecified resource");
  });
});

describe("getResourceDetails", () => {
  it("lists only recorded fields and formats components", () => {
    expect(
      getResourceDetails({
        type: AffectedResourceType.WebEndpoint,
        host: "admin.example.com",
        port: 443,
        component: { kind: WebEndpointComponentKind.Header, name: "X-Admin" },
      }),
    ).toEqual([
      ["Host", "admin.example.com"],
      ["Port", "443"],
      ["Component", "header: X-Admin"],
    ]);
  });

  it("formats a source location as a start-end range", () => {
    expect(
      getResourceDetails({
        type: AffectedResourceType.SourceCode,
        file: "src/app.ts",
        location: { startLine: 3, startColumn: 5, endLine: 4 },
      }),
    ).toEqual([
      ["File", "src/app.ts"],
      ["Location", "3:5-4"],
    ]);
  });

  it("has no details for an unspecified resource", () => {
    expect(getResourceDetails({ type: AffectedResourceType.Unspecified })).toEqual([]);
  });
});
