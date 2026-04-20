import { Check, ChevronsUpDownIcon } from "lucide-react"
import { useForm } from "@tanstack/react-form"
import { useMemo, useState } from "react"
import { z } from "zod/v4"
import { createUserSchema, updateUserSchema } from "@openvlp/types/model/user"
import type { CreateUser, UpdateUser } from "@openvlp/types/model/user"
import type { Role } from "@openvlp/types/model/rbac"
import { Button } from "@/components/ui/button.tsx"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from "@/components/ui/command.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover.tsx"
import { Spinner } from "@/components/ui/spinner.tsx"

export type UserFormMode = "create" | "edit"

export interface UserFormValues {
  displayUsername: string
  username: string
  email: string
  password: string
  roleIds: Array<string>
}

interface UserFormProps {
  mode: UserFormMode
  roles: Array<Role>
  defaultValues?: Partial<UserFormValues>
  onSubmit: (values: UserFormValues) => Promise<void> | void
  onCancel: () => void
  submitLabel?: string
}

const roleIdsFieldSchema = z
  .array(z.uuidv4())
  .min(1, "Select at least one role")

const createUserFormSchema = z.strictObject({
  displayUsername: createUserSchema.shape.displayUsername,
  username: createUserSchema.shape.username,
  email: createUserSchema.shape.email,
  password: createUserSchema.shape.password,
  roleIds: roleIdsFieldSchema
})

const editUserFormSchema = z.strictObject({
  displayUsername: updateUserSchema.shape.displayUsername,
  username: z.string(),
  email: updateUserSchema.shape.email,
  password: z.union([z.literal(""), updateUserSchema.shape.password.unwrap()]),
  roleIds: roleIdsFieldSchema
})

const DEFAULT_USER_FORM_VALUES: UserFormValues = {
  displayUsername: "",
  username: "",
  email: "",
  password: "",
  roleIds: []
}

interface RoleMultiSelectProps {
  id: string
  roles: Array<Role>
  value: Array<string>
  onChange: (value: Array<string>) => void
  onBlur: () => void
  disabled?: boolean
  invalid?: boolean
}

function RoleMultiSelect({
  id,
  roles,
  value,
  onChange,
  onBlur,
  disabled = false,
  invalid = false
}: RoleMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const popupId = `${id}-popover`
  const roleNameById = useMemo(
    () => new Map(roles.map((role) => [role.id, role.name])),
    [roles]
  )
  const selectedRoleNames = value.flatMap((roleId) => {
    const roleName = roleNameById.get(roleId)
    return roleName ? [roleName] : []
  })

  const selectedSummary =
    value.length === 0
      ? "Select roles..."
      : selectedRoleNames.length === value.length && selectedRoleNames.length <= 2
        ? selectedRoleNames.join(", ")
        : `${value.length} roles selected`

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)

    if (!nextOpen) {
      onBlur()
    }
  }

  const handleToggleRole = (roleId: string) => {
    const nextSelection = value.includes(roleId)
      ? value.filter((currentRoleId) => currentRoleId !== roleId)
      : [...value, roleId]

    onChange(nextSelection)
    onBlur()
  }

  const handleClearSelection = () => {
    onChange([])
    onBlur()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        nativeButton={true}
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-controls={popupId}
            aria-expanded={open}
            aria-invalid={invalid}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span
              className={
                value.length === 0
                  ? "truncate text-muted-foreground"
                  : "truncate"
              }
            >
              {selectedSummary}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        }
      ></PopoverTrigger>
      <PopoverContent
        id={popupId}
        aria-label="Role selection"
        className="w-(--anchor-width) min-w-72 rounded-2xl p-0"
      >
        <Command className="bg-background p-2">
          <CommandInput placeholder="Search roles..." />
          <CommandList className="max-h-full">
            <CommandEmpty>No roles available</CommandEmpty>
            <CommandGroup className="max-h-75 space-y-1 overflow-y-auto overflow-x-hidden p-2">
              {roles.map((role) => {
                const isSelected = value.includes(role.id)

                return (
                  <CommandItem
                    key={role.id}
                    value={role.name}
                    className="rounded-lg bg-transparent px-3 py-2 data-selected:bg-transparent"
                    onSelect={() => handleToggleRole(role.id)}
                  >
                    <span className="truncate">{role.name}</span>
                    {isSelected && <Check className="ml-auto size-4 text-foreground" />}
                  </CommandItem>
                )
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
  )
}

export function mapCreateUserFormValues(values: UserFormValues): CreateUser {
  const displayUsername = values.displayUsername.trim()

  return {
    name: displayUsername,
    displayUsername,
    username: values.username.trim(),
    email: values.email.trim(),
    password: values.password,
    roleIds: values.roleIds
  }
}

export function mapUpdateUserFormValues(
  values: UserFormValues,
  image: string | null = null
): UpdateUser {
  const displayUsername = values.displayUsername.trim()

  return {
    name: displayUsername,
    displayUsername,
    email: values.email.trim(),
    image,
    roleIds: values.roleIds,
    ...(values.password === "" ? {} : { password: values.password })
  }
}

export function UserForm({
  mode,
  roles,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel
}: UserFormProps) {
  const isCreateMode = mode === "create"
  const formSchema = isCreateMode ? createUserFormSchema : editUserFormSchema
  const form = useForm({
    defaultValues: {
      ...DEFAULT_USER_FORM_VALUES,
      ...defaultValues
    },
    validators: {
      onSubmit: formSchema
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value)
    }
  })

  const isSubmitting = form.state.isSubmitting
  const resolvedSubmitLabel =
    submitLabel ?? (isCreateMode ? "Create user" : "Save changes")

  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader>
        <CardTitle>{isCreateMode ? "Create user" : "Edit user"}</CardTitle>
        <CardDescription>
          {isCreateMode
            ? "Add a new platform user and set their initial login credentials."
            : "Update the visible account details. Leave the password blank to keep the current one."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          id={`user-form-${mode}`}
          onSubmit={(event) => {
            event.preventDefault()
            form.handleSubmit()
          }}
          className="flex flex-col gap-6"
        >
          <FieldGroup>
            <form.Field
              name="displayUsername"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                      placeholder="Alice Example"
                    />
                    <FieldDescription>
                      This value is shown in the UI and is also sent as the user
                      name.
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            {isCreateMode && (
              <form.Field
                name="username"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={isInvalid}
                        placeholder="alice"
                        autoComplete="username"
                      />
                      <FieldDescription>
                        This is used for sign-in and cannot be changed later.
                      </FieldDescription>
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
            )}
            <form.Field
              name="email"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="email"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                      placeholder="alice@example.com"
                      autoComplete="email"
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            <form.Field
              name="roleIds"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

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
                    <FieldDescription>
                      Assign one or more roles to control the user&apos;s access
                      across the platform.
                    </FieldDescription>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
            <form.Field
              name="password"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      type="password"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-invalid={isInvalid}
                      placeholder={
                        isCreateMode
                          ? "Set an initial password"
                          : "Leave blank to keep the current password"
                      }
                      autoComplete={isCreateMode ? "new-password" : "off"}
                    />
                    {!isCreateMode && (
                      <FieldDescription>
                        Only enter a value here when you want to reset the
                        password.
                      </FieldDescription>
                    )}
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                )
              }}
            />
          </FieldGroup>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Spinner />}
              {resolvedSubmitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
