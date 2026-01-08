import { Hono } from "hono"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import { createAssetSchema } from "@openvlp/types/model/asset"
import * as assetService from "../service/asset.js"

const asset = new Hono()

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

asset.get("/", async (c) => {
  const assets = await assetService.listAll()
  return replyArray(c, assets)
})

asset.get("/:id", idParamValidator, async (c) => {
  const params = c.req.valid("param")

  const assetResult = await assetService.getByID(params.id)
  if (!assetResult) {
    notFound("asset", params.id)
  }

  return replyObject(c, assetResult!)
})

asset.post("/", zValidator("json", createAssetSchema), async (c) => {
  const body = c.req.valid("json")
  const createdAsset = await assetService.create(body)
  return replyObject(c, createdAsset!, true)
})

asset.delete("/:id", idParamValidator, async (c) => {
  const params = c.req.valid("param")

  const deleted = await assetService.deleteByID(params.id)
  if (!deleted) {
    notFound("asset", params.id)
  }

  return replyObject(c, deleted!)
})

export default asset
