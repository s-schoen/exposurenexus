import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import { describe, expect, it } from "vitest";

import {
  compareResource,
  locationFingerprint,
  missingMinimumFields,
  resourceIdentity,
  sameSourceScope,
} from "./resource-identity.js";

import type { SourceLocation } from "./resource-identity.js";
import type { ObservationAffectedResource } from "@exposurenexus/contracts/model/affected-resource";

function relation(left: ObservationAffectedResource, right: ObservationAffectedResource) {
  return compareResource(resourceIdentity(left), resourceIdentity(right));
}

const lodash = {
  type: AffectedResourceType.Package,
  ecosystem: "npm",
  name: "lodash",
  installationPath: "app/package-lock.json",
} as const;

describe("resourceIdentity", () => {
  it("ignores observation-only snapshot fields", () => {
    expect(resourceIdentity({ ...lodash, version: "4.17.20" })).toEqual(resourceIdentity(lodash));
    expect(
      resourceIdentity({ type: AffectedResourceType.SourceCode, file: "a.ts", revision: "abc" }),
    ).toEqual(resourceIdentity({ type: AffectedResourceType.SourceCode, file: "a.ts" }));
  });

  it("canonicalizes web endpoints for comparison only", () => {
    const reported = {
      type: AffectedResourceType.WebEndpoint,
      scheme: "HTTPS",
      host: "[2001:DB8::1]",
      path: "/search",
      method: "get",
      component: { kind: WebEndpointComponentKind.QueryParameter, name: "q" },
      reportedUrl: "https://[2001:db8::1]/search?q=1",
    } as const;
    const snapshot = structuredClone(reported);

    expect(resourceIdentity(reported).fields).toEqual({
      scheme: "https",
      host: "2001:db8::1",
      port: "443",
      path: "/search",
      method: "GET",
      componentKind: "queryParameter",
      componentName: "q",
    });
    expect(reported).toStrictEqual(snapshot);
  });

  it("cleans path separators and a leading ./ without touching other path text", () => {
    expect(
      resourceIdentity({ type: AffectedResourceType.SourceCode, file: "./src\\routes\\a.ts" })
        .fields,
    ).toEqual({ file: "src/routes/a.ts" });
    expect(
      resourceIdentity({ type: AffectedResourceType.SourceCode, file: "/src/a.ts" }).fields,
    ).toEqual({ file: "/src/a.ts" });
  });

  it("reads the location fingerprint separately from resource identity", () => {
    const resource = {
      type: AffectedResourceType.SourceCode,
      file: "a.ts",
      locationFingerprint: " 9c1f ",
    } as const;
    expect(locationFingerprint(resource)).toBe("9c1f");
    expect(resourceIdentity(resource).fields).toEqual({ file: "a.ts" });
    expect(locationFingerprint(lodash)).toBeUndefined();
  });
});

describe("compareResource", () => {
  it("finds exact identity despite version drift and value casing", () => {
    expect(relation({ ...lodash, version: "4.17.21" }, { ...lodash, ecosystem: "NPM" })).toBe(
      "exact",
    );
  });

  it("treats a field known on only one side as compatible", () => {
    const { installationPath: _, ...withoutPath } = lodash;
    expect(relation(withoutPath, lodash)).toBe("compatible");
  });

  it("treats a disagreeing field as different", () => {
    expect(relation(lodash, { ...lodash, installationPath: "other/package-lock.json" })).toBe(
      "different",
    );
  });

  it("requires the type's minimum fields on both sides", () => {
    expect(relation({ type: AffectedResourceType.Package, ecosystem: "npm" }, lodash)).toBe(
      "different",
    );
    expect(missingMinimumFields(resourceIdentity({ type: AffectedResourceType.Package }))).toEqual([
      "name",
    ]);
  });

  it("never relates different types, including unspecified", () => {
    expect(
      relation(
        { type: AffectedResourceType.Unspecified },
        { type: AffectedResourceType.Unspecified },
      ),
    ).toBe("exact");
    expect(relation({ type: AffectedResourceType.Unspecified }, lodash)).toBe("different");
    expect(
      relation(
        { type: AffectedResourceType.SourceCode, file: "lodash" },
        { type: AffectedResourceType.Package, name: "lodash" },
      ),
    ).toBe("different");
  });

  it("keeps the start line strict despite a shared symbol", () => {
    const bucket = {
      type: AffectedResourceType.SourceCode,
      file: "main.tf",
      symbol: "aws_s3_bucket.data",
    } as const;
    expect(
      relation(
        { ...bucket, location: { startLine: 4 } },
        { ...bucket, location: { startLine: 9 } },
      ),
    ).toBe("different");
  });

  it("compares columns and end lines only where both sides know them", () => {
    const span = { startLine: 46, startColumn: 34, endLine: 46, endColumn: 82 };
    const at = (location: SourceLocation) =>
      ({ type: AffectedResourceType.SourceCode, file: "a.ts", location }) as const;
    expect(relation(at(span), at({ ...span, endColumn: 106 }))).toBe("different");
    expect(relation(at(span), at({ startLine: 46 }))).toBe("exact");
    expect(relation(at(span), at({ startLine: 46, endLine: 46 }))).toBe("exact");
  });

  it("keeps the start line strict without a shared symbol", () => {
    expect(
      relation(
        { type: AffectedResourceType.SourceCode, file: "a.ts", location: { startLine: 40 } },
        { type: AffectedResourceType.SourceCode, file: "a.ts", location: { startLine: 52 } },
      ),
    ).toBe("different");
  });
});

describe("sameSourceScope", () => {
  const file = { type: AffectedResourceType.SourceCode, file: "./main.tf" } as const;
  const scope = resourceIdentity;

  it("ignores the location but not the symbol", () => {
    expect(
      sameSourceScope(
        scope({ ...file, location: { startLine: 4 } }),
        scope({ ...file, file: "main.tf", location: { startLine: 9, endLine: 12 } }),
      ),
    ).toBe(true);
    expect(sameSourceScope(scope({ ...file, symbol: "a" }), scope({ ...file, symbol: "b" }))).toBe(
      false,
    );
    expect(sameSourceScope(scope({ ...file, symbol: "a" }), scope(file))).toBe(false);
  });

  it("holds only for source code", () => {
    expect(sameSourceScope(scope(lodash), scope(lodash))).toBe(false);
  });
});
