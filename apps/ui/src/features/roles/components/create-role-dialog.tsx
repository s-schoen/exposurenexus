import { useSuspenseQuery } from "@tanstack/react-query";
import { createCallable } from "react-call";

import { FormDialog, useFormDialogSubmit } from "@/components/form-dialog.tsx";
import {
  RoleForm,
  getAvailableRolePermissions,
  mapCreateRoleFormValues,
} from "@/features/roles/components/role-form.tsx";
import { useRoleLifecycle } from "@/features/roles/hooks/use-role-lifecycle.ts";
import { createListRolesQueryOptions } from "@/features/roles/queries/roles.ts";

import type { RoleFormValues } from "@/features/roles/components/role-form.tsx";
import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { PropsWithCall } from "react-call";

/** Creates a role and resolves to it, or to `null` when cancelled. */
export const CreateRoleDialog = ({ call }: PropsWithCall<object, Role | null, object>) => {
  const roleLifecycle = useRoleLifecycle();
  const { submitting, submit } = useFormDialogSubmit(roleLifecycle.createRole, (role) =>
    call.end(role),
  );

  return (
    <FormDialog
      title="Create role"
      size="wide"
      open={!call.ended}
      onOpenChange={(open) => {
        if (!open) call.end(null);
      }}
      submitting={submitting}
    >
      <CreateRoleForm
        onSubmit={(values) => submit(mapCreateRoleFormValues(values))}
        onCancel={() => call.end(null)}
      />
    </FormDialog>
  );
};

function CreateRoleForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (values: RoleFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const roles = useSuspenseQuery(createListRolesQueryOptions());

  return (
    <RoleForm
      mode="create"
      availablePermissions={getAvailableRolePermissions(roles.data)}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

// needed because of hot reload issues with react-call: https://github.com/desko27/react-call/issues/31
const callable = createCallable(((props) => (
  <CreateRoleDialog {...props} />
)) as typeof CreateRoleDialog);
CreateRoleDialog.call = callable.call;
CreateRoleDialog.Root = callable.Root;
CreateRoleDialog.callable = callable;
