import { Hono } from "hono"
import { createAsset, deleteAsset, getAsset, listAssets } from "../lib/asset.js"
import { notFound, replyArray, replyObject } from "../lib/reply.js"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod/v4"
import { assetSchema } from "@openvlp/types/model/asset"

const asset = new Hono()

const idParamValidator = zValidator("param", z.object({ id: z.uuidv4() }))

asset.get("/", async (c) => {
  const assets = await listAssets()
  return replyArray(c, assets)
})

asset.get("/:id", idParamValidator, async (c) => {
  const params = c.req.valid("param")

  const assetResult = await getAsset(params.id)
  if (!assetResult) {
    notFound("asset", params.id)
  }

  return replyObject(c, assetResult!)
})

asset.post(
  "/",
  zValidator("json", assetSchema.omit({ id: true })),
  async (c) => {
    const body = c.req.valid("json")

    const createdAsset = await createAsset({
      id: "",
      ...body
    })

    return replyObject(c, createdAsset!, true)
  }
)

asset.delete("/:id", idParamValidator, async (c) => {
  const params = c.req.valid("param")

  const deleted = await deleteAsset(params.id)
  if (!deleted) {
    notFound("asset", params.id)
  }

  return replyObject(c, deleted!)
})

export default asset
