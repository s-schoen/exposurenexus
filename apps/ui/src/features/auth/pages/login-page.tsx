import { authLoginSchema } from "@exposurenexus/contracts/api";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";

import type { AuthState } from "@/features/auth/providers/auth-provider.tsx";
import type { LoginRedirects } from "@/features/auth/routing/login-redirect.ts";

interface LoginPageProps {
  auth: Pick<AuthState, "login">;
  redirects: LoginRedirects;
  redirect: string;
  navigate: (options: { href: string }) => Promise<void>;
}

export function LoginPage({ auth, redirects, redirect, navigate }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loginFailed, setLoginFailed] = useState(false);

  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
    validators: { onSubmit: authLoginSchema },
    onSubmit: async ({ value }) => {
      setIsLoading(true);
      setLoginFailed(false);

      try {
        await auth.login(value.username, value.password);
        await navigate({
          href: redirects.safeLoginRedirect(redirect),
        });
      } catch (error) {
        console.error("Login failed:", error);
        setLoginFailed(true);
      } finally {
        setIsLoading(false);
      }
    },
  });

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-90">
        <CardContent>
          <h1 className="mb-6 flex items-center justify-center gap-2 text-sm font-medium text-foreground">
            <img src="/logo.png" alt="" className="size-6 shrink-0" />
            ExposureNexus
          </h1>
          <form
            id="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field
                name="username"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Username</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        autoComplete="username"
                      />
                    </Field>
                  );
                }}
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
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                        type="password"
                        autoComplete="current-password"
                      />
                    </Field>
                  );
                }}
              />
              {loginFailed && (
                <p role="alert" className="text-13 text-destructive">
                  Invalid username or password.
                </p>
              )}
              <Button type="submit" size="lg" className="w-full">
                {isLoading && <Spinner />}
                Sign in
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
