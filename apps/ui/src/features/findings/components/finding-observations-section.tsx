import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import {
  manualObservationInputSchema,
  updateObservationSchema,
} from "@exposurenexus/contracts/model/observation";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Ellipsis, Pencil, Plus, ScanSearch, Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { FormActions, FormDialog } from "@/components/form-dialog.tsx";
import {
  DetailField,
  DetailFields,
  RowActions,
} from "@/components/properties-panel/detail-rows.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import { SafeMarkdown } from "@/components/safe-markdown.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
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
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useObservationLifecycle } from "@/features/findings/hooks/use-observation-lifecycle.ts";
import { isIdentifierResourceDetail } from "@/features/findings/lib/affected-resource.ts";
import { formatLocalDateTimeInput } from "@/features/findings/lib/date-input.ts";
import {
  formatWeaknessIdentifier,
  formatWeaknessText,
  parseWeaknessText,
} from "@/features/findings/lib/weakness-text.ts";
import {
  createFindingObservationsQueryOptions,
  createListFindingsQueryOptions,
} from "@/features/findings/queries/findings.ts";
import {
  SEVERITY_ORDER,
  SeverityIcon,
  SeverityLabel,
  formatSeverity,
} from "@/features/vulnerabilities";
import { capitalizeFirstLetter, formatDateTime } from "@/lib/format.ts";

import type { ObservationAffectedResource as ObservationResource } from "@exposurenexus/contracts/model/affected-resource";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type {
  ManualObservationInput,
  Observation,
  ObservationSource,
} from "@exposurenexus/contracts/model/observation";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

interface FindingObservationsSectionProps {
  finding: Finding;
}

type ObservationDraft = Omit<ManualObservationInput, "affectedResource"> & {
  affectedResource?: ObservationResource;
};

const inheritedValue = "__inherit__";
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

const observationSourceLabels: Record<ObservationSource, string> = {
  manual: "Manual",
  nuclei: "Nuclei",
  zap: "ZAP",
  semgrep: "Semgrep",
  bearer: "Bearer",
  checkov: "Checkov",
  kics: "KICS",
  trivy: "Trivy",
};

function formatResourceType(type: AffectedResourceType) {
  return type === AffectedResourceType.WebEndpoint
    ? "Web endpoint"
    : type === AffectedResourceType.NetworkService
      ? "Network service"
      : type === AffectedResourceType.SourceCode
        ? "Source code"
        : type === AffectedResourceType.ContainerImage
          ? "Container image"
          : type === AffectedResourceType.CloudResource
            ? "Cloud resource"
            : type === AffectedResourceType.Unspecified
              ? "Unspecified resource"
              : capitalizeFirstLetter(type);
}

function emptyResource(type: AffectedResourceType): ObservationResource {
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

type SourceCodeResource = Extract<ObservationResource, { type: AffectedResourceType.SourceCode }>;
type LocationKey = "startLine" | "startColumn" | "endLine" | "endColumn";

function updateLocation(
  resource: SourceCodeResource,
  key: LocationKey,
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

function ObservationResourceFields({
  resource,
  idPrefix = "observation-resource",
  onChange,
}: {
  resource: ObservationResource;
  idPrefix?: string;
  onChange: (resource: ObservationResource) => void;
}) {
  switch (resource.type) {
    case AffectedResourceType.Unspecified:
      return null;
    case AffectedResourceType.WebEndpoint: {
      const component = resource.component;
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-scheme`}>Scheme</FieldLabel>
            <Select
              value={resource.scheme ?? ""}
              onValueChange={(value) =>
                onChange({ ...resource, scheme: optionalStringValue(value ?? "") })
              }
            >
              <SelectTrigger id={`${idPrefix}-scheme`} className="w-full">
                <SelectValue placeholder="Select scheme" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="http">HTTP</SelectItem>
                <SelectItem value="https">HTTPS</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <ResourceInput
            id={`${idPrefix}-host`}
            value={resource.host}
            label="Host"
            onChange={(value) => onChange({ ...resource, host: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-port`}
            value={resource.port}
            label="Port"
            numeric
            onChange={(value) => onChange({ ...resource, port: optionalNumberValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-path`}
            value={resource.path}
            label="Path"
            onChange={(value) => onChange({ ...resource, path: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-method`}
            value={resource.method}
            label="Method"
            onChange={(value) => onChange({ ...resource, method: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-reportedUrl`}
            value={resource.reportedUrl}
            label="Reported URL"
            onChange={(value) => onChange({ ...resource, reportedUrl: optionalStringValue(value) })}
          />
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-component`}>Component kind</FieldLabel>
            <Select
              value={component?.kind ?? noComponentValue}
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
              <SelectTrigger id={`${idPrefix}-component`} className="w-full">
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
              <FieldLabel htmlFor={`${idPrefix}-component-name`}>Component name</FieldLabel>
              <Input
                id={`${idPrefix}-component-name`}
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
            id={`${idPrefix}-host`}
            value={resource.host}
            label="Host"
            onChange={(value) => onChange({ ...resource, host: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-port`}
            value={resource.port}
            label="Port"
            numeric
            onChange={(value) => onChange({ ...resource, port: optionalNumberValue(value) })}
          />
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-transport`}>Transport</FieldLabel>
            <Select
              value={resource.transport ?? ""}
              onValueChange={(value) =>
                onChange({ ...resource, transport: optionalStringValue(value ?? "") })
              }
            >
              <SelectTrigger id={`${idPrefix}-transport`} className="w-full">
                <SelectValue placeholder="Select transport" />
              </SelectTrigger>
              <SelectContent>
                {networkTransportOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ResourceInput
            id={`${idPrefix}-protocol`}
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
            id={`${idPrefix}-repository`}
            value={resource.repository}
            label="Repository"
            onChange={(value) => onChange({ ...resource, repository: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-revision`}
            value={resource.revision}
            label="Revision"
            onChange={(value) => onChange({ ...resource, revision: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-file`}
            value={resource.file}
            label="File"
            onChange={(value) => onChange({ ...resource, file: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-startLine`}
            value={resource.location?.startLine}
            label="Start line"
            numeric
            onChange={(value) => onChange(updateLocation(resource, "startLine", value))}
          />
          <ResourceInput
            id={`${idPrefix}-startColumn`}
            value={resource.location?.startColumn}
            label="Start column"
            numeric
            onChange={(value) => onChange(updateLocation(resource, "startColumn", value))}
          />
          <ResourceInput
            id={`${idPrefix}-endLine`}
            value={resource.location?.endLine}
            label="End line"
            numeric
            onChange={(value) => onChange(updateLocation(resource, "endLine", value))}
          />
          <ResourceInput
            id={`${idPrefix}-endColumn`}
            value={resource.location?.endColumn}
            label="End column"
            numeric
            onChange={(value) => onChange(updateLocation(resource, "endColumn", value))}
          />
          <ResourceInput
            id={`${idPrefix}-symbol`}
            value={resource.symbol}
            label="Symbol"
            onChange={(value) => onChange({ ...resource, symbol: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-locationFingerprint`}
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
            id={`${idPrefix}-ecosystem`}
            value={resource.ecosystem}
            label="Ecosystem"
            onChange={(value) => onChange({ ...resource, ecosystem: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-name`}
            value={resource.name}
            label="Package name"
            onChange={(value) => onChange({ ...resource, name: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-version`}
            value={resource.version}
            label="Version"
            onChange={(value) => onChange({ ...resource, version: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-installationPath`}
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
            id={`${idPrefix}-registry`}
            value={resource.registry}
            label="Registry"
            onChange={(value) => onChange({ ...resource, registry: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-repository`}
            value={resource.repository}
            label="Repository"
            onChange={(value) => onChange({ ...resource, repository: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-digest`}
            value={resource.digest}
            label="Digest"
            onChange={(value) => onChange({ ...resource, digest: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-tag`}
            value={resource.tag}
            label="Tag"
            onChange={(value) => onChange({ ...resource, tag: optionalStringValue(value) })}
          />
        </div>
      );
    case AffectedResourceType.CloudResource:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            id={`${idPrefix}-provider`}
            value={resource.provider}
            label="Provider"
            onChange={(value) => onChange({ ...resource, provider: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-providerAccount`}
            value={resource.providerAccount}
            label="Provider account"
            onChange={(value) =>
              onChange({ ...resource, providerAccount: optionalStringValue(value) })
            }
          />
          <ResourceInput
            id={`${idPrefix}-region`}
            value={resource.region}
            label="Region"
            onChange={(value) => onChange({ ...resource, region: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-resourceId`}
            value={resource.resourceId}
            label="Resource ID"
            onChange={(value) => onChange({ ...resource, resourceId: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-subresource`}
            value={resource.subresource}
            label="Subresource"
            onChange={(value) => onChange({ ...resource, subresource: optionalStringValue(value) })}
          />
          <ResourceInput
            id={`${idPrefix}-displayName`}
            value={resource.displayName}
            label="Display name"
            onChange={(value) => onChange({ ...resource, displayName: optionalStringValue(value) })}
          />
        </div>
      );
  }
}

type ResourceDetailValue =
  | string
  | number
  | { kind: WebEndpointComponentKind; name?: string }
  | undefined;

function formatResourceValue(value: ResourceDetailValue) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value) {
    return value.name ? `${value.kind}: ${value.name}` : value.kind;
  }

  return "Not recorded";
}

function formatResourceDetails(
  entries: Array<[string, ResourceDetailValue]>,
): Array<[string, string]> {
  const details: Array<[string, string]> = [];

  for (const [label, value] of entries) {
    if (value !== undefined) {
      details.push([label, formatResourceValue(value)]);
    }
  }

  return details;
}

function resourceDetails(resource: ObservationResource): Array<[string, string]> {
  switch (resource.type) {
    case AffectedResourceType.Unspecified:
      return [];
    case AffectedResourceType.WebEndpoint:
      return formatResourceDetails([
        ["Scheme", resource.scheme],
        ["Host", resource.host],
        ["Port", resource.port],
        ["Path", resource.path],
        ["Method", resource.method],
        ["Component", resource.component],
        ["Reported URL", resource.reportedUrl],
      ]);
    case AffectedResourceType.NetworkService:
      return formatResourceDetails([
        ["Host", resource.host],
        ["Port", resource.port],
        ["Transport", resource.transport],
        ["Protocol", resource.protocol],
      ]);
    case AffectedResourceType.SourceCode:
      return formatResourceDetails([
        ["Repository", resource.repository],
        ["Revision", resource.revision],
        ["File", resource.file],
        ["Location", resource.location ? JSON.stringify(resource.location) : undefined],
        ["Symbol", resource.symbol],
        ["Location fingerprint", resource.locationFingerprint],
      ]);
    case AffectedResourceType.Package:
      return formatResourceDetails([
        ["Ecosystem", resource.ecosystem],
        ["Package", resource.name],
        ["Version", resource.version],
        ["Installation path", resource.installationPath],
      ]);
    case AffectedResourceType.ContainerImage:
      return formatResourceDetails([
        ["Registry", resource.registry],
        ["Repository", resource.repository],
        ["Digest", resource.digest],
        ["Tag", resource.tag],
      ]);
    case AffectedResourceType.CloudResource:
      return formatResourceDetails([
        ["Provider", resource.provider],
        ["Provider account", resource.providerAccount],
        ["Region", resource.region],
        ["Resource ID", resource.resourceId],
        ["Subresource", resource.subresource],
        ["Display name", resource.displayName],
      ]);
  }
}

function observationDraft(observation: Observation): ObservationDraft {
  return {
    title: observation.title,
    description: observation.description,
    evidence: observation.evidence,
    remediation: observation.remediation,
    severity: observation.severity,
    affectedResource: observation.affectedResource,
    observedAt: observation.observedAt,
  };
}

interface ObservationDialogProps {
  observation: Observation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function EditObservationDialog({ observation, open, onOpenChange }: ObservationDialogProps) {
  const lifecycle = useObservationLifecycle();
  const [draft, setDraft] = useState<ObservationDraft>(() => observationDraft(observation));
  const [weakness, setWeakness] = useState(() => formatWeaknessText(observation.weakness));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const formId = `edit-observation-${observation.id}`;
  const idPrefix = `${formId}-resource`;

  // Each opening starts from the observation as it is now.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(observationDraft(observation));
      setWeakness(formatWeaknessText(observation.weakness));
      setError(null);
    }
  }

  const closeEditor = () => {
    if (!submitting) {
      onOpenChange(false);
    }
  };

  const submit = async () => {
    const parsedWeakness = parseWeaknessText(weakness, observation.weakness);
    if (parsedWeakness === null) {
      setError("Weakness identifiers must use namespace=identifier entries.");
      return;
    }

    const result = updateObservationSchema.safeParse({
      ...draft,
      weakness: parsedWeakness,
    });
    if (!result.success) {
      const issue = result.error.issues[0];
      setError(
        `Unable to save observation. ${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`,
      );
      return;
    }

    setSubmitting(true);
    setError(null);
    const updated = await lifecycle.updateObservation(
      observation.findingId,
      observation.id,
      result.data,
    );
    setSubmitting(false);
    if (!updated) {
      setError("Unable to save observation. Try again.");
      return;
    }

    onOpenChange(false);
  };

  return (
    <FormDialog
      title="Correct observation"
      size="wide"
      open={open}
      onOpenChange={onOpenChange}
      submitting={submitting}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor={`${formId}-title`}>Title</FieldLabel>
              <Input
                id={`${formId}-title`}
                value={draft.title ?? ""}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${formId}-severity`}>Severity</FieldLabel>
              <Select
                value={draft.severity}
                onValueChange={(value) => value && setDraft({ ...draft, severity: value })}
              >
                <SelectTrigger id={`${formId}-severity`} className="w-full">
                  <SelectValue>
                    {() => <SeverityLabel severity={draft.severity as VulnerabilitySeverity} />}
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
            <Field>
              <FieldLabel htmlFor={`${formId}-observed-at`}>Observed at</FieldLabel>
              <Input
                id={`${formId}-observed-at`}
                type="datetime-local"
                value={draft.observedAt ? formatLocalDateTimeInput(draft.observedAt) : ""}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    observedAt: event.target.value ? new Date(event.target.value) : undefined,
                  })
                }
              />
            </Field>
            {(["description", "evidence", "remediation"] as const).map((key) => (
              <Field key={key} className="sm:col-span-2">
                <FieldLabel htmlFor={`${formId}-${key}`}>{capitalizeFirstLetter(key)}</FieldLabel>
                <Textarea
                  id={`${formId}-${key}`}
                  value={draft[key] ?? ""}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value || null })}
                />
              </Field>
            ))}
          </div>
          <FieldSeparator />
          <FieldSet>
            <FieldLegend>Identity</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${formId}-weakness`}>Weakness identifiers</FieldLabel>
                <Input
                  className="font-mono"
                  id={`${formId}-weakness`}
                  value={weakness}
                  placeholder="cwe=CWE-200; scanner=admin-panel"
                  onChange={(event) => setWeakness(event.target.value)}
                />
                <FieldDescription>
                  Blank removes all identifiers; reported references, CVSS, and EPSS are kept.
                  Separate namespaces with semicolons and identifiers with commas.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${formId}-resource-type`}>Affected resource type</FieldLabel>
                <Select
                  value={draft.affectedResource?.type ?? AffectedResourceType.Unspecified}
                  onValueChange={(value) => {
                    if (!value || !isAffectedResourceType(value)) return;
                    setDraft({
                      ...draft,
                      affectedResource: emptyResource(value),
                    });
                  }}
                >
                  <SelectTrigger id={`${formId}-resource-type`} className="w-full">
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
              </Field>
              {draft.affectedResource ? (
                <ObservationResourceFields
                  resource={draft.affectedResource}
                  idPrefix={idPrefix}
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
          <Button type="button" variant="outline" onClick={closeEditor} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner />}
            Save correction
          </Button>
        </FormActions>
      </form>
    </FormDialog>
  );
}

function MoveObservationDialog({ observation, open, onOpenChange }: ObservationDialogProps) {
  const lifecycle = useObservationLifecycle();
  const [targetFindingId, setTargetFindingId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const findings = useQuery({ ...createListFindingsQueryOptions(), enabled: open });
  const availableFindings = (Array.isArray(findings.data) ? findings.data : []).filter(
    (finding) => finding.id !== observation.findingId,
  );

  const reset = () => {
    setTargetFindingId("");
    setError(null);
  };

  const changeOpen = (next: boolean) => {
    if (!next && submitting) return;
    reset();
    onOpenChange(next);
  };

  const submit = async () => {
    if (!targetFindingId) {
      setError("Select a target finding.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const moved = await lifecycle.moveObservation(
      observation.findingId,
      observation.id,
      targetFindingId,
    );
    setSubmitting(false);
    if (!moved) {
      setError("Unable to move observation. Try again.");
      return;
    }

    reset();
    onOpenChange(false);
  };

  return (
    <FormDialog
      title="Move observation"
      open={open}
      onOpenChange={changeOpen}
      submitting={submitting}
    >
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field>
          <FieldLabel htmlFor={`move-observation-target-${observation.id}`}>
            Target finding
          </FieldLabel>
          <Select
            value={targetFindingId}
            onValueChange={(value) => setTargetFindingId(value ?? "")}
            disabled={findings.isPending || findings.isError || availableFindings.length === 0}
          >
            <SelectTrigger id={`move-observation-target-${observation.id}`} className="w-full">
              <SelectValue placeholder="Select a target finding" />
            </SelectTrigger>
            <SelectContent>
              {availableFindings.map((finding) => (
                <SelectItem key={finding.id} value={finding.id}>
                  {finding.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {findings.isError ? (
            <FieldDescription>Target findings could not be loaded.</FieldDescription>
          ) : availableFindings.length === 0 && !findings.isPending ? (
            <FieldDescription>No other findings are available.</FieldDescription>
          ) : null}
        </Field>
        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}
        <FormActions>
          <Button
            type="button"
            variant="outline"
            onClick={() => changeOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !targetFindingId}>
            {submitting && <Spinner />}
            Move observation
          </Button>
        </FormActions>
      </form>
    </FormDialog>
  );
}

function ObservationMenu({ observation }: { observation: Observation }) {
  const lifecycle = useObservationLifecycle();
  const [dialog, setDialog] = useState<"edit" | "move" | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deleteObservation = async () => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete observation",
      description: "The finding remains, even if this is its final observation.",
      message: `Delete ${observation.title}?`,
      cancelText: "Keep observation",
      confirmText: "Delete observation",
      confirmVariant: "destructive",
    });
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    await lifecycle.deleteObservation(observation.findingId, observation.id);
    setDeleting(false);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={deleting}
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for observation ${observation.title}`}
            />
          }
        >
          {deleting ? <Spinner /> : <Ellipsis strokeWidth={1.5} />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("edit")}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDialog("move")}>
            <ArrowRightLeft />
            Move
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => void deleteObservation()}>
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditObservationDialog
        observation={observation}
        open={dialog === "edit"}
        onOpenChange={(open) => setDialog(open ? "edit" : null)}
      />
      <MoveObservationDialog
        observation={observation}
        open={dialog === "move"}
        onOpenChange={(open) => setDialog(open ? "move" : null)}
      />
    </>
  );
}

function ObservationDetails({ observation }: { observation: Observation }) {
  const details = resourceDetails(observation.affectedResource);
  const identifiers = Object.entries(observation.weakness.identifiers);

  return (
    <div className="flex flex-col gap-3 pt-2 text-13">
      {observation.description ? <SafeMarkdown>{observation.description}</SafeMarkdown> : null}
      {observation.evidence ? (
        <div>
          <h4 className="font-semibold text-subtle-foreground">Evidence</h4>
          <SafeMarkdown className="mt-1">{observation.evidence}</SafeMarkdown>
        </div>
      ) : null}
      {observation.remediation ? (
        <div>
          <h4 className="font-semibold text-subtle-foreground">Remediation</h4>
          <SafeMarkdown className="mt-1">{observation.remediation}</SafeMarkdown>
        </div>
      ) : null}
      <DetailFields>
        <DetailField label="Severity">
          <SeverityLabel severity={observation.severity} />
        </DetailField>
        <DetailField label="Weakness">
          {identifiers.length ? (
            <span className="min-w-0 font-mono text-xs break-all">
              {identifiers
                .flatMap(([namespace, values]) =>
                  values.map((value) => formatWeaknessIdentifier(namespace, value)),
                )
                .join(", ")}
            </span>
          ) : (
            <span className="text-subtle-foreground">No identifiers recorded</span>
          )}
        </DetailField>
        <DetailField label="Resource">
          {formatResourceType(observation.affectedResource.type)}
        </DetailField>
        {details.map(([label, value]) => (
          <DetailField key={label} label={label}>
            <span
              className={
                isIdentifierResourceDetail(label)
                  ? "min-w-0 font-mono text-xs break-all"
                  : "min-w-0 break-all"
              }
            >
              {value}
            </span>
          </DetailField>
        ))}
      </DetailFields>
    </div>
  );
}

// One source report on the timeline: who reported it and when, with its details collapsed under
// its title.
function ObservationItem({ observation }: { observation: Observation }) {
  return (
    <li className="group/observation group/detail-row relative flex gap-3 pb-4 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute top-6 bottom-0 left-3 w-px bg-border group-last/observation:hidden"
      />
      <span className="relative flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground">
        <ScanSearch className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-h-6 items-center justify-between gap-2">
          <p className="min-w-0 truncate text-13">
            <span className="font-medium text-foreground">
              {observationSourceLabels[observation.source]}
            </span>{" "}
            <span className="text-muted-foreground">reported</span>{" "}
            <time
              dateTime={observation.observedAt.toISOString()}
              className="text-xs text-subtle-foreground"
            >
              · {formatDateTime(observation.observedAt)}
            </time>
          </p>
          <RowActions>
            <ObservationMenu observation={observation} />
          </RowActions>
        </div>
        <Collapsible>
          <CollapsibleTrigger className="flex max-w-full items-center">
            <span className="flex min-w-0 items-center gap-1.5 text-left text-13 text-foreground-secondary hover:text-foreground">
              <SeverityIcon severity={observation.severity} />
              <span className="truncate">{observation.title}</span>
              <CollapsibleChevron />
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ObservationDetails observation={observation} />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </li>
  );
}

function AddObservationDialog({ finding }: { finding: Finding }) {
  const lifecycle = useObservationLifecycle();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ObservationDraft>({});
  const [weakness, setWeakness] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inheritedSeverityLabel = (
    <>
      <SeverityIcon severity={finding.severity} decorative />
      Use finding severity ({formatSeverity(finding.severity)})
    </>
  );

  const reset = () => {
    setDraft({});
    setWeakness("");
    setError(null);
  };
  const changeOpen = (next: boolean) => {
    if (!next && submitting) return;
    reset();
    setOpen(next);
  };
  const submit = async () => {
    const parsedWeakness = weakness.trim() ? parseWeaknessText(weakness) : undefined;
    if (parsedWeakness === null) {
      setError("Weakness identifiers must use namespace=identifier entries.");
      return;
    }
    const candidate = {
      ...draft,
      ...(draft.title === undefined ? {} : { title: draft.title.trim() }),
      ...(parsedWeakness ? { weakness: parsedWeakness } : {}),
    };
    const result = manualObservationInputSchema.safeParse(candidate);
    if (!result.success) {
      const issue = result.error.issues[0];
      setError(
        `Unable to add observation. ${issue.path.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`,
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    const created = await lifecycle.addObservation(finding.id, result.data);
    setSubmitting(false);
    if (!created) {
      setError("Unable to add observation. Try again.");
      return;
    }
    reset();
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Add observation"
        onClick={() => changeOpen(true)}
      >
        <Plus strokeWidth={1.5} />
      </Button>
      <FormDialog
        title="Add manual observation"
        size="wide"
        open={open}
        onOpenChange={changeOpen}
        submitting={submitting}
      >
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="observation-title">Title</FieldLabel>
                <Input
                  id="observation-title"
                  value={draft.title ?? ""}
                  placeholder={`Use finding title: ${finding.title}`}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value || undefined })
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="observation-severity">Severity</FieldLabel>
                <Select
                  value={draft.severity ?? inheritedValue}
                  onValueChange={(value) =>
                    value &&
                    setDraft({
                      ...draft,
                      severity:
                        value === inheritedValue ? undefined : (value as VulnerabilitySeverity),
                    })
                  }
                >
                  <SelectTrigger id="observation-severity" className="w-full">
                    <SelectValue>
                      {(value) =>
                        value === inheritedValue ? (
                          inheritedSeverityLabel
                        ) : (
                          <SeverityLabel severity={value as VulnerabilitySeverity} />
                        )
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={inheritedValue}>{inheritedSeverityLabel}</SelectItem>
                    {SEVERITY_ORDER.map((severity) => (
                      <SelectItem key={severity} value={severity}>
                        <SeverityLabel severity={severity} />
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="observation-time">Observed at</FieldLabel>
                <Input
                  id="observation-time"
                  type="datetime-local"
                  value={draft.observedAt ? formatLocalDateTimeInput(draft.observedAt) : ""}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      observedAt: event.target.value ? new Date(event.target.value) : undefined,
                    })
                  }
                />
                <FieldDescription>Leave blank to use the server time.</FieldDescription>
              </Field>
              {(["description", "evidence", "remediation"] as const).map((key) => (
                <Field key={key} className="sm:col-span-2">
                  <FieldLabel htmlFor={`observation-${key}`}>
                    {capitalizeFirstLetter(key)}
                  </FieldLabel>
                  <Textarea
                    id={`observation-${key}`}
                    value={draft[key] ?? ""}
                    onChange={(event) =>
                      setDraft({ ...draft, [key]: event.target.value || undefined })
                    }
                  />
                </Field>
              ))}
            </div>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>Identity</FieldLegend>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="observation-weakness">Weakness identifiers</FieldLabel>
                  <Input
                    className="font-mono"
                    id="observation-weakness"
                    value={weakness}
                    placeholder="Use finding weakness, or cwe=CWE-200; scanner=admin-panel"
                    onChange={(event) => setWeakness(event.target.value)}
                  />
                  <FieldDescription>
                    Blank uses the finding default. Separate namespaces with semicolons and
                    identifiers with commas.
                  </FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="observation-resource-type">
                    Affected resource type
                  </FieldLabel>
                  <Select
                    value={draft.affectedResource?.type ?? inheritedValue}
                    onValueChange={(value) => {
                      if (!value) return;
                      if (value === inheritedValue) {
                        setDraft({ ...draft, affectedResource: undefined });
                        return;
                      }
                      if (isAffectedResourceType(value)) {
                        setDraft({
                          ...draft,
                          affectedResource: emptyResource(value),
                        });
                      }
                    }}
                  >
                    <SelectTrigger id="observation-resource-type" className="w-full">
                      <SelectValue>
                        {(value) => {
                          if (value === inheritedValue) {
                            return `Use finding resource (${formatResourceType(finding.affectedResource.type)})`;
                          }
                          return typeof value === "string" && isAffectedResourceType(value)
                            ? formatResourceType(value)
                            : null;
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={inheritedValue}>Use finding resource</SelectItem>
                      {resourceTypes.map((type) => (
                        <SelectItem key={type} value={type}>
                          {formatResourceType(type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                {draft.affectedResource ? (
                  <ObservationResourceFields
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
              onClick={() => changeOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner />}
              Add observation
            </Button>
          </FormActions>
        </form>
      </FormDialog>
    </>
  );
}

export function FindingObservationsSection({ finding }: FindingObservationsSectionProps) {
  const observations = useQuery(createFindingObservationsQueryOptions(finding.id));

  return (
    <DetailSection
      title="Observations"
      count={observations.data?.length ?? finding.observationCount}
      action={<AddObservationDialog finding={finding} />}
    >
      {observations.isPending ? (
        <div role="status" aria-label="Loading observations" className="flex flex-col gap-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : observations.isError ? (
        <div role="alert" className="flex items-center justify-between gap-3 text-13">
          <p className="text-destructive">Unable to load observations</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void observations.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : observations.data.length ? (
        <ol className="flex flex-col">
          {observations.data.map((observation) => (
            <ObservationItem key={observation.id} observation={observation} />
          ))}
        </ol>
      ) : (
        <p className="text-13 text-subtle-foreground">No observations recorded.</p>
      )}
    </DetailSection>
  );
}
