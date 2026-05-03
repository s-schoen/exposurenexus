import type { UserProfile } from "@openvlp/types/model/user"

export const ASSET_OWNER_OWNERLESS_LABEL = "No Owner"
export const ASSET_OWNER_UNKNOWN_LABEL = "Unknown owner"
export const ASSET_OWNER_LOADING_LABEL = "Loading owner"

export function createUserDisplayNameById(
  users: Array<UserProfile> | undefined
): Map<string, string> {
  return new Map(
    (users ?? []).map((user) => [user.id, user.displayName || user.username])
  )
}

export function formatAssetOwner(
  ownerId: string | null,
  userDisplayNameById: Map<string, string>,
  isLoading = false
): string {
  if (!ownerId) {
    return ASSET_OWNER_OWNERLESS_LABEL
  }

  const displayName = userDisplayNameById.get(ownerId)

  if (displayName) {
    return displayName
  }

  return isLoading ? ASSET_OWNER_LOADING_LABEL : ASSET_OWNER_UNKNOWN_LABEL
}

export function isAssetOwnerFallbackLabel(label: string): boolean {
  return (
    label === ASSET_OWNER_OWNERLESS_LABEL ||
    label === ASSET_OWNER_UNKNOWN_LABEL ||
    label === ASSET_OWNER_LOADING_LABEL
  )
}
