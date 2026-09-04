import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
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
import { createListRolesQueryOptions } from "@/features/roles";
import { UserForm, mapCreateUserFormValues } from "@/features/users/components/user-form.tsx";
import { useUserLifecycle } from "@/features/users/hooks/use-user-lifecycle.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

export function CreateUserPage() {
  const navigate = useNavigate();
  const userLifecycle = useUserLifecycle();
  const roles = useQuery(createListRolesQueryOptions());

  usePageMeta({
    title: "Create User",
    description: "Add a new platform user and set their initial credentials.",
  });

  const handleCancel = async () => {
    await navigate({
      to: "/users",
      search: (previous) => ({
        enabled: previous.enabled,
        filter: previous.filter,
        selected: undefined,
      }),
    });
  };

  const handleSubmit = async (values: Parameters<typeof mapCreateUserFormValues>[0]) => {
    const payload = mapCreateUserFormValues(values);
    const createdUser = await userLifecycle.createUser(payload);

    if (createdUser) {
      await navigate({
        to: "/users",
        search: (previous) => ({
          enabled: previous.enabled,
          filter: previous.filter,
          selected: undefined,
        }),
      });
    }
  };

  if (roles.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Create user</CardTitle>
          <CardDescription>Loading available roles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!roles.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Create user</CardTitle>
          <CardDescription>Available roles could not be loaded.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load roles</AlertTitle>
            <AlertDescription>{roles.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <UserForm
      mode="create"
      roles={roles.data}
      defaultValues={{ roleIds: [builtInRoleIds.viewer] }}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
