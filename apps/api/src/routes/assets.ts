import {
  createAssetIdentifierSchema,
  createAssetSchema,
  updateAssetIdentifierSchema,
  updateAssetSchema,
} from "@exposurenexus/types/model/asset";
import {
  updateAssetCustomFieldAssociationsSchema,
  updateAssetCustomFieldValuesSchema,
} from "@exposurenexus/types/model/asset-custom-field";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v4";

import { notFound, unauthorized } from "../lib/api-error.js";
import { replyArray, replyObject } from "../lib/reply.js";
import { requestEventContext } from "../lib/request-event-context.js";
import { createAssetCustomFieldRoute } from "./asset-custom-fields.js";

import type { ContextVariables } from "../lib/hono-schema.js";
import type { RequireDomainPermission } from "../middleware/auth.js";
import type { AssetCustomFieldService } from "../service/asset-custom-field.js";
import type { AssetService } from "../service/asset.js";

interface AssetRouteDependencies {
  requireDomainPermission: RequireDomainPermission;
}

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }));
const identifierParamValidator = zValidator(
  "param",
  z.object({ id: z.uuidv4(), identifierId: z.uuidv4() }),
);
const listAssetQueryValidator = zValidator(
  "query",
  z.object({
    includeCustomFields: z
      .stringbool({
        truthy: ["true"],
        falsy: ["false"],
      })
      .optional(),
  }),
);
export function createAssetRoute(
  assetService: AssetService,
  assetCustomFieldService: AssetCustomFieldService,
  { requireDomainPermission }: AssetRouteDependencies,
) {
  const asset = new Hono<{ Variables: ContextVariables }>();

  asset.get("/", requireDomainPermission("asset", "read"), listAssetQueryValidator, async (c) => {
    const query = c.req.valid("query");
    const assets =
      query.includeCustomFields === true
        ? await assetService.listAllWithCustomFields()
        : await assetService.listAll();
    return replyArray(c, assets);
  });

  asset.route(
    "/custom-fields",
    createAssetCustomFieldRoute(assetCustomFieldService, {
      requireDomainPermission,
    }),
  );

  asset.get(
    "/:id/custom-fields/available",
    requireDomainPermission("asset", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param");

      const definitions = await assetCustomFieldService.listAvailableDefinitionsForAsset(params.id);
      if (!definitions) {
        throw notFound("asset", params.id);
      }

      return replyArray(c, definitions);
    },
  );

  asset.get(
    "/:id/custom-fields",
    requireDomainPermission("asset", "read"),
    idParamValidator,
    async (c) => {
      const params = c.req.valid("param");

      const values = await assetCustomFieldService.listEffectiveValuesForAsset(params.id);
      if (!values) {
        throw notFound("asset", params.id);
      }

      return replyArray(c, values);
    },
  );

  asset.put(
    "/:id/custom-fields/associations",
    requireDomainPermission("asset", "write"),
    idParamValidator,
    zValidator("json", updateAssetCustomFieldAssociationsSchema),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const values = await assetCustomFieldService.replaceAssignmentsForAsset({
        assetId: params.id,
        fieldIds: body.fieldIds,
        eventContext: requestEventContext(c),
      });
      if (!values) {
        throw notFound("asset", params.id);
      }

      return replyArray(c, values);
    },
  );

  asset.put(
    "/:id/custom-fields",
    requireDomainPermission("asset", "write"),
    idParamValidator,
    zValidator("json", updateAssetCustomFieldValuesSchema),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");

      const values = await assetCustomFieldService.replaceValuesForAsset({
        assetId: params.id,
        values: body.values,
        eventContext: requestEventContext(c),
      });
      if (!values) {
        throw notFound("asset", params.id);
      }

      return replyArray(c, values);
    },
  );

  asset.post(
    "/:id/identifiers",
    requireDomainPermission("asset", "write"),
    idParamValidator,
    zValidator("json", createAssetIdentifierSchema),
    async (c) => {
      const params = c.req.valid("param");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const identifier = await assetService.addIdentifier({
        assetId: params.id,
        identifier: c.req.valid("json"),
        user,
        eventContext: requestEventContext(c),
      });
      if (!identifier) {
        throw notFound("asset", params.id);
      }

      return replyObject(c, identifier, true);
    },
  );

  asset.put(
    "/:id/identifiers/:identifierId",
    requireDomainPermission("asset", "write"),
    identifierParamValidator,
    zValidator("json", updateAssetIdentifierSchema),
    async (c) => {
      const params = c.req.valid("param");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const identifier = await assetService.updateIdentifierByID({
        assetId: params.id,
        identifierId: params.identifierId,
        identifier: c.req.valid("json"),
        user,
        eventContext: requestEventContext(c),
      });
      if (!identifier) {
        throw notFound("asset identifier", params.identifierId);
      }

      return replyObject(c, identifier);
    },
  );

  asset.delete(
    "/:id/identifiers/:identifierId",
    requireDomainPermission("asset", "write"),
    identifierParamValidator,
    async (c) => {
      const params = c.req.valid("param");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const identifier = await assetService.deleteIdentifierByID({
        assetId: params.id,
        identifierId: params.identifierId,
        user,
        eventContext: requestEventContext(c),
      });
      if (!identifier) {
        throw notFound("asset identifier", params.identifierId);
      }

      return replyObject(c, identifier);
    },
  );

  asset.get("/:id", requireDomainPermission("asset", "read"), idParamValidator, async (c) => {
    const params = c.req.valid("param");

    const assetResult = await assetService.getByID(params.id);
    if (!assetResult) {
      throw notFound("asset", params.id);
    }

    return replyObject(c, assetResult);
  });

  asset.post(
    "/",
    requireDomainPermission("asset", "write"),
    zValidator("json", createAssetSchema),
    async (c) => {
      const body = c.req.valid("json");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const createdAsset = await assetService.create({
        asset: body,
        user,
        eventContext: requestEventContext(c),
      });
      return replyObject(c, createdAsset, true);
    },
  );

  asset.patch(
    "/:id",
    requireDomainPermission("asset", "write"),
    idParamValidator,
    zValidator("json", updateAssetSchema),
    async (c) => {
      const params = c.req.valid("param");
      const body = c.req.valid("json");
      const user = c.get("user");

      if (!user) {
        throw unauthorized();
      }

      const updatedAsset = await assetService.updateByID({
        id: params.id,
        asset: body,
        user,
        eventContext: requestEventContext(c),
      });
      if (!updatedAsset) {
        throw notFound("asset", params.id);
      }

      return replyObject(c, updatedAsset);
    },
  );

  asset.delete("/:id", requireDomainPermission("asset", "delete"), idParamValidator, async (c) => {
    const params = c.req.valid("param");

    const deleted = await assetService.deleteByID(params.id, requestEventContext(c));
    if (!deleted) {
      throw notFound("asset", params.id);
    }

    return replyObject(c, deleted);
  });

  return asset;
}
