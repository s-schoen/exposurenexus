import { builtInRoleIds } from "@exposurenexus/contracts/model/rbac";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createCallable } from "react-call";

import { FormDialog, useFormDialogSubmit } from "@/components/form-dialog.tsx";
import { createListRolesQueryOptions } from "@/features/roles";
import { UserForm, mapCreateUserFormValues } from "@/features/users/components/user-form.tsx";
import { useUserLifecycle } from "@/features/users/hooks/use-user-lifecycle.ts";

import type { UserFormValues } from "@/features/users/components/user-form.tsx";
import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { PropsWithCall } from "react-call";

/** Creates a user and resolves to it, or to `null` when cancelled. */
export const CreateUserDialog = ({ call }: PropsWithCall<object, UserProfile | null, object>) => {
  const userLifecycle = useUserLifecycle();
  const { submitting, submit } = useFormDialogSubmit(userLifecycle.createUser, (user) =>
    call.end(user),
  );

  return (
    <FormDialog
      title="Create user"
      open={!call.ended}
      onOpenChange={(open) => {
        if (!open) call.end(null);
      }}
      submitting={submitting}
    >
      <CreateUserForm
        onSubmit={(values) => submit(mapCreateUserFormValues(values))}
        onCancel={() => call.end(null)}
      />
    </FormDialog>
  );
};

function CreateUserForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: UserFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const roles = useSuspenseQuery(createListRolesQueryOptions());

  return (
    <UserForm
      mode="create"
      roles={roles.data}
      defaultValues={{ roleIds: [builtInRoleIds.viewer] }}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

// needed because of hot reload issues with react-call: https://github.com/desko27/react-call/issues/31
const callable = createCallable(((props) => (
  <CreateUserDialog {...props} />
)) as typeof CreateUserDialog);
CreateUserDialog.call = callable.call;
CreateUserDialog.Root = callable.Root;
CreateUserDialog.callable = callable;
