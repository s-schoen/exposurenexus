import { useLayoutEffect, useMemo, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import AppHeader from "@/components/app-header.tsx"
import { STORY_AUTH_SESSION } from "@/components/storybook-fixtures.ts"
import {
  RouterStoryProvider,
  createObjectResponse,
  createStoryQueryClient
} from "@/components/storybook-utils.tsx"
import { AuthProvider } from "@/context/auth.tsx"

function AppHeaderStoryShell() {
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient()

    client.setQueryData(["auth", "session"], STORY_AUTH_SESSION)

    return client
  }, [])
  const [ready, setReady] = useState(false)

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)
      const method = (
        init?.method ?? (input instanceof Request ? input.method : "GET")
      ).toUpperCase()

      if (requestUrl.endsWith("/api/auth/session")) {
        return createObjectResponse(STORY_AUTH_SESSION)
      }

      if (requestUrl.endsWith("/api/auth") && method === "DELETE") {
        return createObjectResponse({ revoked: true })
      }

      return originalFetch(input, init)
    }

    setReady(true)

    return () => {
      globalThis.fetch = originalFetch
    }
  }, [])

  if (!ready) {
    return null
  }

  return (
    <RouterStoryProvider queryClient={queryClient} initialPath="/">
      <AuthProvider>
        <AppHeader />
      </AuthProvider>
    </RouterStoryProvider>
  )
}

const meta = {
  title: "App/Shell/Header",
  component: AppHeaderStoryShell,
  parameters: {
    layout: "fullscreen"
  },
  render: () => <AppHeaderStoryShell />
} satisfies Meta<typeof AppHeaderStoryShell>

export default meta

type Story = StoryObj<typeof meta>

export const Default: Story = {}
