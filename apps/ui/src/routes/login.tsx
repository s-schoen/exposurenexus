import {
  createFileRoute,
  redirect as throwRedirect
} from "@tanstack/react-router"
import { useForm } from "@tanstack/react-form"
import { z } from "zod/v4"
import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Spinner } from "@/components/ui/spinner.tsx"

const formSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required")
})

export const Route = createFileRoute("/login")({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || "/"
  }),
  beforeLoad: async ({ context, search }) => {
    const hasSession = await context.auth.ensureSession()

    if (hasSession) {
      throw throwRedirect({ to: search.redirect })
    }
  },
  component: Login
})

export function Login() {
  const { auth } = Route.useRouteContext()
  const { redirect } = Route.useSearch()
  const navigate = Route.useNavigate()
  const [isLoading, setIsLoading] = useState(false)
  const [loginFailed, setLoginFailed] = useState(false)

  const form = useForm({
    defaultValues: {
      username: "",
      password: ""
    },
    validators: { onSubmit: formSchema },
    onSubmit: async ({ value }) => {
      setIsLoading(true)
      setLoginFailed(false)

      try {
        await auth.login(value.username, value.password)
        // @ts-ignore assume redirect is a valid route; nothing bad will happen if it's not
        navigate({ to: redirect })
      } catch (error) {
        console.error("Login failed:", error)
        setLoginFailed(true)
      } finally {
        setIsLoading(false)
      }
    }
  })

  return (
    <div className="flex items-center justify-center w-screen h-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>
            Enter your credentials below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="login-form"
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
          >
            <FieldGroup>
              <form.Field
                name="username"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor="username">Username</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="Username"
                      />
                    </Field>
                  )
                }}
              ></form.Field>
              <form.Field
                name="password"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <div className="flex items-center">
                        <FieldLabel htmlFor="password">Password</FieldLabel>
                      </div>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="Password"
                        type="password"
                      />
                    </Field>
                  )
                }}
              ></form.Field>
              <Field>
                <Button type="submit">
                  {isLoading && <Spinner />}
                  Login
                </Button>
              </Field>
              <div className="text-center text-sm text-muted-foreground">
                {loginFailed && (
                  <p className="text-red-500">Invalid username or password.</p>
                )}
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
