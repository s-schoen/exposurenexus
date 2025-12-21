import { z } from "zod/v4"

export enum AssetType {
  Host = "host",
  Software = "software",
  Container = "container"
}

export const assetSchema = z.strictObject({
  id: z.uuidv4(),
  name: z.string(),
  type: z.enum(AssetType)
})

export type Asset = z.infer<typeof assetSchema>
