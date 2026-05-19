import { useLayoutEffect, useMemo, useState } from "react"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { AssetInfoItem } from "@/components/asset-info-item.tsx"
import { STORY_ASSETS } from "@/components/storybook-fixtures.ts"
import {
  RouterStoryProvider,
  createObjectResponse,
  createStoryQueryClient
} from "@/components/storybook-utils.tsx"

type AssetInfoItemStoryArgs = {
  assetId: string
  scenario: "loaded" | "loading"
}

function AssetInfoItemStoryShell({
  assetId,
  scenario
}: AssetInfoItemStoryArgs) {
  const asset = STORY_ASSETS.find((candidate) => candidate.id === assetId)
  const queryClient = useMemo(() => {
    const client = createStoryQueryClient()

    if (scenario === "loaded" && asset) {
      client.setQueryData(["assets", assetId], asset)
    }

    return client
  }, [asset, assetId, scenario])
  const [ready, setReady] = useState(scenario !== "loading")

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)

      if (requestUrl.endsWith(`/api/assets/${assetId}`)) {
        if (scenario === "loading") {
          return await new Promise<Response>(() => {})
        }

        return createObjectResponse(asset)
      }

      return originalFetch(input, init)
    }

    setReady(true)

    return () => {
      globalThis.fetch = originalFetch
    }
  }, [asset, assetId, scenario])

  if (!ready) {
    return null
  }

  return (
    <RouterStoryProvider queryClient={queryClient} initialPath="/findings">
      <div className="w-96">
        <AssetInfoItem assetId={assetId} />
      </div>
    </RouterStoryProvider>
  )
}

const meta = {
  title: "Resources/Assets/InfoItem",
  component: AssetInfoItemStoryShell,
  parameters: {
    layout: "centered"
  },
  args: {
    assetId: STORY_ASSETS[0].id,
    scenario: "loaded"
  },
  argTypes: {
    scenario: {
      control: "radio",
      options: ["loaded", "loading"]
    }
  },
  render: (args) => <AssetInfoItemStoryShell {...args} />
} satisfies Meta<typeof AssetInfoItemStoryShell>

export default meta

type Story = StoryObj<typeof meta>

export const Loaded: Story = {}

export const Loading: Story = {
  args: {
    scenario: "loading"
  }
}
