import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";

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
    title: "Edit",
    heading: "Edit role",
    icon: KeyRound,
    breadcrumbs: [
      { label: "Roles", to: "/settings/roles" },
      { label: role.data.name, to: `/settings/roles/${roleId}` },
    ],
  });

  const handleCancel = async () => {
    await navigate({
      to: "/settings/roles/$id",
      params: { id: roleId },
    });
  };

  const handleSubmit = async (values: Parameters<typeof mapUpdateRoleFormValues>[0]) => {
    const payload = mapUpdateRoleFormValues(values);
    const updatedRole = await roleLifecycle.updateRole(roleId, payload);

    if (updatedRole) {
      await navigate({
        to: "/settings/roles/$id",
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
