import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import { createListRolesQueryOptions } from "@/features/roles";
import { UserForm, mapCreateUserFormValues } from "@/features/users/components/user-form.tsx";
import { useUserLifecycle } from "@/features/users/hooks/use-user-lifecycle.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

export function CreateUserPage() {
  const navigate = useNavigate();
  const userLifecycle = useUserLifecycle();
  const roles = useSuspenseQuery(createListRolesQueryOptions());

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
