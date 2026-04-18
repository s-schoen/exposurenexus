import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"

import { UserLabel } from "@/components/user-label"

type UserLabelStoryArgs = ComponentProps<typeof UserLabel> & {
  scenario: "success" | "loading" | "error"
  displayUsername: string
  name: string
  username: string
  email: string
}

function buildUserReply({
  userId,
  displayUsername,
  name,
  username,
  email
}: Pick<
  UserLabelStoryArgs,
  "userId" | "displayUsername" | "name" | "username" | "email"
>) {
  return {
    data: {
      items: [
        {
          id: userId,
          name,
          username,
          displayUsername,
          email,
          emailVerified: true,
          image: null,
          createdAt: new Date("2026-04-17T08:00:00.000Z").toISOString(),
          updatedAt: new Date("2026-04-17T09:00:00.000Z").toISOString()
        }
      ]
    }
  }
}

function buildUsers(
  args: Pick<
    UserLabelStoryArgs,
    "userId" | "displayUsername" | "name" | "username" | "email"
  >
) {
  return buildUserReply(args).data.items
}

function UserLabelStoryShell({
  scenario,
  userId,
  className,
  displayUsername,
  name,
  username,
  email
}: UserLabelStoryArgs) {
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })

    if (scenario === "success") {
      client.setQueryData(
        ["users"],
        buildUsers({ userId, displayUsername, name, username, email })
      )
    }

    if (scenario === "error") {
      client.setQueryData(["users"], [])
    }

    return client
  }, [scenario, userId])
  const [ready, setReady] = useState(scenario !== "loading")

  useLayoutEffect(() => {
    if (scenario !== "loading") {
      setReady(true)
      return
    }

    const originalFetch = globalThis.fetch

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)

      if (!requestUrl.endsWith("/api/users")) {
        return originalFetch(input, init)
      }

      return await new Promise<Response>(() => {})
    }

    setReady(true)

    return () => {
      globalThis.fetch = originalFetch
    }
  }, [scenario])

  useEffect(() => {
    queryClient.clear()

    if (scenario === "success") {
      queryClient.setQueryData(
        ["users"],
        buildUsers({ userId, displayUsername, name, username, email })
      )
    }

    if (scenario === "error") {
      queryClient.setQueryData(["users"], [])
    }
  }, [queryClient, scenario, userId, displayUsername, name, username, email])

  if (!ready) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-64 rounded-xl border border-border/70 bg-card p-4">
        <div className="min-h-5">
          <UserLabel userId={userId} className={className} />
        </div>
      </div>
    </QueryClientProvider>
  )
}

const meta = {
  title: "Components/UserLabel",
  component: UserLabel,
  parameters: {
    layout: "padded"
  },
  argTypes: {
    scenario: {
      control: "radio",
      options: ["success", "loading", "error"]
    }
  },
  args: {
    userId: "11111111-1111-4111-8111-111111111111",
    scenario: "success",
    displayUsername: "Alice Example",
    name: "Alice Example",
    username: "alice",
    email: "alice@example.com"
  },
  render: (args) => <UserLabelStoryShell {...args} />
} satisfies Meta<UserLabelStoryArgs>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Loading: Story = {
  args: {
    userId: "22222222-2222-4222-8222-222222222222",
    scenario: "loading"
  }
}

export const RequestFailure: Story = {
  args: {
    userId: "33333333-3333-4333-8333-333333333333",
    scenario: "error"
  }
}

export const DarkSurface: Story = {
  render: (args) => (
    <div className="dark rounded-2xl bg-background p-6">
      <UserLabelStoryShell {...args} />
    </div>
  )
}
