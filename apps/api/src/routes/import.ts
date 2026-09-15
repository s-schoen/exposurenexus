import { registerImportSourceSchema } from "@exposurenexus/contracts/api";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";

import { unauthorized } from "../lib/api-error.js";
import { replyObject } from "../lib/reply.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { ImportSources } from "@exposurenexus/backend/import-sources";
import type { RegisterImportSourceDataReply } from "@exposurenexus/contracts/api";

interface ImportRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

export function createImportRoute(
  importSources: Pick<ImportSources, "register">,
  { requireDomainPermission }: ImportRouteDependencies,
) {
  const importRoute = new Hono<{ Variables: ContextVariables }>();

  importRoute.post(
    "/import",
    requireDomainPermission("import", "write"),
    zValidator("json", registerImportSourceSchema),
    async (c) => {
      const user = c.get("user");
      if (!user) throw unauthorized();
      const source = await importSources.register({
        ...c.req.valid("json"),
        performedBy: user.id,
      });
      return replyObject(
        c,
        { importSourceId: source.id } satisfies RegisterImportSourceDataReply,
        true,
      );
    },
  );

  return importRoute;
}
