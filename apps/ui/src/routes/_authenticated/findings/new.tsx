import { createFileRoute, useRouter } from "@tanstack/react-router"
import {
  FindingStatus,
  createFindingSchema
} from "@openvlp/types/model/finding"
import { useForm } from "@tanstack/react-form"
import { VulnerabilitySeverity } from "@openvlp/types/model/vulnerability"
import type { CreateFinding } from "@openvlp/types/model/finding"
import { usePageMeta } from "@/context/page.tsx"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button.tsx"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel
} from "@/components/ui/field.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select.tsx"
import { AssetCombobox } from "@/components/asset-combobox.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { formatFindingStatus } from "@/lib/format.ts"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts"

export const Route = createFileRoute("/_authenticated/findings/new")({
  component: RouteComponent
})

export function RouteComponent() {
  usePageMeta({
    title: "Create Finding",
    description: "Create and new finding manually."
  })

  const router = useRouter()
  const { createFinding } = useFindingLifecycle()

  const form = useForm({
    defaultValues: {
      vulnerabilityId: "",
      assetId: "",
      severity: VulnerabilitySeverity.Medium,
      status: FindingStatus.Active,
      source: "",
      evidence: null,
      mitigation: null
    } as CreateFinding,
    validators: {
      onSubmit: createFindingSchema
    },
    onSubmit: async ({ value }) => {
      const createdFinding = await createFinding(value)

      if (createdFinding) {
        router.history.back()
      }
    }
  })

  const handleCancel = () => {
    router.history.back()
  }

  return (
    <div>
      <form
        id="create-finding-form"
        onSubmit={(e) => {
          e.preventDefault()
          form.handleSubmit(e)
        }}
        className="flex flex-col gap-4"
      >
        <FieldGroup>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="grid gap-2 grid-cols-2">
              <form.Field
                name="vulnerabilityId"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        Vulnerability ID
                      </FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
              <form.Field
                name="assetId"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>
                        Affected Asset
                      </FieldLabel>
                      <AssetCombobox
                        onChange={(a) => field.handleChange(a.id)}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
              <form.Field
                name="severity"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Severity</FieldLabel>
                      <Select
                        onValueChange={(value) =>
                          field.handleChange(value as VulnerabilitySeverity)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select severity" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(VulnerabilitySeverity).map((sev) => (
                            <SelectItem key={sev} value={sev}>
                              <SeverityBadge severity={sev} />
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )
                }}
              />
              <form.Field
                name="status"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Status</FieldLabel>
                      <Select>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.values(FindingStatus).map((sev) => (
                            <SelectItem key={sev} value={sev}>
                              {formatFindingStatus(sev)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )
                }}
              />
              <form.Field
                name="source"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Source</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
            </TabsContent>
            <TabsContent value="details" className="flex flex-col gap-2">
              <form.Field
                name="evidence"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid} className="col-span-2">
                      <FieldLabel htmlFor={field.name}>Evidence</FieldLabel>
                      <Textarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value ?? ""}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(e.target.value || null)
                        }
                        aria-invalid={isInvalid}
                        className="h-32"
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
              <form.Field
                name="mitigation"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid} className="col-span-2">
                      <FieldLabel htmlFor={field.name}>Mitigation</FieldLabel>
                      <Textarea
                        id={field.name}
                        name={field.name}
                        value={field.state.value ?? ""}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(e.target.value || null)
                        }
                        aria-invalid={isInvalid}
                        className="h-32"
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
            </TabsContent>
          </Tabs>
        </FieldGroup>
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-finding-form"
            onClick={() => form.handleSubmit()}
          >
            Create
          </Button>
        </div>
      </form>
    </div>
  )
}
