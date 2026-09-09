import type { Role, CreateRole, UpdateRole } from "@exposurenexus/contracts/model/rbac";

export interface CreateRoleCommand {
  role: CreateRole;
  performedBy: string;
}

export interface UpdateRoleByIDCommand {
  id: string;
  role: UpdateRole;
  performedBy: string;
}

export interface DeleteRoleByIDCommand {
  id: string;
  performedBy: string;
}

export interface RoleCreatedOutcome {
  current: Role;
  performedBy: string;
}

export interface RoleUpdatedOutcome {
  previous: Role;
  current: Role;
  changed: boolean;
  performedBy: string;
}

export interface RoleDeletedOutcome {
  previous: Role;
  performedBy: string;
}

export interface IdentityRoles {
  listAll(): Promise<Role[]>;
  getByID(id: string): Promise<Role | null>;
  getByNames(names: readonly string[]): Promise<Role[]>;
  resolveRoleIdsFromNames(names: readonly string[]): Promise<string[]>;
  requireRoleNamesFromIds(ids: readonly string[]): Promise<string[]>;
  create(command: CreateRoleCommand): Promise<RoleCreatedOutcome>;
  updateByID(command: UpdateRoleByIDCommand): Promise<RoleUpdatedOutcome | null>;
  deleteByID(command: DeleteRoleByIDCommand): Promise<RoleDeletedOutcome | null>;
}
