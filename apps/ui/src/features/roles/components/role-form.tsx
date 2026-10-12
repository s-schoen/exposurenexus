import { createRoleSchema } from "@exposurenexus/contracts/model/rbac";
import { useForm } from "@tanstack/react-form";
import { useMemo } from "react";

import { FormActions } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  PERMISSION_VERB_ORDER,
  comparePermissions,
  formatPermissionLabel,
  isBuiltInRoleId,
} from "@/features/roles/lib/role.ts";

import type {
  CreateRole,
  Permission,
  PermissionResource,
  Role,
  UpdateRole,
} from "@exposurenexus/contracts/model/rbac";

export type RoleFormMode = "create" | "edit";

export interface RoleFormValues {
  name: string;
  permissions: Array<Permission>;
}

interface RoleFormProps {
  mode: RoleFormMode;
  availablePermissions: Array<Permission>;
  defaultValues?: Partial<RoleFormValues>;
  onSubmit: (values: RoleFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

type PermissionGroup = {
  resource: PermissionResource;
  permissions: Array<Permission>;
};

const DEFAULT_ROLE_FORM_VALUES: RoleFormValues = {
  name: "",
  permissions: [],
};

export function rolePermissionKey(permission: Pick<Permission, "resource" | "verb">): string {
  return `${permission.resource}:${permission.verb}`;
}

function dedupePermissions(permissions: ReadonlyArray<Permission>) {
  const seenPermissions = new Set<string>();
  const dedupedPermissions: Array<Permission> = [];

  for (const permission of permissions) {
    const key = rolePermissionKey(permission);
    if (seenPermissions.has(key)) {
      continue;
    }

    seenPermissions.add(key);
    dedupedPermissions.push(permission);
  }

  return dedupedPermissions;
}

export function getAvailableRolePermissions(roles: ReadonlyArray<Role>): Array<Permission> {
  return dedupePermissions(
    roles.filter((role) => isBuiltInRoleId(role.id)).flatMap((role) => role.permissions),
  ).sort(comparePermissions);
}

export function groupAvailableRolePermissions(
  permissions: ReadonlyArray<Permission>,
): Array<PermissionGroup> {
  const groups = new Map<PermissionResource, Array<Permission>>();

  for (const permission of dedupePermissions(permissions).sort(comparePermissions)) {
    groups.set(permission.resource, [...(groups.get(permission.resource) ?? []), permission]);
  }

  return [...groups.entries()].map(([resource, groupedPermissions]) => ({
    resource,
    permissions: groupedPermissions,
  }));
}

export function mapRoleToFormValues(role: Role): RoleFormValues {
  return {
    name: role.name,
    permissions: dedupePermissions(role.permissions).sort(comparePermissions),
  };
}

export function mapCreateRoleFormValues(values: RoleFormValues): CreateRole {
  return {
    name: values.name.trim(),
    permissions: dedupePermissions(values.permissions).sort(comparePermissions),
  };
}

export function mapUpdateRoleFormValues(values: RoleFormValues): UpdateRole {
  return mapCreateRoleFormValues(values);
}

function permissionId(permission: Permission): string {
  return `role-permission-${permission.resource}-${permission.verb}`;
}

function hasPermission(permissions: ReadonlyArray<Permission>, permission: Permission) {
  const key = rolePermissionKey(permission);
  return permissions.some((currentPermission) => {
    return rolePermissionKey(currentPermission) === key;
  });
}

function togglePermission(
  permissions: ReadonlyArray<Permission>,
  permission: Permission,
  checked: boolean,
): Array<Permission> {
  const key = rolePermissionKey(permission);
  const remainingPermissions = permissions.filter(
    (currentPermission) => rolePermissionKey(currentPermission) !== key,
  );

  return checked
    ? dedupePermissions([...remainingPermissions, permission]).sort(comparePermissions)
    : remainingPermissions.sort(comparePermissions);
}

export function RoleForm({
  mode,
  availablePermissions,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
}: RoleFormProps) {
  const isCreateMode = mode === "create";
  const permissionGroups = useMemo(
    () => groupAvailableRolePermissions(availablePermissions),
    [availablePermissions],
  );
  const form = useForm({
    defaultValues: {
      ...DEFAULT_ROLE_FORM_VALUES,
      ...defaultValues,
      permissions: dedupePermissions(defaultValues?.permissions ?? []).sort(comparePermissions),
    },
    validators: {
      onSubmit: createRoleSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  const isSubmitting = form.state.isSubmitting;
  const resolvedSubmitLabel = submitLabel ?? (isCreateMode ? "Create role" : "Save changes");

  return (
    <form
      id={`role-form-${mode}`}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <form.Field
          name="name"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="security-analyst"
                  disabled={isSubmitting}
                />
                <FieldDescription>Letters, numbers, underscores and hyphens.</FieldDescription>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
        <form.Field
          name="permissions"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldSet>
                  <FieldLegend variant="label">Permissions</FieldLegend>
                  {permissionGroups.length === 0 ? (
                    <p className="text-13 text-muted-foreground">No permissions are available.</p>
                  ) : (
                    <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-1.5">
                      {permissionGroups.map((group) => {
                        const groupLabelId = `role-permission-group-${group.resource}`;

                        return (
                          <div
                            key={group.resource}
                            role="group"
                            aria-labelledby={groupLabelId}
                            className="flex min-h-10 flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-border bg-card px-3 py-1.5"
                          >
                            <span
                              id={groupLabelId}
                              className="min-w-0 flex-1 text-13 font-medium text-foreground"
                            >
                              {formatPermissionLabel(group.resource)}
                            </span>
                            {/* One slot per verb, so the verbs line up in columns across rows. */}
                            <div className="flex items-center gap-x-4">
                              {PERMISSION_VERB_ORDER.map((verb) => {
                                const permission = group.permissions.find(
                                  (candidate) => candidate.verb === verb,
                                );

                                if (!permission) {
                                  return <span key={verb} className="w-18" />;
                                }

                                return (
                                  <Field key={verb} orientation="horizontal" className="w-18">
                                    <Checkbox
                                      id={permissionId(permission)}
                                      checked={hasPermission(field.state.value, permission)}
                                      onCheckedChange={(value) => {
                                        field.handleChange(
                                          togglePermission(field.state.value, permission, !!value),
                                        );
                                        field.handleBlur();
                                      }}
                                      disabled={isSubmitting}
                                    />
                                    <FieldLabel htmlFor={permissionId(permission)}>
                                      {formatPermissionLabel(permission.verb)}
                                    </FieldLabel>
                                  </Field>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </FieldSet>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
      </FieldGroup>
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(submitting) => (
          <FormActions>
            <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner />}
              {resolvedSubmitLabel}
            </Button>
          </FormActions>
        )}
      />
    </form>
  );
}
