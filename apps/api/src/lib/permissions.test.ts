import { PermissionResource, PermissionVerb } from "@exposurenexus/types/model/rbac";
import { describe, expect, it } from "vitest";

import { domainPermission, groupPermission, toPermissionStatements } from "./permissions.js";

describe("rbac permissions", () => {
  it("builds shared permission objects for route middleware", () => {
    expect(domainPermission(PermissionResource.Asset, PermissionVerb.Read)).toEqual({
      resource: PermissionResource.Asset,
      verb: PermissionVerb.Read,
    });
    expect(domainPermission(PermissionResource.Finding, PermissionVerb.Delete)).toEqual({
      resource: PermissionResource.Finding,
      verb: PermissionVerb.Delete,
    });
    expect(domainPermission(PermissionResource.Stats, PermissionVerb.Delete)).toEqual({
      resource: PermissionResource.Stats,
      verb: PermissionVerb.Delete,
    });
    expect(domainPermission(PermissionResource.User, PermissionVerb.Write)).toEqual({
      resource: PermissionResource.User,
      verb: PermissionVerb.Write,
    });
    expect(domainPermission(PermissionResource.Session, PermissionVerb.Read)).toEqual({
      resource: PermissionResource.Session,
      verb: PermissionVerb.Read,
    });
  });

  it("groups shared permissions by resource and deduplicates verbs", () => {
    expect(
      groupPermission({
        resource: PermissionResource.Asset,
        verb: PermissionVerb.Read,
      }),
    ).toEqual({ asset: ["read"] });

    expect(
      toPermissionStatements([
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Write },
        { resource: PermissionResource.Asset, verb: PermissionVerb.Read },
        { resource: PermissionResource.Stats, verb: PermissionVerb.Read },
      ]),
    ).toEqual({
      asset: ["read", "write"],
      stats: ["read"],
    });
  });
});
