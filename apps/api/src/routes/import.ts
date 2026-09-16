import { Readable } from "node:stream";

import { registerImportSourceSchema } from "@exposurenexus/contracts/api";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { badRequest, unauthorized } from "../lib/api-error.js";
import { replyObject } from "../lib/reply.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { ImportSources } from "@exposurenexus/backend/import-sources";
import type { Ingestions } from "@exposurenexus/backend/ingestions";
import type {
  RegisterImportSourceDataReply,
  SubmitImportSourceDataReply,
} from "@exposurenexus/contracts/api";
import type { ReadableStream } from "node:stream/web";

interface ImportRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
  ingestions: Pick<Ingestions, "submit">;
}

export function createImportRoute(
  importSources: Pick<ImportSources, "register">,
  { requireDomainPermission, ingestions }: ImportRouteDependencies,
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

  importRoute.put(
    "/import/:importSourceId/content",
    requireDomainPermission("import", "write"),
    zValidator("param", z.object({ importSourceId: z.uuidv4() })),
    async (c) => {
      const user = c.get("user");
      if (!user) throw unauthorized();
      const length = c.req.header("Content-Length");
      if (
        length !== undefined &&
        (!/^\d+$/u.test(length) || !Number.isSafeInteger(Number(length)))
      ) {
        throw badRequest("Content-Length must be a nonnegative safe integer");
      }
      const signal = c.get("importUploadSignal") ?? c.req.raw.signal;
      if (signal.aborted) throw badRequest("Import upload cancelled");
      const rawBody = c.req.raw.body;
      const body = rawBody
        ? Readable.fromWeb(rawBody as ReadableStream<Uint8Array>)
        : Readable.from([]);
      try {
        const data: SubmitImportSourceDataReply = await ingestions.submit({
          ...c.req.valid("param"),
          performedBy: user.id,
          body,
          contentLength: length === undefined ? undefined : Number(length),
          signal,
        });
        return c.json({ correlationId: c.get("requestId"), data }, 202);
      } finally {
        body.destroy();
      }
    },
  );

  return importRoute;
}
