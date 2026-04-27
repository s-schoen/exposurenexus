import { useState } from "react"
import { expect, fn, userEvent, within } from "storybook/test"
import { AssetCustomFieldType } from "@openvlp/types/model/asset"
import type { Meta, StoryObj } from "@storybook/react-vite"
import type { ComponentProps } from "react"
import { AssetCustomFieldForm } from "@/components/asset-custom-field-form.tsx"

type AssetCustomFieldFormStoryArgs = ComponentProps<typeof AssetCustomFieldForm>

function AssetCustomFieldFormStoryShell(args: AssetCustomFieldFormStoryArgs) {
  const [lastSubmittedValues, setLastSubmittedValues] =
    useState<AssetCustomFieldFormStoryArgs["defaultValues"]>()

  const handleSubmit: AssetCustomFieldFormStoryArgs["onSubmit"] = async (
    values
  ) => {
    setLastSubmittedValues(values)
    await args.onSubmit(values)
  }

  return (
    <div className="w-full max-w-2xl space-y-4">
      <AssetCustomFieldForm {...args} onSubmit={handleSubmit} />
      {lastSubmittedValues ? (
        <div className="rounded-xl border border-border/70 bg-card p-4">
          <p className="text-sm font-medium text-foreground">Last submitted</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            {JSON.stringify(lastSubmittedValues, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  )
}

const meta = {
  title: "Components/AssetCustomFieldForm",
  component: AssetCustomFieldForm,
  parameters: {
    layout: "padded"
  },
  args: {
    mode: "create",
    onSubmit: fn(async (_values) => {
      await new Promise((resolve) => setTimeout(resolve, 300))
    }),
    onCancel: fn()
  },
  render: (args) => <AssetCustomFieldFormStoryShell {...args} />
} satisfies Meta<typeof AssetCustomFieldForm>

export default meta

type Story = StoryObj<typeof meta>

export const CreateText: Story = {}

export const CreateNumber: Story = {
  args: {
    defaultValues: {
      name: "Priority",
      key: "priority",
      type: AssetCustomFieldType.Number,
      required: true,
      defaultValue: "3"
    }
  }
}

export const CreateSelect: Story = {
  args: {
    defaultValues: {
      name: "Environment",
      key: "environment",
      type: AssetCustomFieldType.Select,
      required: true,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" }
      ]
    }
  }
}

export const EditSelect: Story = {
  args: {
    mode: "edit",
    defaultValues: {
      name: "Environment",
      key: "environment",
      type: AssetCustomFieldType.Select,
      required: true,
      defaultValue: "production",
      options: [
        { value: "production", label: "Production" },
        { value: "staging", label: "Staging" }
      ]
    }
  }
}

export const ValidationErrors: Story = {
  args: {
    defaultValues: {
      type: AssetCustomFieldType.Select,
      required: true,
      options: [
        { value: "production", label: "Production" },
        { value: "production", label: "Production duplicate" }
      ]
    }
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)

    await userEvent.click(
      await canvas.findByRole("button", { name: /create custom field/i })
    )

    await expect(await canvas.findAllByRole("alert")).not.toHaveLength(0)
  }
}
