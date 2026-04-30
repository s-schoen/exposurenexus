import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  AssetType
} from "@openvlp/types/model/asset"
import type {
  Asset,
  AssetCustomFieldValue,
  UpdateAssetCustomFieldValues
} from "@openvlp/types/model/asset"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { AssetDetailContent } from "@/components/asset-detail-content.tsx"

type AssetDetailStoryArgs = {
  asset: Asset
  customFields: Array<AssetCustomFieldValue>
  scenario:
    | "success"
    | "empty"
    | "loading-custom-fields"
    | "error-custom-fields"
}

const ASSET: Asset = {
  id: "4b4f4dc9-77d5-4bb5-90a4-0d764a5fbf4b",
  name: "web-01",
  type: AssetType.Host
}

const CUSTOM_FIELDS: Array<AssetCustomFieldValue> = [
  {
    fieldId: "8f0365b2-1bbb-46e2-b1f4-06300ade23f3",
    key: "category",
    name: "Category",
    source: AssetCustomFieldValueSource.Asset,
    type: AssetCustomFieldType.Text,
    value: "Internet-facing"
  },
  {
    fieldId: "2808e68c-9a48-4b50-9a2d-d1df4c83ff06",
    key: "priority",
    name: "Priority",
    source: AssetCustomFieldValueSource.Default,
    type: AssetCustomFieldType.Number,
    value: 3
  },
  {
    fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
    key: "environment",
    name: "Environment",
    source: AssetCustomFieldValueSource.Asset,
    type: AssetCustomFieldType.Select,
    value: "production",
    options: [
      {
        id: "6b567696-6808-45be-ab67-a8683d98a138",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "production",
        label: "Production"
      },
      {
        id: "1dec1f7b-0650-4e64-bdfa-1d4228a99e87",
        fieldId: "7f732d2b-8985-4551-b45d-0eaf527a1577",
        value: "staging",
        label: "Staging"
      }
    ]
  },
  {
    fieldId: "635ad27e-14c7-4c03-ab2a-81333eabfa4c",
    key: "owner",
    name: "Owner",
    source: AssetCustomFieldValueSource.Empty,
    type: AssetCustomFieldType.Text,
    value: null
  }
]

function AssetDetailContentStoryShell({
  asset,
  customFields,
  scenario
}: AssetDetailStoryArgs) {
  const effectiveInitialCustomFields = useMemo(
    () => (scenario === "empty" ? [] : customFields),
    [customFields, scenario]
  )
  const customFieldsRef = useRef<Array<AssetCustomFieldValue>>(
    effectiveInitialCustomFields
  )
  const queryClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Number.POSITIVE_INFINITY
        }
      }
    })

    client.setQueryData(["asset", asset.id], asset)

    if (scenario === "success" || scenario === "empty") {
      client.setQueryData(
        ["assets", asset.id, "custom-fields"],
        effectiveInitialCustomFields
      )
    }

    return client
  }, [asset, effectiveInitialCustomFields, scenario])
  const [ready, setReady] = useState(
    scenario !== "loading-custom-fields" && scenario !== "error-custom-fields"
  )

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch
    const customFieldPath = `/api/assets/${asset.id}/custom-fields`
    customFieldsRef.current = effectiveInitialCustomFields

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)
      const method = (init?.method ?? "GET").toUpperCase()

      if (!requestUrl.includes(customFieldPath)) {
        return originalFetch(input, init)
      }

      if (scenario === "loading-custom-fields") {
        return await new Promise<Response>(() => {})
      }

      if (scenario === "error-custom-fields") {
        return new Response(JSON.stringify({ error: "Custom fields failed" }), {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        })
      }

      if (method === "PUT") {
        const body = JSON.parse(
          String(init?.body ?? '{"values":[]}')
        ) as UpdateAssetCustomFieldValues
        customFieldsRef.current = applyCustomFieldValueUpdates(
          customFieldsRef.current,
          body.values
        )

        return createAssetCustomFieldValuesResponse(customFieldsRef.current)
      }

      if (method === "DELETE") {
        const fieldId = requestUrl.slice(requestUrl.lastIndexOf("/") + 1)
        customFieldsRef.current = clearAssetCustomFieldValue(
          customFieldsRef.current,
          fieldId
        )

        return new Response(JSON.stringify({ data: { cleared: true } }), {
          headers: {
            "Content-Type": "application/json"
          }
        })
      }

      return createAssetCustomFieldValuesResponse(customFieldsRef.current)
    }

    setReady(true)

    return () => {
      globalThis.fetch = originalFetch
    }
  }, [asset.id, effectiveInitialCustomFields, scenario])

  if (!ready) {
    return null
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="w-full max-w-6xl">
        <AssetDetailContent assetId={asset.id} />
      </div>
    </QueryClientProvider>
  )
}

function createAssetCustomFieldValuesResponse(
  customFields: Array<AssetCustomFieldValue>
): Response {
  return new Response(JSON.stringify({ data: { items: customFields } }), {
    headers: {
      "Content-Type": "application/json"
    }
  })
}

function applyCustomFieldValueUpdates(
  customFields: Array<AssetCustomFieldValue>,
  updates: UpdateAssetCustomFieldValues["values"]
): Array<AssetCustomFieldValue> {
  return customFields.map((field) => {
    const update = updates.find(
      (candidate) => candidate.fieldId === field.fieldId
    )

    if (!update) {
      return field
    }

    return {
      ...field,
      source:
        update.value === null
          ? AssetCustomFieldValueSource.Empty
          : AssetCustomFieldValueSource.Asset,
      value: update.value
    } as AssetCustomFieldValue
  })
}

function clearAssetCustomFieldValue(
  customFields: Array<AssetCustomFieldValue>,
  fieldId: string
): Array<AssetCustomFieldValue> {
  return customFields.map((field) => {
    if (field.fieldId !== fieldId) {
      return field
    }

    return {
      ...field,
      source: AssetCustomFieldValueSource.Empty,
      value: null
    } as AssetCustomFieldValue
  })
}

const meta = {
  title: "Components/AssetDetailContent",
  component: AssetDetailContentStoryShell,
  parameters: {
    layout: "padded"
  },
  args: {
    asset: ASSET,
    customFields: CUSTOM_FIELDS,
    scenario: "success"
  },
  render: (args) => <AssetDetailContentStoryShell {...args} />
} satisfies Meta<typeof AssetDetailContentStoryShell>

export default meta

type Story = StoryObj<typeof meta>

export const WithCustomFields: Story = {}

export const EmptyCustomFields: Story = {
  args: {
    scenario: "empty"
  }
}

export const LoadingCustomFields: Story = {
  args: {
    scenario: "loading-custom-fields"
  }
}

export const CustomFieldsError: Story = {
  args: {
    scenario: "error-custom-fields"
  }
}
