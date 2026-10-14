import {
  createUserProfileSchema,
  updateUserProfileSchema,
} from "@exposurenexus/contracts/model/user";
import { useForm } from "@tanstack/react-form";
import { Check, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { z } from "zod/v4";

import { FormActions } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { UserStatusLabel } from "@/features/users/components/user-status.tsx";

import type { Role } from "@exposurenexus/contracts/model/rbac";
import type { CreateUserProfile, UpdateUserProfile } from "@exposurenexus/contracts/model/user";

export type UserFormMode = "create" | "edit";

export interface UserFormValues {
  displayName: string;
  username: string;
  email: string;
  enabled: boolean;
  password: string;
  roleIds: Array<string>;
}

interface UserFormProps {
  mode: UserFormMode;
  roles: Array<Role>;
  defaultValues?: Partial<UserFormValues>;
  onSubmit: (values: UserFormValues) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

const roleIdsFieldSchema = z.array(z.uuidv4()).min(1, "Select at least one role");

const createUserFormSchema = z.strictObject({
  displayName: createUserProfileSchema.shape.displayName,
  username: createUserProfileSchema.shape.username,
  email: createUserProfileSchema.shape.email,
  enabled: createUserProfileSchema.shape.enabled,
  password: createUserProfileSchema.shape.password,
  roleIds: roleIdsFieldSchema,
});

const editUserFormSchema = z.strictObject({
  displayName: updateUserProfileSchema.shape.displayName,
  username: z.string(),
  email: updateUserProfileSchema.shape.email,
  enabled: updateUserProfileSchema.shape.enabled,
  password: z.string(),
  roleIds: roleIdsFieldSchema,
});

const DEFAULT_USER_FORM_VALUES: UserFormValues = {
  displayName: "",
  username: "",
  email: "",
  enabled: true,
  password: "",
  roleIds: [],
};

interface RoleMultiSelectProps {
  id: string;
  roles: Array<Role>;
  value: Array<string>;
  onChange: (value: Array<string>) => void;
  onBlur: () => void;
  disabled?: boolean;
  invalid?: boolean;
}

function RoleMultiSelect({
  id,
  roles,
  value,
  onChange,
  onBlur,
  disabled = false,
  invalid = false,
}: RoleMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const popupId = `${id}-popover`;
  const roleNameById = useMemo(() => new Map(roles.map((role) => [role.id, role.name])), [roles]);
  const selectedRoleNames = value.flatMap((roleId) => {
    const roleName = roleNameById.get(roleId);
    return roleName ? [roleName] : [];
  });

  const selectedSummary =
    value.length === 0
      ? "Select roles…"
      : selectedRoleNames.length === value.length && selectedRoleNames.length <= 2
        ? selectedRoleNames.join(", ")
        : `${value.length} roles selected`;

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      onBlur();
    }
  };

  const handleToggleRole = (roleId: string) => {
    const nextSelection = value.includes(roleId)
      ? value.filter((currentRoleId) => currentRoleId !== roleId)
      : [...value, roleId];

    onChange(nextSelection);
    onBlur();
  };

  const handleClearSelection = () => {
    onChange([]);
    onBlur();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        nativeButton={true}
        render={
          <Button
            id={id}
            type="button"
            variant="field"
            size="lg"
            role="combobox"
            aria-controls={popupId}
            aria-expanded={open}
            aria-invalid={invalid}
            disabled={disabled}
            className="w-full"
          >
            <span className={value.length === 0 ? "truncate text-subtle-foreground" : "truncate"}>
              {selectedSummary}
            </span>
            <ChevronDownIcon data-icon="inline-end" className="text-muted-foreground" />
          </Button>
        }
      ></PopoverTrigger>
      <PopoverContent
        id={popupId}
        aria-label="Role selection"
        className="w-(--anchor-width) min-w-72 p-0"
      >
        <Command>
          <CommandInput aria-label="Search roles" placeholder="Search roles…" />
          <CommandList className="max-h-full">
            <CommandEmpty>No roles available</CommandEmpty>
            <CommandGroup className="max-h-75 space-y-1 overflow-y-auto overflow-x-hidden p-2">
              {roles.map((role) => {
                const isSelected = value.includes(role.id);

                return (
                  <CommandItem
                    key={role.id}
                    value={role.name}
                    onSelect={() => handleToggleRole(role.id)}
                  >
                    <span className="truncate">{role.name}</span>
                    {isSelected && <Check className="ml-auto size-4 text-foreground" />}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
        {value.length > 0 && (
          <div className="border-t border-border/70 px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-center"
              onClick={handleClearSelection}
            >
              Clear selection
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function mapCreateUserFormValues(values: UserFormValues): CreateUserProfile {
  const displayName = values.displayName.trim();

  return {
    displayName,
    username: values.username.trim(),
    email: values.email.trim(),
    enabled: values.enabled,
    password: values.password,
    roleIds: values.roleIds,
  };
}

export function mapUpdateUserFormValues(values: UserFormValues): UpdateUserProfile {
  const displayName = values.displayName.trim();

  return {
    displayName,
    email: values.email.trim(),
    enabled: values.enabled,
    roleIds: values.roleIds,
    ...(values.password === "" ? {} : { password: values.password }),
  };
}

export function UserForm({
  mode,
  roles,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
}: UserFormProps) {
  const isCreateMode = mode === "create";
  const formSchema = isCreateMode ? createUserFormSchema : editUserFormSchema;
  const form = useForm({
    defaultValues: {
      ...DEFAULT_USER_FORM_VALUES,
      ...defaultValues,
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  const isSubmitting = form.state.isSubmitting;
  const resolvedSubmitLabel = submitLabel ?? (isCreateMode ? "Create user" : "Save changes");

  return (
    <form
      id={`user-form-${mode}`}
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <form.Field
          name="displayName"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="Alice Example"
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
        {isCreateMode && (
          <form.Field
            name="username"
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                  <Input
                    className="font-mono"
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    aria-invalid={isInvalid}
                    placeholder="alice"
                    autoComplete="username"
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          />
        )}
        <form.Field
          name="email"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="email"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  placeholder="alice@example.com"
                  autoComplete="email"
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
        <form.Field
          name="roleIds"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Roles</FieldLabel>
                <RoleMultiSelect
                  id={field.name}
                  roles={roles}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  disabled={isSubmitting}
                  invalid={isInvalid}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
        <form.Field
          name="enabled"
          children={(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Status</FieldLabel>
              <Select
                value={String(field.state.value)}
                name={field.name}
                onValueChange={(value) => {
                  field.handleChange(value === "true");
                  field.handleBlur();
                }}
              >
                <SelectTrigger id={field.name} className="w-full" disabled={isSubmitting}>
                  <SelectValue>
                    <UserStatusLabel enabled={field.state.value} />
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {[true, false].map((enabled) => (
                    <SelectItem key={String(enabled)} value={String(enabled)}>
                      <UserStatusLabel enabled={enabled} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
        <form.Field
          name="password"
          children={(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="password"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  aria-invalid={isInvalid}
                  placeholder={
                    isCreateMode
                      ? "Set an initial password"
                      : "Leave blank to keep the current password"
                  }
                  autoComplete={isCreateMode ? "new-password" : "off"}
                />
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </Field>
            );
          }}
        />
      </FieldGroup>
      <FormActions>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Spinner />}
          {resolvedSubmitLabel}
        </Button>
      </FormActions>
    </form>
  );
}
