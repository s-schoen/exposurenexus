import {
  AffectedResourceType,
  WebEndpointComponentKind,
} from "@exposurenexus/types/model/affected-resource";
import {
  manualObservationInputSchema,
  updateObservationSchema,
} from "@exposurenexus/types/model/observation";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
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

import type { ObservationAffectedResource as ObservationResource } from "@exposurenexus/types/model/affected-resource";
import type { Finding } from "@exposurenexus/types/model/finding";
import type { ManualObservationInput, Observation } from "@exposurenexus/types/model/observation";

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

function resourceValue(resource: ObservationResource, key: string) {
  const value = (resource as unknown as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function updateResourceValue(
  resource: ObservationResource,
  key: string,
  rawValue: string,
  numeric = false,
): ObservationResource {
  const next = { ...resource } as unknown as Record<string, unknown>;
  const value = rawValue.trim();
  if (value) next[key] = numeric ? Number(value) : value;
  else delete next[key];
  return next as unknown as ObservationResource;
}

function ResourceInput({
  resource,
  resourceKey,
  label,
  numeric = false,
  idPrefix = "observation-resource",
  onChange,
}: {
  resource: ObservationResource;
  resourceKey: string;
  label: string;
  numeric?: boolean;
  idPrefix?: string;
  onChange: (resource: ObservationResource) => void;
}) {
  const id = `${idPrefix}-${resourceKey}`;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type={numeric ? "number" : "text"}
        min={numeric ? 1 : undefined}
        value={resourceValue(resource, resourceKey)}
        onChange={(event) =>
          onChange(updateResourceValue(resource, resourceKey, event.target.value, numeric))
        }
      />
    </Field>
  );
}

type LocationKey = "startLine" | "startColumn" | "endLine" | "endColumn";

function updateLocation(
  resource: Extract<ObservationResource, { type: AffectedResourceType.SourceCode }>,
  key: LocationKey,
  rawValue: string,
): ObservationResource {
  const location = { ...resource.location } as Partial<Record<LocationKey, number>>;
  if (rawValue.trim()) location[key] = Number(rawValue);
  else delete location[key];
  return {
    ...resource,
    ...(Object.keys(location).length ? { location } : { location: undefined }),
  } as ObservationResource;
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
                onChange(updateResourceValue(resource, "scheme", value ?? ""))
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
            resource={resource}
            resourceKey="host"
            label="Host"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="port"
            label="Port"
            numeric
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="path"
            label="Path"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="method"
            label="Method"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="reportedUrl"
            label="Reported URL"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-component`}>Component kind</FieldLabel>
            <Select
              value={component?.kind ?? noComponentValue}
              onValueChange={(value) => {
                if (!value) return;
                if (value === noComponentValue) {
                  const { component: _, ...next } = resource;
                  onChange(next);
                  return;
                }
                const kind = value as WebEndpointComponentKind;
                onChange({
                  ...resource,
                  component: namedComponentKinds.has(kind) ? { kind, name: "" } : { kind },
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
                value={"name" in component ? component.name : ""}
                onChange={(event) =>
                  onChange({
                    ...resource,
                    component: { kind: component.kind, name: event.target.value },
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
            resource={resource}
            resourceKey="host"
            label="Host"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="port"
            label="Port"
            numeric
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-transport`}>Transport</FieldLabel>
            <Select
              value={resource.transport ?? ""}
              onValueChange={(value) =>
                onChange(updateResourceValue(resource, "transport", value ?? ""))
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
            resource={resource}
            resourceKey="protocol"
            label="Protocol"
            idPrefix={idPrefix}
            onChange={onChange}
          />
        </div>
      );
    case AffectedResourceType.SourceCode:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            resource={resource}
            resourceKey="repository"
            label="Repository"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="revision"
            label="Revision"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="file"
            label="File"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          {(["startLine", "startColumn", "endLine", "endColumn"] as const).map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`${idPrefix}-${key}`}>
                {key.replace(/([A-Z])/g, " $1")}
              </FieldLabel>
              <Input
                id={`${idPrefix}-${key}`}
                type="number"
                min={1}
                value={resource.location?.[key]?.toString() ?? ""}
                onChange={(event) => onChange(updateLocation(resource, key, event.target.value))}
              />
            </Field>
          ))}
          <ResourceInput
            resource={resource}
            resourceKey="symbol"
            label="Symbol"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="locationFingerprint"
            label="Location fingerprint"
            idPrefix={idPrefix}
            onChange={onChange}
          />
        </div>
      );
    case AffectedResourceType.Package:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            resource={resource}
            resourceKey="ecosystem"
            label="Ecosystem"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="name"
            label="Package name"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="version"
            label="Version"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="installationPath"
            label="Installation path"
            idPrefix={idPrefix}
            onChange={onChange}
          />
        </div>
      );
    case AffectedResourceType.ContainerImage:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            resource={resource}
            resourceKey="registry"
            label="Registry"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="repository"
            label="Repository"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="digest"
            label="Digest"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="tag"
            label="Tag"
            idPrefix={idPrefix}
            onChange={onChange}
          />
        </div>
      );
    case AffectedResourceType.CloudResource:
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ResourceInput
            resource={resource}
            resourceKey="provider"
            label="Provider"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="providerAccount"
            label="Provider account"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="region"
            label="Region"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="resourceId"
            label="Resource ID"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="subresource"
            label="Subresource"
            idPrefix={idPrefix}
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="displayName"
            label="Display name"
            idPrefix={idPrefix}
            onChange={onChange}
          />
        </div>
      );
  }
}

function resourceDetails(resource: ObservationResource): Array<[string, string]> {
  const raw = { ...resource } as Record<string, unknown>;
  delete raw.type;
  if ("location" in raw && raw.location) raw.location = JSON.stringify(raw.location);
  if ("component" in raw && raw.component) {
    const component = raw.component as { kind: string; name?: string };
    raw.component = component.name ? `${component.kind}: ${component.name}` : component.kind;
  }
  return Object.entries(raw)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => [
      key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase()),
      String(value),
    ]);
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
                onValueChange={(value) =>
                  value &&
                  setDraft({
                    ...draft,
                    affectedResource: emptyResource(value),
                  })
                }
              >
                <SelectTrigger id={`${formId}-resource-type`} className="w-full">
                  <SelectValue>
                    {(value) => formatResourceType(value as AffectedResourceType)}
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
                value={
                  draft.observedAt
                    ? new Date(
                        draft.observedAt.getTime() - draft.observedAt.getTimezoneOffset() * 60_000,
                      )
                        .toISOString()
                        .slice(0, 16)
                    : ""
                }
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
              onValueChange={(value) =>
                value &&
                setDraft({
                  ...draft,
                  affectedResource:
                    value === inheritedValue
                      ? undefined
                      : emptyResource(value as AffectedResourceType),
                })
              }
            >
              <SelectTrigger id="observation-resource-type" className="w-full">
                <SelectValue>
                  {(value) =>
                    value === inheritedValue
                      ? `Use finding resource (${formatResourceType(finding.affectedResource.type)})`
                      : formatResourceType(value as AffectedResourceType)
                  }
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
