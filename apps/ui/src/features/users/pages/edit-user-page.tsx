import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";

import { createListRolesQueryOptions } from "@/features/roles";
import { UserForm, mapUpdateUserFormValues } from "@/features/users/components/user-form.tsx";
import { useUserLifecycle } from "@/features/users/hooks/use-user-lifecycle.ts";
import { createUserByIDQueryOptions } from "@/features/users/queries/users.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface EditUserPageProps {
  userId: string;
}

export function EditUserPage({ userId }: EditUserPageProps) {
  const navigate = useNavigate();
  const userLifecycle = useUserLifecycle();
  const user = useSuspenseQuery(createUserByIDQueryOptions(userId));
  const roles = useSuspenseQuery(createListRolesQueryOptions());

  usePageMeta({
    title: "Edit",
    icon: Users,
    breadcrumbs: [
      { label: "Users", to: "/users" },
      { label: user.data.displayName, to: `/users/${userId}` },
    ],
  });

  const handleCancel = async () => {
    await navigate({
      to: "/users/$id",
      params: { id: userId },
    });
  };

  const handleSubmit = async (values: Parameters<typeof mapUpdateUserFormValues>[0]) => {
    const updatedUser = await userLifecycle.updateUser(userId, mapUpdateUserFormValues(values));

    if (updatedUser) {
      await navigate({
        to: "/users/$id",
        params: { id: userId },
      });
    }
  };

  return (
    <UserForm
      mode="edit"
      roles={roles.data}
      defaultValues={{
        displayName: user.data.displayName,
        username: user.data.username,
        email: user.data.email,
        enabled: user.data.enabled,
        password: "",
        roleIds: user.data.roleIds,
      }}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  );
}
