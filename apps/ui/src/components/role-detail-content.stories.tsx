import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLayoutEffect, useMemo, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { Role } from "@exposurenexus/types/model/rbac"
import {
  BUILT_IN_ADMIN_ROLE,
  CUSTOM_AUDITOR_ROLE
} from "@/components/role-fixtures.ts"
import { RoleDetailContent } from "@/components/role-detail-content"

type RoleDetailStoryArgs = {
  roleId: string
  role: Role
  scenario: "success" | "loading" | "error"
}

function RoleDetailContentStoryShell({
  roleId,
  role,
  scenario
}: RoleDetailStoryArgs) {
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY
        }
      }
    })

    if (scenario === "success") {
      client.setQueryData(["roles", roleId], role)
    }

    return client
  }, [role, roleId, scenario])
  const [ready, setReady] = useState(scenario !== "loading" && scenario !== "error")

  useLayoutEffect(() => {
    if (scenario === "success") {
      setReady(true)
      return
    }

    const originalFetch = globalThis.fetch

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)

      if (!requestUrl.endsWith(`/api/roles/${roleId}`)) {
        return originalFetch(input, init)
      }

      if (scenario === "loading") {
        return await new Promise<Response>(() => {})
      }

      return new Response(JSON.stringify({ error: "Role request failed" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      })
    }

    setReady(true)

    return () => {
      globalThis.fetch = originalFetch
    }
  }, [roleId, scenario])

  if (!ready) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full max-w-6xl">
        <RoleDetailContent roleId={roleId} />
      </div>
    </QueryClientProvider>
  )
}

const meta = {
  title: "Components/RoleDetailContent",
  component: RoleDetailContentStoryShell,
  parameters: {
    layout: "padded"
  },
  args: {
    roleId: BUILT_IN_ADMIN_ROLE.id,
    role: BUILT_IN_ADMIN_ROLE,
    scenario: "success"
  },
  render: (args) => <RoleDetailContentStoryShell {...args} />
} satisfies Meta<typeof RoleDetailContentStoryShell>

export default meta

type Story = StoryObj<typeof meta>

export const BuiltInAdmin: Story = {}

export const CustomRole: Story = {
  args: {
    roleId: CUSTOM_AUDITOR_ROLE.id,
    role: CUSTOM_AUDITOR_ROLE
  }
}

export const Loading: Story = {
  args: {
    scenario: "loading"
  }
}

export const ErrorState: Story = {
  args: {
    scenario: "error"
  }
}
