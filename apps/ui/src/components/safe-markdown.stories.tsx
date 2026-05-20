import type { Meta, StoryObj } from "@storybook/react-vite"
import { SafeMarkdown } from "@/components/safe-markdown.tsx"

const SAMPLE_MARKDOWN = `## Impact

Administrative interfaces are **reachable** from an untrusted network.

| Signal | Value |
| --- | --- |
| Port | 8443 |
| Path | /admin |

<details><summary>Request</summary>

\`\`\`http
GET /admin HTTP/1.1
Host: web-01.example.test
\`\`\`

</details>

- Restrict access to trusted networks
- Require strong authentication
`

const SANITIZED_MARKDOWN = `## Sanitized Content

<details open><summary>Allowed layout</summary>

Raw HTML details remain available for scanner evidence.

</details>

<p onclick="alert(1)" style="color:red">Unsafe attributes are removed.</p>

<script>alert("xss")</script>

![External image](https://example.com/image.png)

[Unsafe link](javascript:alert(1)) and [safe link](https://example.com).
`

const meta = {
  title: "Components/SafeMarkdown",
  component: SafeMarkdown,
  parameters: {
    layout: "padded"
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl rounded-xl border border-border bg-card p-6">
        <Story />
      </div>
    )
  ],
  args: {
    children: SAMPLE_MARKDOWN
  }
} satisfies Meta<typeof SafeMarkdown>

export default meta

type Story = StoryObj<typeof meta>

export const RichContent: Story = {}

export const SanitizedContent: Story = {
  args: {
    children: SANITIZED_MARKDOWN
  }
}
