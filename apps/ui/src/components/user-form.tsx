import { useForm } from "@tanstack/react-form"
import { z } from "zod/v4"
import { createUserSchema, updateUserSchema } from "@openvlp/types/model/user"
import type { CreateUser, UpdateUser } from "@openvlp/types/model/user"
import { Button } from "@/components/ui/button.tsx"
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
import { Spinner } from "@/components/ui/spinner.tsx"

export type UserFormMode = "create" | "edit"

export interface UserFormValues {
  displayUsername: string
  username: string
  email: string
  password: string
}

interface UserFormProps {
  mode: UserFormMode
  defaultValues?: Partial<UserFormValues>
  onSubmit: (values: UserFormValues) => Promise<void> | void
  onCancel: () => void
  submitLabel?: string
}

const createUserFormSchema = z.strictObject({
  displayUsername: createUserSchema.shape.displayUsername,
  username: createUserSchema.shape.username,
  email: createUserSchema.shape.email,
  password: createUserSchema.shape.password
})

const editUserFormSchema = z.strictObject({
  displayUsername: updateUserSchema.shape.displayUsername,
  username: z.string(),
  email: updateUserSchema.shape.email,
  password: z.union([z.literal(""), updateUserSchema.shape.password.unwrap()])
})

const DEFAULT_USER_FORM_VALUES: UserFormValues = {
  displayUsername: "",
  username: "",
  email: "",
  password: ""
}

export function mapCreateUserFormValues(values: UserFormValues): CreateUser {
  const displayUsername = values.displayUsername.trim()

  return {
    name: displayUsername,
    displayUsername,
    username: values.username.trim(),
    email: values.email.trim(),
    password: values.password
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
    ...(values.password === "" ? {} : { password: values.password })
  }
}

export function UserForm({
  mode,
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
