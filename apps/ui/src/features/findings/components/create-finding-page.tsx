import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date";
import { FindingStatus, createFindingSchema } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";

import { createListUsersQueryOptions } from "@/api/user.ts";
import { AssetCombobox } from "@/components/asset-combobox.tsx";
import { SeverityBadge } from "@/components/severity-badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea.tsx";
import { getUserProfileDisplayName } from "@/components/user-label.tsx";
import { usePageMeta } from "@/context/page.tsx";
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts";
import { formatLocalDateTimeInput, formatUtcDateOnly } from "@/lib/date-input.ts";
import { formatFindingStatus } from "@/lib/format.ts";
import { formatWeaknessText, parseWeaknessText } from "@/lib/weakness-text.ts";

import type { FindingAffectedResource } from "@exposurenexus/types/model/affected-resource";
import type { CreateManualFinding } from "@exposurenexus/types/model/finding";

interface CreateFindingPageProps {
  onClose: () => void;
}

const unassignedAssigneeValue = "__unassigned__";
const findingStatuses = Object.values(FindingStatus);
const vulnerabilitySeverities = Object.values(VulnerabilitySeverity);
const resourceTypes = Object.values(AffectedResourceType);
const networkTransportOptions = ["tcp", "udp"];

const defaultFindingValues: CreateManualFinding = {
  assetId: "",
  title: "",
  severity: VulnerabilitySeverity.Medium,
  status: FindingStatus.Active,
  assigneeId: null,
  dueDate: null,
  mitigation: null,
  weakness: { identifiers: {} },
  affectedResource: { type: AffectedResourceType.Unspecified },
  vulnerabilityIds: [],
  observation: {},
};

function formatDateInputValue(value: Date | null | undefined) {
  if (!value) return "";

  return formatUtcDateOnly(value);
}

function parseDateInputValue(value: string) {
  if (!value) return null;

  return normalizeDateToUtcStart(new Date(`${value}T00:00:00.000Z`));
}

function isFindingStatus(value: unknown): value is FindingStatus {
  return findingStatuses.includes(value as FindingStatus);
}

function isVulnerabilitySeverity(value: unknown): value is VulnerabilitySeverity {
  return vulnerabilitySeverities.includes(value as VulnerabilitySeverity);
}

function isAffectedResourceType(value: unknown): value is AffectedResourceType {
  return resourceTypes.includes(value as AffectedResourceType);
}

function formatResourceType(type: AffectedResourceType) {
  switch (type) {
    case AffectedResourceType.WebEndpoint:
      return "Web endpoint";
    case AffectedResourceType.NetworkService:
      return "Network service";
    case AffectedResourceType.SourceCode:
      return "Source code";
    case AffectedResourceType.ContainerImage:
      return "Container image";
    case AffectedResourceType.CloudResource:
      return "Cloud resource";
    case AffectedResourceType.Unspecified:
      return "Unspecified resource";
    case AffectedResourceType.Package:
      return "Package";
  }
}

function emptyResource(type: AffectedResourceType): FindingAffectedResource {
  return { type };
}

function optionalStringValue(value: string) {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function optionalNumberValue(value: string) {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
}

type SourceCodeResource = Extract<
  FindingAffectedResource,
  { type: AffectedResourceType.SourceCode }
>;
type SourceLocationKey = "startLine" | "startColumn" | "endLine" | "endColumn";

function updateResourceLocation(
  resource: SourceCodeResource,
  key: SourceLocationKey,
  rawValue: string,
): SourceCodeResource {
  const value = optionalNumberValue(rawValue);
  const startLine = key === "startLine" ? value : resource.location?.startLine;
  const startColumn = key === "startColumn" ? value : resource.location?.startColumn;
  const endLine = key === "endLine" ? value : resource.location?.endLine;
  const endColumn = key === "endColumn" ? value : resource.location?.endColumn;

  return {
    ...resource,
    location:
      startLine === undefined
        ? undefined
        : {
            startLine,
            ...(startColumn === undefined ? {} : { startColumn }),
            ...(endLine === undefined ? {} : { endLine }),
            ...(endColumn === undefined ? {} : { endColumn }),
          },
  };
}

function renderResourceInput({
  id,
  value,
  label,
  numeric = false,
  onChange,
}: {
  id: string;
  value: string | number | undefined;
  label: string;
  numeric?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={numeric ? "number" : "text"}
        value={value?.toString() ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function renderResourceFields(
  resource: FindingAffectedResource,
  onChange: (resource: FindingAffectedResource) => void,
) {
  switch (resource.type) {
    case AffectedResourceType.Unspecified:
      return null;
    case AffectedResourceType.WebEndpoint:
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="affected-resource-scheme">Scheme</FieldLabel>
            <Select
              value={resource.scheme ?? ""}
              onValueChange={(value) =>
                onChange({ ...resource, scheme: optionalStringValue(value ?? "") })
              }
            >
              <SelectTrigger id="affected-resource-scheme" className="w-full">
                <SelectValue placeholder="Select scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {renderResourceInput({
            id: "affected-resource-host",
            value: resource.host,
            label: "Host",
            onChange: (value) => onChange({ ...resource, host: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-port",
            value: resource.port,
            label: "Port",
            numeric: true,
            onChange: (value) => onChange({ ...resource, port: optionalNumberValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-path",
            value: resource.path,
            label: "Path",
            onChange: (value) => onChange({ ...resource, path: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-method",
            value: resource.method,
            label: "Method",
            onChange: (value) => onChange({ ...resource, method: optionalStringValue(value) }),
          })}
        </div>
      );
    case AffectedResourceType.NetworkService:
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {renderResourceInput({
            id: "affected-resource-host",
            value: resource.host,
            label: "Host",
            onChange: (value) => onChange({ ...resource, host: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-port",
            value: resource.port,
            label: "Port",
            numeric: true,
            onChange: (value) => onChange({ ...resource, port: optionalNumberValue(value) }),
          })}
          <Field>
            <FieldLabel htmlFor="affected-resource-transport">Transport</FieldLabel>
            <Select
              value={resource.transport ?? ""}
              onValueChange={(value) =>
                onChange({ ...resource, transport: optionalStringValue(value ?? "") })
              }
            >
              <SelectTrigger id="affected-resource-transport" className="w-full">
                <SelectValue placeholder="Select transport" />
              </SelectTrigger>
              <SelectContent>
                {networkTransportOptions.map((transport) => (
                  <SelectItem key={transport} value={transport}>
                    {transport.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {renderResourceInput({
            id: "affected-resource-protocol",
            value: resource.protocol,
            label: "Protocol",
            onChange: (value) => onChange({ ...resource, protocol: optionalStringValue(value) }),
          })}
        </div>
      );
    case AffectedResourceType.SourceCode:
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {renderResourceInput({
            id: "affected-resource-repository",
            value: resource.repository,
            label: "Repository",
            onChange: (value) => onChange({ ...resource, repository: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-file",
            value: resource.file,
            label: "File",
            onChange: (value) => onChange({ ...resource, file: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-start-line",
            value: resource.location?.startLine,
            label: "Start line",
            numeric: true,
            onChange: (value) => onChange(updateResourceLocation(resource, "startLine", value)),
          })}
          {renderResourceInput({
            id: "affected-resource-symbol",
            value: resource.symbol,
            label: "Symbol",
            onChange: (value) => onChange({ ...resource, symbol: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-locationFingerprint",
            value: resource.locationFingerprint,
            label: "Location fingerprint",
            onChange: (value) =>
              onChange({ ...resource, locationFingerprint: optionalStringValue(value) }),
          })}
        </div>
      );
    case AffectedResourceType.Package:
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {renderResourceInput({
            id: "affected-resource-ecosystem",
            value: resource.ecosystem,
            label: "Ecosystem",
            onChange: (value) => onChange({ ...resource, ecosystem: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-name",
            value: resource.name,
            label: "Package name",
            onChange: (value) => onChange({ ...resource, name: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-installationPath",
            value: resource.installationPath,
            label: "Installation path",
            onChange: (value) =>
              onChange({ ...resource, installationPath: optionalStringValue(value) }),
          })}
        </div>
      );
    case AffectedResourceType.ContainerImage:
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {renderResourceInput({
            id: "affected-resource-registry",
            value: resource.registry,
            label: "Registry",
            onChange: (value) => onChange({ ...resource, registry: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-repository",
            value: resource.repository,
            label: "Repository",
            onChange: (value) => onChange({ ...resource, repository: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-digest",
            value: resource.digest,
            label: "Digest",
            onChange: (value) => onChange({ ...resource, digest: optionalStringValue(value) }),
          })}
        </div>
      );
    case AffectedResourceType.CloudResource:
      return (
        <div className="grid gap-2 md:grid-cols-2">
          {renderResourceInput({
            id: "affected-resource-provider",
            value: resource.provider,
            label: "Provider",
            onChange: (value) => onChange({ ...resource, provider: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-providerAccount",
            value: resource.providerAccount,
            label: "Provider account",
            onChange: (value) =>
              onChange({ ...resource, providerAccount: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-region",
            value: resource.region,
            label: "Region",
            onChange: (value) => onChange({ ...resource, region: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-resourceId",
            value: resource.resourceId,
            label: "Resource ID",
            onChange: (value) => onChange({ ...resource, resourceId: optionalStringValue(value) }),
          })}
          {renderResourceInput({
            id: "affected-resource-subresource",
            value: resource.subresource,
            label: "Subresource",
            onChange: (value) => onChange({ ...resource, subresource: optionalStringValue(value) }),
          })}
        </div>
      );
  }
}

export function CreateFindingPage({ onClose }: CreateFindingPageProps) {
  usePageMeta({
    title: "Create Finding",
    description: "Create a new finding manually.",
  });

  const findingLifecycle = useFindingLifecycle();
  const users = useQuery(createListUsersQueryOptions());

  const form = useForm({
    defaultValues: defaultFindingValues,
    validators: { onSubmit: createFindingSchema as never },
    onSubmit: async ({ value }) => {
      const createdFinding = await findingLifecycle.createFinding(value);

      if (createdFinding) {
        onClose();
      }
    },
  });

  return (
    <div>
      <form
        id="create-finding-form"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-4"
      >
        <FieldGroup>
          <Tabs defaultValue="general">
            <TabsList>
              <TabsTrigger value="general" className="text-foreground">
                General
              </TabsTrigger>
              <TabsTrigger value="identity" className="text-foreground">
                Identity
              </TabsTrigger>
              <TabsTrigger value="observation" className="text-foreground">
                Observation
              </TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="grid gap-2 grid-cols-2">
              <form.Field
                name="title"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid} className="col-span-2">
                      <FieldLabel htmlFor={field.name}>Title</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              <form.Field
                name="assetId"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Affected Asset</FieldLabel>
                      <AssetCombobox
                        id={field.name}
                        invalid={isInvalid}
                        onChange={(asset) => field.handleChange(asset.id)}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              <form.Field
                name="severity"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Severity</FieldLabel>
                      <Select
                        value={field.state.value}
                        name={field.name}
                        onValueChange={(value) => {
                          if (isVulnerabilitySeverity(value)) {
                            field.handleChange(value);
                            field.handleBlur();
                          }
                        }}
                      >
                        <SelectTrigger id={field.name} aria-invalid={isInvalid} className="w-full">
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
                  );
                }}
              />
              <form.Field
                name="status"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Status</FieldLabel>
                      <Select
                        value={field.state.value}
                        name={field.name}
                        onValueChange={(value) => {
                          if (isFindingStatus(value)) {
                            field.handleChange(value);
                            field.handleBlur();
                          }
                        }}
                      >
                        <SelectTrigger id={field.name} aria-invalid={isInvalid} className="w-full">
                          <SelectValue>
                            {(value) =>
                              isFindingStatus(value) ? formatFindingStatus(value) : null
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
                  );
                }}
              />
              <form.Field
                name="assigneeId"
                children={(field) => {
                  const selectedAssignee = users.data?.find(
                    (user) => user.id === field.state.value,
                  );

                  return (
                    <Field>
                      <FieldLabel htmlFor={field.name}>Assignee</FieldLabel>
                      <Select
                        value={field.state.value ?? unassignedAssigneeValue}
                        name={field.name}
                        onValueChange={(value) => {
                          field.handleChange(value === unassignedAssigneeValue ? null : value);
                          field.handleBlur();
                        }}
                      >
                        <SelectTrigger id={field.name} className="w-full">
                          <SelectValue>
                            {field.state.value === null
                              ? "Unassigned"
                              : selectedAssignee
                                ? getUserProfileDisplayName(selectedAssignee)
                                : "Select assignee"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value={unassignedAssigneeValue}>Unassigned</SelectItem>
                            {users.data?.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {getUserProfileDisplayName(user)}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                  );
                }}
              />
              <form.Field
                name="dueDate"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Due Date</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="date"
                        value={formatDateInputValue(field.state.value)}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(parseDateInputValue(event.target.value))
                        }
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              <form.Field
                name="mitigation"
                children={(field) => (
                  <Field className="col-span-2">
                    <FieldLabel htmlFor={field.name}>Mitigation</FieldLabel>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      value={field.state.value ?? ""}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value || null)}
                      className="h-24"
                    />
                  </Field>
                )}
              />
            </TabsContent>
            <TabsContent value="identity" className="flex flex-col gap-4">
              <form.Field
                name="weakness"
                children={(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Weakness identifiers</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={formatWeaknessText(field.state.value)}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(
                          parseWeaknessText(event.target.value, { ignoreMalformed: true }) ?? {
                            identifiers: {},
                          },
                        )
                      }
                      placeholder="cwe=CWE-200; nuclei=admin-panel"
                    />
                    <FieldDescription>
                      Separate namespaces with semicolons and identifiers with commas.
                    </FieldDescription>
                  </Field>
                )}
              />
              <form.Field
                name="affectedResource"
                children={(field) => {
                  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor="affected-resource-type">Affected resource</FieldLabel>
                      <Select
                        value={field.state.value.type}
                        onValueChange={(value) => {
                          if (isAffectedResourceType(value)) {
                            field.handleChange(emptyResource(value));
                            field.handleBlur();
                          }
                        }}
                      >
                        <SelectTrigger id="affected-resource-type" aria-invalid={isInvalid}>
                          <SelectValue>
                            {(value) =>
                              isAffectedResourceType(value) ? formatResourceType(value) : null
                            }
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {resourceTypes.map((type) => (
                            <SelectItem key={type} value={type}>
                              {formatResourceType(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldDescription>
                        Unspecified means that no narrower affected resource is known.
                      </FieldDescription>
                      {renderResourceFields(field.state.value, (resource) =>
                        field.handleChange(resource),
                      )}
                      {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    </Field>
                  );
                }}
              />
              <form.Field
                name="vulnerabilityIds"
                children={(field) => (
                  <Field>
                    <FieldLabel htmlFor={field.name}>Catalog entry IDs</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value.join(", ")}
                      onChange={(event) =>
                        field.handleChange(
                          event.target.value
                            .split(",")
                            .map((id) => id.trim())
                            .filter(Boolean),
                        )
                      }
                      placeholder="Optional catalog entry UUIDs"
                    />
                    <FieldDescription>
                      Linked catalog entries enrich the finding but do not define its identity or
                      severity.
                    </FieldDescription>
                  </Field>
                )}
              />
            </TabsContent>
            <TabsContent value="observation" className="flex flex-col gap-4">
              <form.Field
                name="observation"
                children={(field) => {
                  const observation = field.state.value ?? {};
                  const update = (
                    patch: Partial<NonNullable<CreateManualFinding["observation"]>>,
                  ) => field.handleChange({ ...observation, ...patch });

                  return (
                    <div className="flex flex-col gap-4">
                      <Field>
                        <FieldLabel htmlFor="observation-title">Observation title</FieldLabel>
                        <Input
                          id="observation-title"
                          value={observation.title ?? ""}
                          onChange={(event) => update({ title: event.target.value || undefined })}
                        />
                        <FieldDescription>
                          Omit to use the finding title for the initial manual observation.
                        </FieldDescription>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="observation-description">Description</FieldLabel>
                        <Textarea
                          id="observation-description"
                          value={observation.description ?? ""}
                          onChange={(event) => update({ description: event.target.value || null })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="observation-evidence">Evidence</FieldLabel>
                        <Textarea
                          id="observation-evidence"
                          value={observation.evidence ?? ""}
                          onChange={(event) => update({ evidence: event.target.value || null })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="observation-remediation">
                          Observation remediation
                        </FieldLabel>
                        <Textarea
                          id="observation-remediation"
                          value={observation.remediation ?? ""}
                          onChange={(event) => update({ remediation: event.target.value || null })}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="observation-observed-at">Observed at</FieldLabel>
                        <Input
                          id="observation-observed-at"
                          type="datetime-local"
                          value={
                            observation.observedAt
                              ? formatLocalDateTimeInput(observation.observedAt)
                              : ""
                          }
                          onChange={(event) =>
                            update({
                              observedAt: event.target.value
                                ? new Date(event.target.value)
                                : undefined,
                            })
                          }
                        />
                        <FieldDescription>
                          Omit to use the creation time. This timestamp belongs to the observation,
                          not the finding.
                        </FieldDescription>
                      </Field>
                    </div>
                  );
                }}
              />
            </TabsContent>
          </Tabs>
        </FieldGroup>
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create finding</Button>
        </div>
      </form>
    </div>
  );
}
