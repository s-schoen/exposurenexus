import type { PermissionResource, PermissionVerb } from "@exposurenexus/contracts/model/rbac";

export type ResourcePermissionVerbAssignment = Partial<
  Record<PermissionResource, readonly PermissionVerb[]>
>;

export interface IdentityAuthorization {
  userHasPermission(
    userId: string,
    permissions: ResourcePermissionVerbAssignment,
  ): Promise<boolean>;
}
