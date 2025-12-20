import { Hono } from "hono"
import { listAssets } from "../lib/asset.js"
import { replyArray } from "../lib/reply.js"

const asset = new Hono()

asset.get("/", async (c) => {
  const assets = await listAssets()
  return replyArray(c, assets)
})

export default asset
