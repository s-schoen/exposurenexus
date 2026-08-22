import {
  createAssetCustomFieldDefinitionSchema,
  updateAssetCustomFieldDefinitionSchema,
} from "@exposurenexus/contracts/model/asset-custom-field";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { notFound } from "../lib/api-error.js";
import { replyArray, replyObject } from "../lib/reply.js";
import { requestEventContext } from "../lib/request-event-context.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { AssetCustomFieldService } from "../service/asset-custom-field.js";

interface AssetCustomFieldRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

const fieldIdParamValidator = zValidator("param", z.object({ fieldId: z.uuidv4() }));

export function createAssetCustomFieldRoute(
  assetCustomFieldService: AssetCustomFieldService,
  { requireDomainPermission }: AssetCustomFieldRouteDependencies,
) {
  const customField = new Hono<{ Variables: ContextVariables }>();

  customField.get("/", requireDomainPermission("custom-field", "read"), async (c) => {
    const definitions = await assetCustomFieldService.listDefinitions();
    return replyArray(c, definitions);
  });

  customField.get(
    "/:fieldId",
    requireDomainPermission("custom-field", "read"),
    fieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param");

      const definition = await assetCustomFieldService.getDefinitionByID(params.fieldId);
      if (!definition) {
        throw notFound("asset custom field", params.fieldId);
      }

      return replyObject(c, definition);
    },
  );

  customField.post(
    "/",
    requireDomainPermission("custom-field", "write"),
    zValidator("json", createAssetCustomFieldDefinitionSchema),
    async (c) => {
      const body = c.req.valid("json");
      const definition = await assetCustomFieldService.createDefinition(
        body,
        requestEventContext(c),
      );
      return replyObject(c, definition, true);
    },
  );

  customField.put(
    "/:fieldId",
    requireDomainPermission("custom-field", "write"),
    fieldIdParamValidator,
    zValidator("json", updateAssetCustomFieldDefinitionSchema),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const definition = await assetCustomFieldService.updateDefinitionByID({
        id: params.fieldId,
        definition: body,
        eventContext: requestEventContext(c),
      });
      if (!definition) {
        throw notFound("asset custom field", params.fieldId);
      }

      return replyObject(c, definition);
    },
  );

  customField.delete(
    "/:fieldId",
    requireDomainPermission("custom-field", "delete"),
    fieldIdParamValidator,
    async (c) => {
      const params = c.req.valid("param");

      const definition = await assetCustomFieldService.deleteDefinitionByID(
        params.fieldId,
        requestEventContext(c),
      );
      if (!definition) {
        throw notFound("asset custom field", params.fieldId);
      }

      return replyObject(c, definition);
    },
  );

  return customField;
}
