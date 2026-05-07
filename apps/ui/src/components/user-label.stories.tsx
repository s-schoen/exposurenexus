import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"
import type { UserProfile } from "@exposurenexus/types/model/user"

import { UserLabel } from "@/components/user-label"

const alice: UserProfile = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "alice",
  displayName: "Alice Example",
  email: "alice@example.com",
  enabled: true,
  roleIds: []
}

const disabledUser: UserProfile = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "disabled",
  displayName: "Taylor Example",
  email: "disabled@example.com",
  enabled: false,
  roleIds: []
}

type UserLabelStoryArgs = ComponentProps<typeof UserLabel> & {
  scenario: "loading" | "success" | "unknown"
}

function UserLabelStoryShell({
  scenario,
  user,
  userId,
  className,
  emptyLabel,
  unknownLabel,
  variant
}: UserLabelStoryArgs) {
  const users = useMemo(() => [alice, disabledUser], [])
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    })

    if (scenario === "success") {
      client.setQueryData(["users"], users)
    }

    if (scenario === "unknown") {
      client.setQueryData(["users"], [])
    }

    return client
  }, [scenario, users])
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
      queryClient.setQueryData(["users"], users)
    }

    if (scenario === "unknown") {
      queryClient.setQueryData(["users"], [])
    }
  }, [queryClient, scenario, users])

  if (!ready) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-64 rounded-xl border border-border/70 bg-card p-4">
        <div className="min-h-5">
          <UserLabel
            user={user}
            userId={userId}
            className={className}
            emptyLabel={emptyLabel}
            unknownLabel={unknownLabel}
            variant={variant}
          />
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
      options: ["success", "loading", "unknown"]
    },
    variant: {
      control: "radio",
      options: ["text", "chip"]
    }
  },
  args: {
    userId: alice.id,
    scenario: "success",
    variant: "text"
  },
  render: (args) => <UserLabelStoryShell {...args} />
} satisfies Meta<UserLabelStoryArgs>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const ResolvedProfile: Story = {
  args: {
    user: alice,
    userId: undefined
  }
}

export const Chip: Story = {
  args: {
    variant: "chip"
  }
}

export const NoUser: Story = {
  args: {
    userId: null,
    emptyLabel: "No Owner"
  }
}

export const UnknownUser: Story = {
  args: {
    userId: "33333333-3333-4333-8333-333333333333",
    scenario: "unknown",
    unknownLabel: "Unknown Owner"
  }
}

export const DisabledUser: Story = {
  args: {
    userId: disabledUser.id
  }
}

export const Loading: Story = {
  args: {
    userId: "44444444-4444-4444-8444-444444444444",
    scenario: "loading"
  }
}

export const DarkSurface: Story = {
  render: (args) => (
    <div className="dark rounded-2xl bg-background p-6">
      <UserLabelStoryShell {...args} />
    </div>
  )
}
