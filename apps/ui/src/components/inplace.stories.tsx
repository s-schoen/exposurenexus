import { useEffect, useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Inplace } from "@/components/inplace.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

import type { Meta, StoryObj } from "@storybook/react-vite";

type InplaceStoryArgs = {
  value: string;
  mode: "input" | "select" | "custom";
  editOnClick?: boolean;
  showEditIcon?: boolean;
  onSave: (value: string) => void | Promise<void>;
};

function InplaceStoryShell(args: InplaceStoryArgs) {
  const [value, setValue] = useState(args.value);

  useEffect(() => {
    setValue(args.value);
  }, [args.value]);

  const editElement =
    args.mode === "select"
      ? {
          type: "select" as const,
          options: [
            { label: "Active", value: "active" },
            { label: "Confirmed", value: "confirmed" },
            { label: "Risk accepted", value: "risk-accepted" },
          ],
        }
      : args.mode === "custom"
        ? {
            type: "custom" as const,
            hideActions: true,
            render: ({
              value: draft,
              onChange,
              onCommit,
              onCancel,
            }: {
              value: string;
              onChange: (value: string) => void;
              onCommit: (value?: string) => void;
              onCancel: () => void;
            }) => (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={draft === "low" ? "default" : "outline"}
                  onClick={() => onChange("low")}
                >
                  Low
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={draft === "high" ? "default" : "outline"}
                  onClick={() => onChange("high")}
                >
                  High
                </Button>
                <Button type="button" size="sm" onClick={() => onCommit(draft)}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
              </div>
            ),
          }
        : { type: "input" as const };

  return (
    <div className="w-96 rounded-xl border border-border/70 bg-card p-5">
      <Inplace
        value={value}
        editElement={editElement}
        editOnClick={args.editOnClick}
        showEditIcon={args.showEditIcon}
        displayElement={(current) =>
          args.mode === "select" ? (
            <Badge variant="outline" className="rounded-full">
              {current}
            </Badge>
          ) : (
            <span>{current}</span>
          )
        }
        onSave={async (nextValue) => {
          setValue(nextValue);
          await args.onSave(nextValue);
        }}
      />
    </div>
  );
}

const meta = {
  title: "Components/Inplace",
  component: InplaceStoryShell,
  parameters: {
    layout: "centered",
  },
  args: {
    value: "web-01",
    mode: "input",
    editOnClick: false,
    showEditIcon: true,
    onSave: fn(),
  },
  argTypes: {
    mode: {
      control: "radio",
      options: ["input", "select", "custom"],
    },
  },
  render: (args) => <InplaceStoryShell {...args} />,
} satisfies Meta<typeof InplaceStoryShell>;

export default meta;

type Story = StoryObj<typeof meta>;

export const InputEdit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole("button"));
    await expect(await canvas.findByRole("textbox")).toHaveValue("web-01");
  },
};

export const ClickToEdit: Story = {
  args: {
    editOnClick: true,
    showEditIcon: false,
  },
};

export const SelectEdit: Story = {
  args: {
    value: "active",
    mode: "select",
  },
};

export const CustomEdit: Story = {
  args: {
    value: "low",
    mode: "custom",
    editOnClick: true,
    showEditIcon: false,
  },
};
