import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import { useState } from "react";

import { FormActions, FormDialog } from "@/components/form-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Field,
  FieldDescription,
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
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import { formatResourceType } from "@/features/findings/lib/affected-resource.ts";
import {
  buildFindingCorrection,
  emptyResource,
  optionalNumberValue,
  optionalStringValue,
  updateResourceLocation,
} from "@/features/findings/lib/finding-form.ts";
import { formatWeaknessText } from "@/features/findings/lib/weakness-text.ts";
import { capitalizeFirstLetter } from "@/lib/format.ts";

import type { FindingAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { Finding, UpdateFinding } from "@exposurenexus/contracts/model/finding";

const noComponentValue = "__none__";
const resourceTypes = Object.values(AffectedResourceType);
const componentKinds = Object.values(WebEndpointComponentKind);
const networkTransportOptions = ["tcp", "udp"];
const namedComponentKinds = new Set<WebEndpointComponentKind>([
  WebEndpointComponentKind.QueryParameter,
  WebEndpointComponentKind.PathParameter,
  WebEndpointComponentKind.Header,
  WebEndpointComponentKind.Cookie,
  WebEndpointComponentKind.BodyField,
]);

function isAffectedResourceType(value: string): value is AffectedResourceType {
  return resourceTypes.some((type) => type === value);
}

function isWebEndpointComponentKind(value: string): value is WebEndpointComponentKind {
  return componentKinds.some((kind) => kind === value);
}

function ResourceInput({
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
        min={numeric ? 1 : undefined}
        value={value?.toString() ?? ""}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function ResourceFields({
  resource,
  onChange,
}: {
  resource: FindingAffectedResource;
  onChange: (resource: FindingAffectedResource) => void;
}) {
  switch (resource.type) {
    case AffectedResourceType.Unspecified:
      return null;
    case AffectedResourceType.WebEndpoint: {
      const component = resource.component;
      const componentKind = component?.kind ?? noComponentValue;
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="correction-resource-scheme">Scheme</FieldLabel>
            <Select
              value={resource.scheme ?? ""}
              onValueChange={(value) =>
                onChange({ ...resource, scheme: optionalStringValue(value ?? "") })
              }
            >
              <SelectTrigger id="correction-resource-scheme" className="w-full">
                <SelectValue placeholder="Select scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ResourceInput
            id="correction-resource-host"
            value={resource.host}
            label="Host"
            onChange={(value) => onChange({ ...resource, host: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-port"
            value={resource.port}
            label="Port"
            numeric
            onChange={(value) => onChange({ ...resource, port: optionalNumberValue(value) })}
          />
          <ResourceInput
            id="correction-resource-path"
            value={resource.path}
            label="Path"
            onChange={(value) => onChange({ ...resource, path: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-method"
            value={resource.method}
            label="Method"
            onChange={(value) => onChange({ ...resource, method: optionalStringValue(value) })}
          />
          <Field>
            <FieldLabel htmlFor="correction-resource-component-kind">Component kind</FieldLabel>
            <Select
              value={componentKind}
              onValueChange={(value) => {
                if (!value) return;
                if (value === noComponentValue) {
                  onChange({ ...resource, component: undefined });
                  return;
                }
                if (!isWebEndpointComponentKind(value)) return;
                const kind = value;
                onChange({
                  ...resource,
                  component: namedComponentKinds.has(kind) ? { kind, name: undefined } : { kind },
                });
              }}
            >
              <SelectTrigger id="correction-resource-component-kind" className="w-full">
                <SelectValue>
                  {(value) =>
                    value === noComponentValue
                      ? "No component"
                      : capitalizeFirstLetter(String(value))
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={noComponentValue}>No component</SelectItem>
                {componentKinds.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    {capitalizeFirstLetter(kind)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {component && namedComponentKinds.has(component.kind) ? (
            <Field>
              <FieldLabel htmlFor="correction-resource-component-name">Component name</FieldLabel>
              <Input
                id="correction-resource-component-name"
                value={component.name ?? ""}
                onChange={(event) =>
                  onChange({
                    ...resource,
                    component: {
                      kind: component.kind,
                      name: optionalStringValue(event.target.value),
                    },
                  })
                }
              />
            </Field>
          ) : null}
        </div>
      );
    }
    case AffectedResourceType.NetworkService:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            id="correction-resource-host"
            value={resource.host}
            label="Host"
            onChange={(value) => onChange({ ...resource, host: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-port"
            value={resource.port}
            label="Port"
            numeric
            onChange={(value) => onChange({ ...resource, port: optionalNumberValue(value) })}
          />
          <Field>
            <FieldLabel htmlFor="correction-resource-transport">Transport</FieldLabel>
            <Select
              value={resource.transport ?? ""}
              onValueChange={(value) =>
                onChange({ ...resource, transport: optionalStringValue(value ?? "") })
              }
            >
              <SelectTrigger id="correction-resource-transport" className="w-full">
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
          <ResourceInput
            id="correction-resource-protocol"
            value={resource.protocol}
            label="Protocol"
            onChange={(value) => onChange({ ...resource, protocol: optionalStringValue(value) })}
          />
        </div>
      );
    case AffectedResourceType.SourceCode:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            id="correction-resource-repository"
            value={resource.repository}
            label="Repository"
            onChange={(value) => onChange({ ...resource, repository: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-file"
            value={resource.file}
            label="File"
            onChange={(value) => onChange({ ...resource, file: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-startLine"
            value={resource.location?.startLine}
            label="Start line"
            numeric
            onChange={(value) => onChange(updateResourceLocation(resource, "startLine", value))}
          />
          <ResourceInput
            id="correction-resource-startColumn"
            value={resource.location?.startColumn}
            label="Start column"
            numeric
            onChange={(value) => onChange(updateResourceLocation(resource, "startColumn", value))}
          />
          <ResourceInput
            id="correction-resource-endLine"
            value={resource.location?.endLine}
            label="End line"
            numeric
            onChange={(value) => onChange(updateResourceLocation(resource, "endLine", value))}
          />
          <ResourceInput
            id="correction-resource-endColumn"
            value={resource.location?.endColumn}
            label="End column"
            numeric
            onChange={(value) => onChange(updateResourceLocation(resource, "endColumn", value))}
          />
          <ResourceInput
            id="correction-resource-symbol"
            value={resource.symbol}
            label="Symbol"
            onChange={(value) => onChange({ ...resource, symbol: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-locationFingerprint"
            value={resource.locationFingerprint}
            label="Location fingerprint"
            onChange={(value) =>
              onChange({ ...resource, locationFingerprint: optionalStringValue(value) })
            }
          />
        </div>
      );
    case AffectedResourceType.Package:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            id="correction-resource-ecosystem"
            value={resource.ecosystem}
            label="Ecosystem"
            onChange={(value) => onChange({ ...resource, ecosystem: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-name"
            value={resource.name}
            label="Package name"
            onChange={(value) => onChange({ ...resource, name: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-installationPath"
            value={resource.installationPath}
            label="Installation path"
            onChange={(value) =>
              onChange({ ...resource, installationPath: optionalStringValue(value) })
            }
          />
        </div>
      );
    case AffectedResourceType.ContainerImage:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            id="correction-resource-registry"
            value={resource.registry}
            label="Registry"
            onChange={(value) => onChange({ ...resource, registry: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-repository"
            value={resource.repository}
            label="Repository"
            onChange={(value) => onChange({ ...resource, repository: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-digest"
            value={resource.digest}
            label="Digest"
            onChange={(value) => onChange({ ...resource, digest: optionalStringValue(value) })}
          />
        </div>
      );
    case AffectedResourceType.CloudResource:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            id="correction-resource-provider"
            value={resource.provider}
            label="Provider"
            onChange={(value) => onChange({ ...resource, provider: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-providerAccount"
            value={resource.providerAccount}
            label="Provider account"
            onChange={(value) =>
              onChange({ ...resource, providerAccount: optionalStringValue(value) })
            }
          />
          <ResourceInput
            id="correction-resource-region"
            value={resource.region}
            label="Region"
            onChange={(value) => onChange({ ...resource, region: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-resourceId"
            value={resource.resourceId}
            label="Resource ID"
            onChange={(value) => onChange({ ...resource, resourceId: optionalStringValue(value) })}
          />
          <ResourceInput
            id="correction-resource-subresource"
            value={resource.subresource}
            label="Subresource"
            onChange={(value) => onChange({ ...resource, subresource: optionalStringValue(value) })}
          />
        </div>
      );
  }
}

type FindingDetailsDraft = Pick<UpdateFinding, "mitigation" | "weakness" | "affectedResource">;

function detailsDraft(finding: Finding): FindingDetailsDraft {
  return {
    mitigation: finding.mitigation,
    weakness: finding.weakness,
    affectedResource: finding.affectedResource,
  };
}

interface FindingDetailsDialogProps {
  finding: Finding;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Edits the finding's mitigation and identity. The title, status, severity, assignee and due date
// are edited in place instead.
export function FindingDetailsDialog({ finding, open, onOpenChange }: FindingDetailsDialogProps) {
  const findingLifecycle = useFindingLifecycle();
  const [draft, setDraft] = useState(() => detailsDraft(finding));
  const [weaknessDraft, setWeaknessDraft] = useState(() => formatWeaknessText(finding.weakness));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Each opening starts from the finding as it is now.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(detailsDraft(finding));
      setWeaknessDraft(formatWeaknessText(finding.weakness));
      setError(null);
    }
  }

  const handleSubmit = async () => {
    const result = buildFindingCorrection(draft, weaknessDraft);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }

    setError(null);
    setSubmitting(true);
    const corrected = await findingLifecycle.correctFinding(finding.id, result.payload);
    setSubmitting(false);
    if (!corrected) {
      setError("Unable to save correction. Try again.");
      return;
    }
    onOpenChange(false);
  };

  return (
    <FormDialog
      title="Edit details"
      size="wide"
      open={open}
      onOpenChange={onOpenChange}
      submitting={submitting}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <FieldGroup>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="correction-mitigation">Mitigation</FieldLabel>
              <Textarea
                id="correction-mitigation"
                value={draft.mitigation ?? ""}
                onChange={(event) => setDraft({ ...draft, mitigation: event.target.value || null })}
                className="min-h-24"
              />
            </Field>
          </FieldGroup>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Identity</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="correction-weakness">Weakness identifiers</FieldLabel>
                <Input
                  id="correction-weakness"
                  value={weaknessDraft}
                  onChange={(event) => setWeaknessDraft(event.target.value)}
                  placeholder="cwe=CWE-200; scanner=admin-panel"
                />
                <FieldDescription>
                  Separate namespaces with semicolons and identifiers with commas.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="correction-resource-type">Affected resource type</FieldLabel>
                <Select
                  value={draft.affectedResource?.type}
                  onValueChange={(value) => {
                    if (!value || !isAffectedResourceType(value)) return;
                    setDraft({
                      ...draft,
                      affectedResource: emptyResource(value),
                    });
                  }}
                >
                  <SelectTrigger id="correction-resource-type" className="w-full">
                    <SelectValue>
                      {(value) =>
                        typeof value === "string" && isAffectedResourceType(value)
                          ? formatResourceType(value)
                          : null
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
                  Changing type replaces the current resource identity and its fields.
                </FieldDescription>
              </Field>
              {draft.affectedResource ? (
                <ResourceFields
                  resource={draft.affectedResource}
                  onChange={(affectedResource) => setDraft({ ...draft, affectedResource })}
                />
              ) : null}
            </FieldGroup>
          </FieldSet>
        </FieldGroup>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <FormActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner />}
            Save
          </Button>
        </FormActions>
      </form>
    </FormDialog>
  );
}
