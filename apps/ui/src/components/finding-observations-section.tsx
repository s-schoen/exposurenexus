import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/contracts/model/affected-resource";
import {
  manualObservationInputSchema,
  updateObservationSchema,
} from "@exposurenexus/contracts/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  createFindingObservationsQueryOptions,
  createListFindingsQueryOptions,
} from "@/api/finding.ts";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { SafeMarkdown } from "@/components/safe-markdown.tsx";
import { SeverityBadge } from "@/components/severity-badge.tsx";
import { Timestamp } from "@/components/timestamp.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { useObservationLifecycle } from "@/hooks/use-observation-lifecycle.ts";
import { formatLocalDateTimeInput } from "@/lib/date-input.ts";
import { capitalizeFirstLetter, formatSeverity } from "@/lib/format.ts";
import { formatWeaknessText, parseWeaknessText } from "@/lib/weakness-text.ts";

import type { ObservationAffectedResource as ObservationResource } from "@exposurenexus/contracts/model/affected-resource";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type {
  ManualObservationInput,
  Observation,
} from "@exposurenexus/contracts/model/observation";

interface FindingObservationsSectionProps {
  finding: Finding;
}

type ObservationDraft = Omit<ManualObservationInput, "affectedResource"> & {
  affectedResource?: ObservationResource;
};

const inheritedValue = "__inherit__";
const noComponentValue = "__none__";
const resourceTypes = Object.values(AffectedResourceType);
const severities = Object.values(VulnerabilitySeverity);
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

function EditObservationDialog({ observation }: { observation: Observation }) {
  const lifecycle = useObservationLifecycle();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ObservationDraft>(() => observationDraft(observation));
  const [weakness, setWeakness] = useState(() => formatWeaknessText(observation.weakness));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const formId = `edit-observation-${observation.id}`;
  const idPrefix = `${formId}-resource`;

  const openEditor = () => {
    setDraft(observationDraft(observation));
    setWeakness(formatWeaknessText(observation.weakness));
    setError(null);
    setOpen(true);
  };

  const closeEditor = () => {
    if (!submitting) {
      setError(null);
      setOpen(false);
    }
  };

  const submit = async () => {
    const parsedWeakness = parseWeaknessText(weakness);
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

    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Edit observation ${observation.title}`}
        onClick={openEditor}
      >
        <Pencil />
        Edit
      </Button>
      <Dialog open={open} onOpenChange={(next) => (next ? openEditor() : closeEditor())}>
        <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Correct observation</DialogTitle>
            <DialogDescription>
              Correct source evidence without changing the finding's workflow or canonical identity.
            </DialogDescription>
          </DialogHeader>
          <form
            id={formId}
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
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
                      {() => formatSeverity(draft.severity as VulnerabilitySeverity)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {severities.map((severity) => (
                      <SelectItem key={severity} value={severity}>
                        {formatSeverity(severity)}
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
            <Separator />
            <Field>
              <FieldLabel htmlFor={`${formId}-weakness`}>Weakness identifiers</FieldLabel>
              <Input
                id={`${formId}-weakness`}
                value={weakness}
                placeholder="cwe=CWE-200; nuclei=admin-panel"
                onChange={(event) => setWeakness(event.target.value)}
              />
              <FieldDescription>
                Blank clears the observation weakness. Separate namespaces with semicolons and
                identifiers with commas.
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
            {error ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {error}
              </p>
            ) : null}
          </form>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditor}>
              Cancel
            </Button>
            <Button type="submit" form={formId} disabled={submitting}>
              {submitting ? <Spinner /> : null}Save correction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DeleteObservationButton({ observation }: { observation: Observation }) {
  const lifecycle = useObservationLifecycle();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={`Delete observation ${observation.title}`}
      disabled={deleting}
      onClick={() => void handleDelete()}
    >
      {deleting ? <Spinner /> : <Trash2 />}
      Delete
    </Button>
  );
}

function MoveObservationDialog({ observation }: { observation: Observation }) {
  const lifecycle = useObservationLifecycle();
  const [open, setOpen] = useState(false);
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
    setOpen(next);
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
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Move observation ${observation.title}`}
        onClick={() => changeOpen(true)}
      >
        <ArrowRightLeft />
        Move
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move observation</DialogTitle>
          <DialogDescription>
            Move this source report to another finding without changing its content or either
            finding&apos;s identity data.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`move-observation-${observation.id}`}
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
            <p role="alert" className="mt-4 text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={`move-observation-${observation.id}`}
            disabled={submitting || !targetFindingId}
          >
            {submitting ? <Spinner /> : null}
            Move observation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ObservationCard({ observation }: { observation: Observation }) {
  const details = resourceDetails(observation.affectedResource);
  const identifiers = Object.entries(observation.weakness.identifiers);

  return (
    <article className="rounded-2xl border border-border/70 bg-muted/10 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{observation.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{capitalizeFirstLetter(observation.source)}</span>
            <span aria-hidden="true">/</span>
            <Timestamp timestamp={observation.observedAt} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <SeverityBadge severity={observation.severity} />
          <EditObservationDialog observation={observation} />
          <MoveObservationDialog observation={observation} />
          <DeleteObservationButton observation={observation} />
        </div>
      </div>
      {observation.description ? (
        <SafeMarkdown className="mt-4">{observation.description}</SafeMarkdown>
      ) : null}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {observation.evidence ? (
          <div>
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Evidence
            </h4>
            <SafeMarkdown className="mt-1">{observation.evidence}</SafeMarkdown>
          </div>
        ) : null}
        {observation.remediation ? (
          <div>
            <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Remediation
            </h4>
            <SafeMarkdown className="mt-1">{observation.remediation}</SafeMarkdown>
          </div>
        ) : null}
      </div>
      <Separator className="my-4" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Weakness
          </h4>
          <p className="mt-1 text-sm">
            {identifiers.length
              ? identifiers
                  .map(([namespace, values]) => `${namespace}: ${values.join(", ")}`)
                  .join("; ")
              : "No identifiers recorded"}
          </p>
        </div>
        <div>
          <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Affected resource
          </h4>
          <p className="mt-1 text-sm font-medium">
            {formatResourceType(observation.affectedResource.type)}
          </p>
          {details.length ? (
            <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {details.map(([label, value]) => (
                <div key={label} className="text-sm">
                  <dt className="inline text-muted-foreground">{label}: </dt>
                  <dd className="inline break-all">{value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function AddObservationDialog({ finding }: { finding: Finding }) {
  const lifecycle = useObservationLifecycle();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ObservationDraft>({});
  const [weakness, setWeakness] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    const candidate = { ...draft, ...(parsedWeakness ? { weakness: parsedWeakness } : {}) };
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
    <Dialog open={open} onOpenChange={changeOpen}>
      <Button type="button" size="sm" onClick={() => changeOpen(true)}>
        <Plus />
        Add observation
      </Button>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add manual observation</DialogTitle>
          <DialogDescription>
            Record source evidence without changing the finding's canonical identity. Leave
            inherited fields blank to use server defaults.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`add-observation-${finding.id}`}
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="observation-title">Title</FieldLabel>
              <Input
                id="observation-title"
                value={draft.title ?? ""}
                placeholder={`Use finding title: ${finding.title}`}
                onChange={(event) => setDraft({ ...draft, title: event.target.value || undefined })}
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
                      value === inheritedValue
                        ? `Use finding severity (${formatSeverity(finding.severity)})`
                        : formatSeverity(value as VulnerabilitySeverity)
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={inheritedValue}>Use finding severity</SelectItem>
                  {severities.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {formatSeverity(severity)}
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
                <FieldLabel htmlFor={`observation-${key}`}>{capitalizeFirstLetter(key)}</FieldLabel>
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
          <Separator />
          <Field>
            <FieldLabel htmlFor="observation-weakness">Weakness identifiers</FieldLabel>
            <Input
              id="observation-weakness"
              value={weakness}
              placeholder="Use finding weakness, or cwe=CWE-200; nuclei=admin-panel"
              onChange={(event) => setWeakness(event.target.value)}
            />
            <FieldDescription>
              Blank uses the finding default. Separate namespaces with semicolons and identifiers
              with commas.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="observation-resource-type">Affected resource type</FieldLabel>
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
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`add-observation-${finding.id}`} disabled={submitting}>
            {submitting ? <Spinner /> : null}Add observation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FindingObservationsSection({ finding }: FindingObservationsSectionProps) {
  const observations = useQuery(createFindingObservationsQueryOptions(finding.id));

  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-xl font-semibold">Observations</CardTitle>
          <CardDescription>Source-owned evidence supporting this finding.</CardDescription>
        </div>
        <AddObservationDialog finding={finding} />
      </CardHeader>
      <CardContent>
        {observations.isPending ? (
          <div role="status" aria-label="Loading observations" className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : observations.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="font-medium">Unable to load observations</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The supporting evidence could not be loaded.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void observations.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : observations.data.length ? (
          <div className="space-y-4">
            {observations.data.map((observation) => (
              <ObservationCard key={observation.id} observation={observation} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="font-medium">No observations recorded</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add manual evidence to support this finding.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
