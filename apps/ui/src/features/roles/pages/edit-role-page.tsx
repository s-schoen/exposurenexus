import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CircleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
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
  const role = useQuery(createRoleByIDQueryOptions(roleId));
  const roles = useQuery(createListRolesQueryOptions());

  usePageMeta({
    title: role.data?.name ? `Edit ${role.data.name}` : "Edit Role",
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

  if (role.isPending || roles.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit role</CardTitle>
          <CardDescription>Loading role details and available permissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!role.data || !roles.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit role</CardTitle>
          <CardDescription>The selected role could not be loaded for editing.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load edit form</AlertTitle>
            <AlertDescription>
              {role.error?.message ??
                roles.error?.message ??
                "The API did not return the required role data."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

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
