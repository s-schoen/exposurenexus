export enum AssetType {
  Host = "host",
  Software = "software",
  Container = "container"
}

export interface Asset {
  id: string
  name: string
  type: AssetType
}
