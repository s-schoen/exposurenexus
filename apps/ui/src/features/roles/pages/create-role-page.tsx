import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import {
  RoleForm,
  getAvailableRolePermissions,
  mapCreateRoleFormValues,
} from "@/features/roles/components/role-form.tsx";
import { useRoleLifecycle } from "@/features/roles/hooks/use-role-lifecycle.ts";
import { createListRolesQueryOptions } from "@/features/roles/queries/roles.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

export function CreateRolePage() {
  const navigate = useNavigate();
  const roleLifecycle = useRoleLifecycle();
  const roles = useSuspenseQuery(createListRolesQueryOptions());

  usePageMeta({
    title: "Create Role",
    description: "Add a custom role and choose its permission grants.",
  });

  const handleCancel = async () => {
    await navigate({
      to: "/roles",
      search: (previous) => ({
        filter: previous.filter,
        kind: previous.kind,
        selected: undefined,
      }),
    });
  };

  const handleSubmit = async (values: Parameters<typeof mapCreateRoleFormValues>[0]) => {
    const payload = mapCreateRoleFormValues(values);
    const role = await roleLifecycle.createRole(payload);

    if (role) {
      await navigate({
        to: "/roles/$id",
        params: { id: role.id },
      });
    }
  };

  return (
    <RoleForm
      mode="create"
      availablePermissions={getAvailableRolePermissions(roles.data)}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
