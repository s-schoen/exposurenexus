export type RoleApplicationErrorCatalog = {
  "role.list_failed": { kind: "unexpected" };
  "role.get_failed": { kind: "unexpected"; details: { roleId: string } };
  "role.get_by_names_failed": {
    kind: "unexpected";
    details: { roleNames: readonly string[] };
  };
  "role.resolve_ids_failed": {
    kind: "unexpected";
    details: { roleNames: readonly string[] };
  };
  "role.unknown_ids": {
    kind: "validation";
    details: { roleIds: readonly string[] };
  };
  "role.resolve_names_failed": {
    kind: "unexpected";
    details: { roleIds: readonly string[] };
  };
  "role.create_conflict": { kind: "conflict"; details: { roleName: string } };
  "role.create_failed": { kind: "unexpected"; details: { roleName: string } };
  "role.protected_role": { kind: "denied"; details: { roleId: string } };
  "role.update_conflict": {
    kind: "conflict";
    details: { roleId: string; roleName: string };
  };
  "role.update_failed": { kind: "unexpected"; details: { roleId: string } };
  "role.assigned_to_users": {
    kind: "conflict";
    details: { roleId: string; roleName: string };
  };
  "role.delete_failed": { kind: "unexpected"; details: { roleId: string } };
};
