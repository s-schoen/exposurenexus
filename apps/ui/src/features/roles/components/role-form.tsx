import {
  PermissionResource,
  PermissionVerb,
  createRoleSchema,
} from "@exposurenexus/contracts/model/rbac";
import { useForm } from "@tanstack/react-form";
import { useMemo } from "react";

import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
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
import { formatPermissionLabel, isBuiltInRoleId } from "@/features/roles/lib/role.ts";

import type { CreateRole, Permission, Role, UpdateRole } from "@exposurenexus/contracts/model/rbac";

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

const permissionResourceOrder = Object.values(PermissionResource);
const permissionVerbOrder = Object.values(PermissionVerb);

export function rolePermissionKey(permission: Pick<Permission, "resource" | "verb">): string {
  return `${permission.resource}:${permission.verb}`;
}

function comparePermissions(left: Permission, right: Permission): number {
  const resourceOrder =
    permissionResourceOrder.indexOf(left.resource) -
    permissionResourceOrder.indexOf(right.resource);

  if (resourceOrder !== 0) {
    return resourceOrder;
  }

  return permissionVerbOrder.indexOf(left.verb) - permissionVerbOrder.indexOf(right.verb);
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
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader>
        <CardTitle>{isCreateMode ? "Create role" : "Edit role"}</CardTitle>
        <CardDescription>
          {isCreateMode
            ? "Add a custom role and choose its permission grants."
            : "Update the role name and permission grants."}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
                    <FieldDescription>
                      Use letters, numbers, underscores, and hyphens.
                    </FieldDescription>
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
                      <FieldLegend>Permissions</FieldLegend>
                      <FieldDescription>
                        Select the resource actions granted to this role.
                      </FieldDescription>
                      {permissionGroups.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No permissions are available.
                        </p>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {permissionGroups.map((group) => (
                            <fieldset
                              key={group.resource}
                              className="rounded-lg border border-border/70 bg-muted/20 p-3"
                            >
                              <legend className="px-1 text-sm font-medium text-foreground">
                                {formatPermissionLabel(group.resource)}
                              </legend>
                              <div className="mt-2 grid gap-2">
                                {group.permissions.map((permission) => {
                                  const checked = hasPermission(field.state.value, permission);

                                  return (
                                    <Field
                                      key={rolePermissionKey(permission)}
                                      orientation="horizontal"
                                    >
                                      <Checkbox
                                        id={permissionId(permission)}
                                        checked={checked}
                                        onCheckedChange={(value) => {
                                          field.handleChange(
                                            togglePermission(
                                              field.state.value,
                                              permission,
                                              !!value,
                                            ),
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
                            </fieldset>
                          ))}
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
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting && <Spinner />}
                  {resolvedSubmitLabel}
                </Button>
              </div>
            )}
          />
        </form>
      </CardContent>
    </Card>
  );
}
