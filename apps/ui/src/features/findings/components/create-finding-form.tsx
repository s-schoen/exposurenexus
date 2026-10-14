import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { useForm } from "@tanstack/react-form";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { DateField } from "@/components/date-picker.tsx";
import { FormActions } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { AssetCombobox } from "@/features/assets";
import { STATUS_ORDER } from "@/features/findings/components/finding-list/constants.ts";
import { FindingStatusLabel } from "@/features/findings/components/finding-status-label.tsx";
import { formatLocalDateTimeInput } from "@/features/findings/lib/date-input.ts";
import {
  buildCreateFindingPayload,
  emptyResource,
  optionalNumberValue,
  optionalStringValue,
  updateResourceLocation,
} from "@/features/findings/lib/finding-form.ts";
import { formatWeaknessText } from "@/features/findings/lib/weakness-text.ts";
import { ASSIGNEE_LABELS, UserSelect, createListUsersQueryOptions } from "@/features/users";
import { SEVERITY_ORDER, SeverityLabel } from "@/features/vulnerabilities";

import type { FindingAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { CreateManualFinding } from "@exposurenexus/contracts/model/finding";

interface CreateFindingFormProps {
  onSubmit: (payload: CreateManualFinding) => Promise<void>;
  onCancel: () => void;
}

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
const { weakness: defaultWeakness, ...defaultFormValues } = defaultFindingValues;

function isFindingStatus(value: unknown): value is FindingStatus {
  return STATUS_ORDER.includes(value as FindingStatus);
}

function isVulnerabilitySeverity(value: unknown): value is VulnerabilitySeverity {
  return SEVERITY_ORDER.includes(value as VulnerabilitySeverity);
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
        <div className="mt-2 grid gap-4 md:grid-cols-2">
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
        <div className="mt-2 grid gap-4 md:grid-cols-2">
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
        <div className="mt-2 grid gap-4 md:grid-cols-2">
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
        <div className="mt-2 grid gap-4 md:grid-cols-2">
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
        <div className="mt-2 grid gap-4 md:grid-cols-2">
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
        <div className="mt-2 grid gap-4 md:grid-cols-2">
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

export function CreateFindingForm({ onSubmit, onCancel }: CreateFindingFormProps) {
  const users = useSuspenseQuery(createListUsersQueryOptions());
  const [weaknessDraft, setWeaknessDraft] = useState(() => formatWeaknessText(defaultWeakness));
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const form = useForm({
    defaultValues: defaultFormValues,
    onSubmit: async ({ value }) => {
      const result = buildCreateFindingPayload(value, weaknessDraft);
      if (result.error !== undefined) {
        setSubmissionError(result.error);
        return;
      }

      setSubmissionError(null);
      await onSubmit(result.payload);
    },
  });

  return (
    <form
      id="create-finding-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
      onChange={() => setSubmissionError(null)}
      className="flex flex-col gap-6"
    >
      <FieldGroup>
        <FieldGroup className="grid md:grid-cols-2">
          <form.Field
            name="title"
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
              return (
                <Field data-invalid={isInvalid} className="md:col-span-2">
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
                  <FieldLabel htmlFor={field.name}>Affected asset</FieldLabel>
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
                          isVulnerabilitySeverity(value) ? <SeverityLabel severity={value} /> : null
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_ORDER.map((severity) => (
                        <SelectItem key={severity} value={severity}>
                          <SeverityLabel severity={severity} />
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
                          isFindingStatus(value) ? <FindingStatusLabel status={value} /> : null
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_ORDER.map((status) => (
                        <SelectItem key={status} value={status}>
                          <FindingStatusLabel status={status} />
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
            children={(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Assignee</FieldLabel>
                <UserSelect
                  id={field.name}
                  name={field.name}
                  value={field.state.value ?? null}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  users={users.data}
                  labels={ASSIGNEE_LABELS}
                />
              </Field>
            )}
          />
          <form.Field
            name="dueDate"
            children={(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel htmlFor={field.name}>Due date</FieldLabel>
                  <DateField
                    id={field.name}
                    value={field.state.value ?? null}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    placeholder="No due date"
                    invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          />
          <form.Field
            name="mitigation"
            children={(field) => (
              <Field className="md:col-span-2">
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
        </FieldGroup>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Identity</FieldLegend>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="weakness">Weakness identifiers</FieldLabel>
              <Input
                className="font-mono"
                id="weakness"
                name="weakness"
                value={weaknessDraft}
                onChange={(event) => setWeaknessDraft(event.target.value)}
                placeholder="cwe=CWE-200; scanner=admin-panel"
              />
              <FieldDescription>
                Separate namespaces with semicolons and identifiers with commas.
              </FieldDescription>
            </Field>
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
                      <SelectTrigger
                        id="affected-resource-type"
                        aria-invalid={isInvalid}
                        className="w-full"
                      >
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
                </Field>
              )}
            />
          </FieldGroup>
        </FieldSet>
        <FieldSeparator />
        <FieldSet>
          <FieldLegend>Initial observation</FieldLegend>
          <form.Field
            name="observation"
            children={(field) => {
              const observation = field.state.value ?? {};
              const update = (patch: Partial<NonNullable<CreateManualFinding["observation"]>>) =>
                field.handleChange({ ...observation, ...patch });

              return (
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="observation-title">Observation title</FieldLabel>
                    <Input
                      id="observation-title"
                      placeholder="Same as the finding title"
                      value={observation.title ?? ""}
                      onChange={(event) => update({ title: event.target.value || undefined })}
                    />
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
                          observedAt: event.target.value ? new Date(event.target.value) : undefined,
                        })
                      }
                    />
                  </Field>
                </FieldGroup>
              );
            }}
          />
        </FieldSet>
      </FieldGroup>
      {submissionError ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {submissionError}
        </p>
      ) : null}
      <form.Subscribe
        selector={(state) => state.isSubmitting}
        children={(isSubmitting) => (
          <FormActions>
            <Button variant="outline" type="button" onClick={onCancel} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              Create finding
            </Button>
          </FormActions>
        )}
      />
    </form>
  );
}
