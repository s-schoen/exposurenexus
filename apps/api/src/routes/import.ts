import { Hono } from "hono";

import { notImplemented } from "../lib/api-error.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";

interface ImportRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

export function createImportRoute({ requireDomainPermission }: ImportRouteDependencies) {
  const importRoute = new Hono<{ Variables: ContextVariables }>();

  importRoute.post("/import", requireDomainPermission("import", "write"), () => {
    throw notImplemented("Automated finding imports are not available yet");
  });

  return importRoute;
}
