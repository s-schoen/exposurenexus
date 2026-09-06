import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import {
  RoleForm,
  getAvailableRolePermissions,
  mapRoleToFormValues,
  mapUpdateRoleFormValues,
} from "@/features/roles/components/role-form.tsx";
import { useRoleLifecycle } from "@/features/roles/hooks/use-role-lifecycle.ts";
import {
  createListRolesQueryOptions,
  createRoleByIDQueryOptions,
} from "@/features/roles/queries/roles.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface EditRolePageProps {
  roleId: string;
}

export function EditRolePage({ roleId }: EditRolePageProps) {
  const navigate = useNavigate();
  const roleLifecycle = useRoleLifecycle();
  const role = useSuspenseQuery(createRoleByIDQueryOptions(roleId));
  const roles = useSuspenseQuery(createListRolesQueryOptions());

  usePageMeta({
    title: role.data.name ? `Edit ${role.data.name}` : "Edit Role",
    description: "Update the role name and permission grants.",
  });

  const handleCancel = async () => {
    await navigate({
      to: "/roles/$id",
      params: { id: roleId },
    });
  };

  const handleSubmit = async (values: Parameters<typeof mapUpdateRoleFormValues>[0]) => {
    const payload = mapUpdateRoleFormValues(values);
    const updatedRole = await roleLifecycle.updateRole(roleId, payload);

    if (updatedRole) {
      await navigate({
        to: "/roles/$id",
        params: { id: roleId },
      });
    }
  };

  return (
    <RoleForm
      mode="edit"
      availablePermissions={getAvailableRolePermissions(roles.data)}
      defaultValues={mapRoleToFormValues(role.data)}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
