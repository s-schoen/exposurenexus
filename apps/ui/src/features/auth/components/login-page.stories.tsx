import { useMemo } from "react"
import { fn } from "storybook/test"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { LoginRedirects } from "@/lib/login-redirect.ts"
import { LoginPage } from "@/features/auth/components/login-page.tsx"

interface LoginPageStoryArgs {
  redirect: string
  loginFails: boolean
}

function LoginPageStoryShell({ redirect, loginFails }: LoginPageStoryArgs) {
  const auth = useMemo(
    () => ({
      login: () =>
        loginFails
          ? Promise.reject(new Error("Invalid credentials"))
          : Promise.resolve()
    }),
    [loginFails]
  )
  const redirects = useMemo<LoginRedirects>(
    () => ({
      safeLoginRedirect: (value) => (typeof value === "string" ? value : "/")
    }),
    []
  )
  const navigate = useMemo(() => fn(), [])

  return (
    <LoginPage
      auth={auth}
      redirects={redirects}
      redirect={redirect}
      navigate={navigate}
    />
  )
}

const meta = {
  title: "Features/Auth/LoginPage",
  component: LoginPageStoryShell,
  parameters: {
    layout: "fullscreen"
  },
  args: {
    redirect: "/",
    loginFails: false
  },
  render: (args) => <LoginPageStoryShell {...args} />
} satisfies Meta<typeof LoginPageStoryShell>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const FailedLogin: Story = {
  args: {
    loginFails: true
  }
}
