import { createLogger } from "../logging.js"
import type { Asset } from "@openvlp/types/model/asset"
import { db } from "../db/index.js"

const logger = createLogger("assets")

export async function listAssets(): Promise<Asset[]> {
  const data = await db.selectFrom("asset").selectAll().execute()
  return Promise.resolve(data)
}
