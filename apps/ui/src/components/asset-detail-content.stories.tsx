import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  AssetCustomFieldType,
  AssetCustomFieldValueSource,
  AssetType
} from "@exposurenexus/types/model/asset"
import type {
  Asset,
  AssetCustomFieldDefinition,
  AssetCustomFieldValue,
  UpdateAssetCustomFieldAssociations,
  UpdateAssetCustomFieldValues
} from "@exposurenexus/types/model/asset"
import type { UserProfile } from "@exposurenexus/types/model/user"
import type { Meta, StoryObj } from "@storybook/react-vite"
import { AssetDetailContent } from "@/components/asset-detail-content.tsx"

type AssetDetailStoryArgs = {
  asset: Asset
  availableCustomFields: Array<AssetCustomFieldDefinition>
  customFields: Array<AssetCustomFieldValue>
  scenario:
    | "success"
    | "empty"
    | "loading-custom-fields"
    | "error-custom-fields"
    | "error-owner-update"
}

const ASSET: Asset = {
  id: "4b4f4dc9-77d5-4bb5-90a4-0d764a5fbf4b",
  name: "web-01",
  type: AssetType.Host,
  ownerId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d"
}

const USERS: Array<UserProfile> = [
  {
    id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
    username: "robin",
    displayName: "Robin Owner",
    email: "robin@example.com",
    enabled: false,
    roleIds: []
  },
  {
    id: "bb9f2b64-2f45-4bb8-9f16-659d633cb398",
    username: "morgan",
    displayName: "Morgan Owner",
    email: "morgan@example.com",
    enabled: true,
    roleIds: []
  }
]

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
    key: "team",
    name: "Team",
    source: AssetCustomFieldValueSource.Empty,
    type: AssetCustomFieldType.Text,
    value: null
  }
]

const AVAILABLE_CUSTOM_FIELDS: Array<AssetCustomFieldDefinition> = [
  {
    id: "497eab4a-74aa-46e4-8fda-3f160dc91f72",
    key: "lifecycle",
    name: "Lifecycle",
    required: false,
    type: AssetCustomFieldType.Text,
    defaultValue: null
  }
]

function AssetDetailContentStoryShell({
  asset,
  availableCustomFields,
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
  const assetRef = useRef<Asset>(asset)
  const availableCustomFieldsRef = useRef<Array<AssetCustomFieldDefinition>>(
    availableCustomFields
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
    client.setQueryData(["users"], USERS)

    if (
      scenario === "success" ||
      scenario === "empty" ||
      scenario === "error-owner-update"
    ) {
      client.setQueryData(
        ["assets", asset.id, "custom-fields"],
        effectiveInitialCustomFields
      )
      client.setQueryData(
        ["assets", asset.id, "custom-fields", "available"],
        scenario === "empty"
          ? [
              ...availableCustomFields,
              ...customFields.map(assetCustomFieldValueToDefinition)
            ]
          : availableCustomFields
      )
    }

    return client
  }, [
    asset,
    availableCustomFields,
    customFields,
    effectiveInitialCustomFields,
    scenario
  ])
  const [ready, setReady] = useState(
    scenario !== "loading-custom-fields" && scenario !== "error-custom-fields"
  )

  useLayoutEffect(() => {
    const originalFetch = globalThis.fetch
    const assetPath = `/api/assets/${asset.id}`
    const ownerPath = `${assetPath}/owner`
    const customFieldPath = `/api/assets/${asset.id}/custom-fields`
    assetRef.current = asset
    customFieldsRef.current = effectiveInitialCustomFields
    availableCustomFieldsRef.current =
      scenario === "empty"
        ? [
            ...availableCustomFields,
            ...customFields.map(assetCustomFieldValueToDefinition)
          ]
        : availableCustomFields

    globalThis.fetch = async (input, init) => {
      const requestUrl = input instanceof Request ? input.url : String(input)
      const method = (init?.method ?? "GET").toUpperCase()

      if (requestUrl.includes(ownerPath) && method === "PUT") {
        if (scenario === "error-owner-update") {
          return new Response(
            JSON.stringify({ error: "Owner update failed" }),
            {
              status: 400,
              headers: {
                "Content-Type": "application/json"
              }
            }
          )
        }

        const body = JSON.parse(
          String(init?.body ?? '{"ownerId":null}')
        ) as Pick<Asset, "ownerId">
        assetRef.current = {
          ...assetRef.current,
          ownerId: body.ownerId
        }
        queryClient.setQueryData(["asset", asset.id], assetRef.current)

        return createAssetResponse(assetRef.current)
      }

      if (!requestUrl.includes(customFieldPath)) {
        if (requestUrl.includes(assetPath)) {
          return createAssetResponse(assetRef.current)
        }

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

      if (requestUrl.endsWith(`${customFieldPath}/available`)) {
        return createAssetCustomFieldDefinitionsResponse(
          availableCustomFieldsRef.current
        )
      }

      if (requestUrl.includes(`${customFieldPath}/associations`)) {
        if (method === "PUT") {
          const body = JSON.parse(
            String(init?.body ?? '{"fieldIds":[]}')
          ) as UpdateAssetCustomFieldAssociations
          const fieldsToAssign = availableCustomFieldsRef.current.filter(
            (field) => body.fieldIds.includes(field.id)
          )

          customFieldsRef.current = [
            ...customFieldsRef.current,
            ...fieldsToAssign.map(assetCustomFieldDefinitionToValue)
          ]
          availableCustomFieldsRef.current =
            availableCustomFieldsRef.current.filter(
              (field) => !body.fieldIds.includes(field.id)
            )

          return createAssetCustomFieldValuesResponse(customFieldsRef.current)
        }

        if (method === "DELETE") {
          const fieldId = requestUrl.slice(requestUrl.lastIndexOf("/") + 1)
          const removedField = customFieldsRef.current.find(
            (field) => field.fieldId === fieldId
          )

          customFieldsRef.current = customFieldsRef.current.filter(
            (field) => field.fieldId !== fieldId
          )

          if (removedField) {
            availableCustomFieldsRef.current = [
              ...availableCustomFieldsRef.current,
              assetCustomFieldValueToDefinition(removedField)
            ]
          }

          return new Response(JSON.stringify({ data: { detached: true } }), {
            headers: {
              "Content-Type": "application/json"
            }
          })
        }
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
  }, [
    asset.id,
    availableCustomFields,
    customFields,
    effectiveInitialCustomFields,
    scenario
  ])

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

function createAssetResponse(asset: Asset): Response {
  return new Response(JSON.stringify({ data: asset }), {
    headers: {
      "Content-Type": "application/json"
    }
  })
}

function createAssetCustomFieldDefinitionsResponse(
  customFields: Array<AssetCustomFieldDefinition>
): Response {
  return new Response(JSON.stringify({ data: { items: customFields } }), {
    headers: {
      "Content-Type": "application/json"
    }
  })
}

function assetCustomFieldValueToDefinition(
  field: AssetCustomFieldValue
): AssetCustomFieldDefinition {
  switch (field.type) {
    case AssetCustomFieldType.Text:
      return {
        id: field.fieldId,
        key: field.key,
        name: field.name,
        required: false,
        type: field.type,
        defaultValue: null
      }
    case AssetCustomFieldType.Number:
      return {
        id: field.fieldId,
        key: field.key,
        name: field.name,
        required: false,
        type: field.type,
        defaultValue: null
      }
    case AssetCustomFieldType.Select:
      return {
        id: field.fieldId,
        key: field.key,
        name: field.name,
        required: false,
        type: field.type,
        defaultValue: null,
        options: field.options
      }
  }
}

function assetCustomFieldDefinitionToValue(
  field: AssetCustomFieldDefinition
): AssetCustomFieldValue {
  switch (field.type) {
    case AssetCustomFieldType.Text:
      return {
        fieldId: field.id,
        key: field.key,
        name: field.name,
        source:
          field.defaultValue === null
            ? AssetCustomFieldValueSource.Empty
            : AssetCustomFieldValueSource.Default,
        type: field.type,
        value: field.defaultValue
      }
    case AssetCustomFieldType.Number:
      return {
        fieldId: field.id,
        key: field.key,
        name: field.name,
        source:
          field.defaultValue === null
            ? AssetCustomFieldValueSource.Empty
            : AssetCustomFieldValueSource.Default,
        type: field.type,
        value: field.defaultValue
      }
    case AssetCustomFieldType.Select:
      return {
        fieldId: field.id,
        key: field.key,
        name: field.name,
        source:
          field.defaultValue === null
            ? AssetCustomFieldValueSource.Empty
            : AssetCustomFieldValueSource.Default,
        type: field.type,
        value: field.defaultValue,
        options: field.options
      }
  }
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
    }
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
    availableCustomFields: AVAILABLE_CUSTOM_FIELDS,
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

export const OwnerUpdateError: Story = {
  args: {
    scenario: "error-owner-update"
  }
}
