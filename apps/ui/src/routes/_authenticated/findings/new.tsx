import { createFileRoute, useRouter } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  FindingStatus,
  createFindingSchema
} from "@exposurenexus/types/model/finding"
import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date"
import { useForm } from "@tanstack/react-form"
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability"
import type { CreateFinding } from "@exposurenexus/types/model/finding"
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
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select.tsx"
import { AssetCombobox } from "@/components/asset-combobox.tsx"
import { Textarea } from "@/components/ui/textarea.tsx"
import { formatFindingStatus } from "@/lib/format.ts"
import { SeverityBadge } from "@/components/severity-badge.tsx"
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts"
import { createListUsersQueryOptions } from "@/api/user.ts"
import { getUserProfileDisplayName } from "@/components/user-label.tsx"

export const Route = createFileRoute("/_authenticated/findings/new")({
  component: RouteComponent
})

const unassignedAssigneeValue = "__unassigned__"
const findingStatuses = Object.values(FindingStatus)
const vulnerabilitySeverities = Object.values(VulnerabilitySeverity)

const defaultFindingValues: CreateFinding = {
  vulnerabilityId: "",
  assetId: "",
  severity: VulnerabilitySeverity.Medium,
  status: FindingStatus.Active,
  source: "",
  evidence: null,
  mitigation: null,
  assigneeId: null,
  dueDate: null
}

function formatDateInputValue(value: Date | null | undefined) {
  if (!value) return ""

  return normalizeDateToUtcStart(value).toISOString().slice(0, 10)
}

function parseDateInputValue(value: string) {
  if (!value) return null

  return normalizeDateToUtcStart(new Date(`${value}T00:00:00.000Z`))
}

function isFindingStatus(value: unknown): value is FindingStatus {
  return findingStatuses.includes(value as FindingStatus)
}

function isVulnerabilitySeverity(
  value: unknown
): value is VulnerabilitySeverity {
  return vulnerabilitySeverities.includes(value as VulnerabilitySeverity)
}

export function RouteComponent() {
  usePageMeta({
    title: "Create Finding",
    description: "Create a new finding manually."
  })

  const router = useRouter()
  const findingLifecycle = useFindingLifecycle()
  const users = useQuery(createListUsersQueryOptions())

  const form = useForm({
    defaultValues: defaultFindingValues,
    validators: {
      onSubmit: createFindingSchema
    },
    onSubmit: async ({ value }) => {
      const createdFinding = await findingLifecycle.createFinding(value)

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
          form.handleSubmit()
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
                        value={field.state.value}
                        name={field.name}
                        onValueChange={(value) => {
                          field.handleChange(value as VulnerabilitySeverity)
                          field.handleBlur()
                        }}
                      >
                        <SelectTrigger
                          id={field.name}
                          aria-invalid={isInvalid}
                          className="w-full"
                        >
                          <SelectValue>
                            {(value) =>
                              isVulnerabilitySeverity(value) ? (
                                <SeverityBadge severity={value} />
                              ) : null
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {vulnerabilitySeverities.map((severity) => (
                            <SelectItem key={severity} value={severity}>
                              <SeverityBadge severity={severity} />
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
                      <Select
                        value={field.state.value}
                        name={field.name}
                        onValueChange={(value) => {
                          field.handleChange(value as FindingStatus)
                          field.handleBlur()
                        }}
                      >
                        <SelectTrigger
                          id={field.name}
                          aria-invalid={isInvalid}
                          className="w-full"
                        >
                          <SelectValue>
                            {(value) =>
                              isFindingStatus(value)
                                ? formatFindingStatus(value)
                                : null
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {findingStatuses.map((status) => (
                            <SelectItem key={status} value={status}>
                              {formatFindingStatus(status)}
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
              <form.Field
                name="assigneeId"
                children={(field) => {
                  return (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Assignee</FieldLabel>
                      <Select
                        value={field.state.value ?? unassignedAssigneeValue}
                        name={field.name}
                        onValueChange={(value) => {
                          field.handleChange(
                            value === unassignedAssigneeValue ? null : value
                          )
                          field.handleBlur()
                        }}
                      >
                        <SelectTrigger id={field.name}>
                          <SelectValue placeholder="Select assignee" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={unassignedAssigneeValue}>
                              Unassigned
                            </SelectItem>
                            {users.data?.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {getUserProfileDisplayName(user)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  )
                }}
              />
              <form.Field
                name="dueDate"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Due Date</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="date"
                        value={formatDateInputValue(field.state.value)}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          field.handleChange(
                            parseDateInputValue(e.target.value)
                          )
                        }
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
          <Button type="submit">Create</Button>
        </div>
      </form>
    </div>
  )
}
