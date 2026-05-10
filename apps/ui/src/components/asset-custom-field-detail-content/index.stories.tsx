import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLayoutEffect, useMemo, useState } from "react"
import { AssetCustomFieldType } from "@exposurenexus/types/model/asset-custom-field"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { AssetCustomFieldDefinition } from "@exposurenexus/types/model/asset-custom-field"
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/components/asset-custom-field-fixtures.ts"
import { AssetCustomFieldDetailContent } from "@/components/asset-custom-field-detail-content"

type AssetCustomFieldDetailStoryArgs = {
  customFieldId: string
  customField: AssetCustomFieldDefinition
  scenario: "success" | "loading" | "error"
}

function getFixture(type: AssetCustomFieldType) {
  const fixture = ASSET_CUSTOM_FIELD_FIXTURES.find(
    (field) => field.type === type
  )

  if (!fixture) {
    throw new Error(`Missing ${type} custom field fixture`)
  }

  return fixture
}

const SELECT_CUSTOM_FIELD = getFixture(AssetCustomFieldType.Select)
const TEXT_CUSTOM_FIELD = getFixture(AssetCustomFieldType.Text)
const NUMBER_CUSTOM_FIELD = getFixture(AssetCustomFieldType.Number)

function AssetCustomFieldDetailContentStoryShell({
  customFieldId,
  customField,
  scenario
}: AssetCustomFieldDetailStoryArgs) {
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
      client.setQueryData(["asset-custom-fields", customFieldId], customField)
    }

    return client
  }, [customField, customFieldId, scenario])
  const [ready, setReady] = useState(
    scenario !== "loading" && scenario !== "error"
  )

  useLayoutEffect(() => {
    if (scenario === "success") {
      setReady(true)
      return
    }

    const originalFetch = globalThis.fetch

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)

      if (!requestUrl.endsWith(`/api/assets/custom-fields/${customFieldId}`)) {
        return originalFetch(input, init)
      }

      if (scenario === "loading") {
        return await new Promise<Response>(() => {})
      }

      return new Response(
        JSON.stringify({ error: "Custom field request failed" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      )
    }

    setReady(true)

    return () => {
      globalThis.fetch = originalFetch
    }
  }, [customFieldId, scenario])

  if (!ready) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full max-w-6xl">
        <AssetCustomFieldDetailContent customFieldId={customFieldId} />
      </div>
    </QueryClientProvider>
  )
}

const meta = {
  title: "Components/AssetCustomFieldDetailContent",
  component: AssetCustomFieldDetailContentStoryShell,
  parameters: {
    layout: "padded"
  },
  args: {
    customFieldId: SELECT_CUSTOM_FIELD.id,
    customField: SELECT_CUSTOM_FIELD,
    scenario: "success"
  },
  render: (args) => <AssetCustomFieldDetailContentStoryShell {...args} />
} satisfies Meta<typeof AssetCustomFieldDetailContentStoryShell>

export default meta

type Story = StoryObj<typeof meta>

export const SelectField: Story = {}

export const TextField: Story = {
  args: {
    customFieldId: TEXT_CUSTOM_FIELD.id,
    customField: TEXT_CUSTOM_FIELD
  }
}

export const NumberField: Story = {
  args: {
    customFieldId: NUMBER_CUSTOM_FIELD.id,
    customField: NUMBER_CUSTOM_FIELD
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
