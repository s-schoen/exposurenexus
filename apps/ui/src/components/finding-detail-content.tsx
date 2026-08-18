import {
  AffectedResourceType,
  NetworkTransport,
  WebEndpointComponentKind,
} from "@exposurenexus/types/model/affected-resource";
import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date";
import { FindingStatus, updateFindingSchema } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Pencil, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { createAssetByIDQueryOptions } from "@/api/asset.ts";
import { createFindingByIDQueryOptions } from "@/api/finding.ts";
import { createListUsersQueryOptions } from "@/api/user.ts";
import { createListVulnerabilitiesQueryOptions } from "@/api/vulnerability.ts";
import { AssetInfoItem } from "@/components/asset-info-item.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { FindingObservationsSection } from "@/components/finding-observations-section.tsx";
import { FindingStatusBadge } from "@/components/finding-status-badge.tsx";
import { MetadataSidebar } from "@/components/metadata-sidebar";
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx";
import { SafeMarkdown } from "@/components/safe-markdown.tsx";
import { SeverityBadge } from "@/components/severity-badge.tsx";
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
import {
  UserLabel,
  createUserProfileById,
  getUserProfileDisplayName,
} from "@/components/user-label.tsx";
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts";
import { formatUtcDateOnly } from "@/lib/date-input.ts";
import { capitalizeFirstLetter, formatFindingStatus, formatSeverity } from "@/lib/format.ts";
import { formatWeaknessText, parseWeaknessText } from "@/lib/weakness-text.ts";

import type { FindingAffectedResource } from "@exposurenexus/types/model/affected-resource";
import type { FindingProjection, UpdateFinding } from "@exposurenexus/types/model/finding";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { VulnerabilityCatalog } from "@exposurenexus/types/model/vulnerability";
import type { ReactNode } from "react";

interface FindingDetailContentProps {
  findingId: string;
  titleAction?: ReactNode;
}

const unassignedAssigneeValue = "__unassigned__";
const noComponentValue = "__none__";
const findingStatuses = Object.values(FindingStatus);
const vulnerabilitySeverities = Object.values(VulnerabilitySeverity);
const resourceTypes = Object.values(AffectedResourceType);
const componentKinds = Object.values(WebEndpointComponentKind);
const namedComponentKinds = new Set<WebEndpointComponentKind>([
  WebEndpointComponentKind.QueryParameter,
  WebEndpointComponentKind.PathParameter,
  WebEndpointComponentKind.Header,
  WebEndpointComponentKind.Cookie,
  WebEndpointComponentKind.BodyField,
]);

function formatDateInputValue(value: Date | null) {
  return value ? normalizeDateToUtcStart(value).toISOString().slice(0, 10) : "";
}

function parseDateInputValue(value: string) {
  return value ? normalizeDateToUtcStart(new Date(`${value}T00:00:00.000Z`)) : null;
}

function emptyResource(type: AffectedResourceType): FindingAffectedResource {
  return { type };
}

function resourceValue(resource: FindingAffectedResource, key: string) {
  const value = (resource as unknown as Record<string, unknown>)[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function updateResourceValue(
  resource: FindingAffectedResource,
  key: string,
  rawValue: string,
  numeric = false,
): FindingAffectedResource {
  const next = { ...resource } as unknown as Record<string, unknown>;
  const value = rawValue.trim();
  if (value) next[key] = numeric ? Number(value) : value;
  else delete next[key];
  return next as unknown as FindingAffectedResource;
}

type SourceLocationKey = "startLine" | "startColumn" | "endLine" | "endColumn";

function updateResourceLocation(
  resource: Extract<FindingAffectedResource, { type: AffectedResourceType.SourceCode }>,
  key: SourceLocationKey,
  rawValue: string,
): FindingAffectedResource {
  const location = { ...resource.location } as Partial<Record<SourceLocationKey, number>>;
  if (rawValue.trim()) location[key] = Number(rawValue);
  else delete location[key];

  return {
    ...resource,
    ...(Object.keys(location).length > 0 ? { location } : { location: undefined }),
  } as FindingAffectedResource;
}

function ResourceInput({
  resource,
  resourceKey,
  label,
  numeric = false,
  onChange,
}: {
  resource: FindingAffectedResource;
  resourceKey: string;
  label: string;
  numeric?: boolean;
  onChange: (resource: FindingAffectedResource) => void;
}) {
  const id = `correction-resource-${resourceKey}`;
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

function ResourceFields({
  resource,
  onChange,
}: {
  resource: FindingAffectedResource;
  onChange: (resource: FindingAffectedResource) => void;
}) {
  switch (resource.type) {
    case AffectedResourceType.Asset:
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
                onChange(updateResourceValue(resource, "scheme", value ?? ""))
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
          <ResourceInput resource={resource} resourceKey="host" label="Host" onChange={onChange} />
          <ResourceInput
            resource={resource}
            resourceKey="port"
            label="Port"
            numeric
            onChange={onChange}
          />
          <ResourceInput resource={resource} resourceKey="path" label="Path" onChange={onChange} />
          <ResourceInput
            resource={resource}
            resourceKey="method"
            label="Method"
            onChange={onChange}
          />
          <Field>
            <FieldLabel htmlFor="correction-resource-component-kind">Component kind</FieldLabel>
            <Select
              value={componentKind}
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
          <ResourceInput resource={resource} resourceKey="host" label="Host" onChange={onChange} />
          <ResourceInput
            resource={resource}
            resourceKey="port"
            label="Port"
            numeric
            onChange={onChange}
          />
          <Field>
            <FieldLabel htmlFor="correction-resource-transport">Transport</FieldLabel>
            <Select
              value={resource.transport ?? ""}
              onValueChange={(value) =>
                onChange(updateResourceValue(resource, "transport", value ?? ""))
              }
            >
              <SelectTrigger id="correction-resource-transport" className="w-full">
                <SelectValue placeholder="Select transport" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(NetworkTransport).map((transport) => (
                  <SelectItem key={transport} value={transport}>
                    {transport.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ResourceInput
            resource={resource}
            resourceKey="protocol"
            label="Protocol"
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
            onChange={onChange}
          />
          <ResourceInput resource={resource} resourceKey="file" label="File" onChange={onChange} />
          {(["startLine", "startColumn", "endLine", "endColumn"] as const).map((key) => (
            <Field key={key}>
              <FieldLabel htmlFor={`correction-resource-${key}`}>
                {key === "startLine"
                  ? "Start line"
                  : key === "startColumn"
                    ? "Start column"
                    : key === "endLine"
                      ? "End line"
                      : "End column"}
              </FieldLabel>
              <Input
                id={`correction-resource-${key}`}
                type="number"
                min={1}
                value={resource.location?.[key]?.toString() ?? ""}
                onChange={(event) =>
                  onChange(updateResourceLocation(resource, key, event.target.value))
                }
              />
            </Field>
          ))}
          <ResourceInput
            resource={resource}
            resourceKey="symbol"
            label="Symbol"
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="locationFingerprint"
            label="Location fingerprint"
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
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="name"
            label="Package name"
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="installationPath"
            label="Installation path"
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
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="repository"
            label="Repository"
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="digest"
            label="Digest"
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
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="providerAccount"
            label="Provider account"
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="region"
            label="Region"
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="resourceId"
            label="Resource ID"
            onChange={onChange}
          />
          <ResourceInput
            resource={resource}
            resourceKey="subresource"
            label="Subresource"
            onChange={onChange}
          />
        </div>
      );
  }
}

function FindingCorrectionDialog({
  finding,
  users,
}: {
  finding: FindingProjection;
  users: Array<UserProfile>;
}) {
  const findingLifecycle = useFindingLifecycle();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<UpdateFinding>(() => ({
    title: finding.title,
    severity: finding.severity,
    status: finding.status,
    assigneeId: finding.assigneeId,
    dueDate: finding.dueDate,
    mitigation: finding.mitigation,
    weakness: finding.weakness,
    affectedResource: finding.affectedResource,
  }));
  const [weaknessDraft, setWeaknessDraft] = useState(() => formatWeaknessText(finding.weakness));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setDraft({
      title: finding.title,
      severity: finding.severity,
      status: finding.status,
      assigneeId: finding.assigneeId,
      dueDate: finding.dueDate,
      mitigation: finding.mitigation,
      weakness: finding.weakness,
      affectedResource: finding.affectedResource,
    });
    setWeaknessDraft(formatWeaknessText(finding.weakness));
    setError(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      reset();
      setOpen(true);
      return;
    }
    if (submitting) return;
    reset();
    setOpen(false);
  };

  const handleSubmit = async () => {
    const weakness = parseWeaknessText(weaknessDraft);
    if (!weakness) {
      setError("Weakness identifiers must use namespace=identifier entries.");
      return;
    }

    const result = updateFindingSchema.safeParse({ ...draft, weakness });
    if (!result.success) {
      const issue = result.error.issues[0];
      const location = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      setError(`Unable to save correction. ${location}${issue.message}`);
      return;
    }

    setError(null);
    setSubmitting(true);
    const corrected = await findingLifecycle.correctFinding(finding, result.data);
    setSubmitting(false);
    if (!corrected) {
      setError("Unable to save correction. Try again.");
      return;
    }
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(true)}>
        <Pencil />
        Edit finding
      </Button>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Correct finding</DialogTitle>
          <DialogDescription>
            Update finding-owned assessment and resource identity fields. Asset and observation data
            remain unchanged.
          </DialogDescription>
        </DialogHeader>
        <form
          id={`correct-finding-${finding.id}`}
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="correction-title">Title</FieldLabel>
              <Input
                id="correction-title"
                value={draft.title ?? ""}
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="correction-severity">Severity</FieldLabel>
              <Select
                value={draft.severity}
                onValueChange={(value) => value && setDraft({ ...draft, severity: value })}
              >
                <SelectTrigger id="correction-severity" className="w-full">
                  <SelectValue>
                    {(value) => formatSeverity(value as VulnerabilitySeverity)}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {vulnerabilitySeverities.map((severity) => (
                    <SelectItem key={severity} value={severity}>
                      {formatSeverity(severity)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="correction-status">Status</FieldLabel>
              <Select
                value={draft.status}
                onValueChange={(value) => value && setDraft({ ...draft, status: value })}
              >
                <SelectTrigger id="correction-status" className="w-full">
                  <SelectValue>
                    {(value) => formatFindingStatus(value as FindingStatus)}
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
            <Field>
              <FieldLabel htmlFor="correction-assignee">Assignee</FieldLabel>
              <Select
                value={draft.assigneeId ?? unassignedAssigneeValue}
                onValueChange={(value) =>
                  value &&
                  setDraft({
                    ...draft,
                    assigneeId: value === unassignedAssigneeValue ? null : value,
                  })
                }
              >
                <SelectTrigger id="correction-assignee" className="w-full">
                  <SelectValue>
                    {(value) => {
                      if (value === unassignedAssigneeValue) return "Unassigned";
                      const selected = users.find(({ id }) => id === value);
                      return selected ? getUserProfileDisplayName(selected) : "Select assignee";
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={unassignedAssigneeValue}>Unassigned</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {getUserProfileDisplayName(user)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="correction-due-date">Due date</FieldLabel>
              <Input
                id="correction-due-date"
                type="date"
                value={formatDateInputValue(draft.dueDate ?? null)}
                onChange={(event) =>
                  setDraft({ ...draft, dueDate: parseDateInputValue(event.target.value) })
                }
              />
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="correction-mitigation">Mitigation</FieldLabel>
              <Textarea
                id="correction-mitigation"
                value={draft.mitigation ?? ""}
                onChange={(event) => setDraft({ ...draft, mitigation: event.target.value || null })}
                className="min-h-24"
              />
            </Field>
          </div>
          <Separator />
          <div className="space-y-4">
            <Field>
              <FieldLabel htmlFor="correction-weakness">Weakness identifiers</FieldLabel>
              <Input
                id="correction-weakness"
                value={weaknessDraft}
                onChange={(event) => setWeaknessDraft(event.target.value)}
                placeholder="cwe=CWE-200; nuclei=admin-panel"
              />
              <FieldDescription>
                Separate namespaces with semicolons and identifiers with commas.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="correction-resource-type">Affected resource type</FieldLabel>
              <Select
                value={draft.affectedResource?.type}
                onValueChange={(value) =>
                  value &&
                  setDraft({
                    ...draft,
                    affectedResource: emptyResource(value),
                  })
                }
              >
                <SelectTrigger id="correction-resource-type" className="w-full">
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
          </div>
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={`correct-finding-${finding.id}`} disabled={submitting}>
            {submitting ? <Spinner /> : null}
            Save correction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDateTime(value: Date | null) {
  return value ? value.toLocaleString() : "Not available";
}

function formatDueDate(value: Date | null) {
  return value ? formatUtcDateOnly(value) : "Not available";
}

function formatResourceType(type: AffectedResourceType) {
  switch (type) {
    case AffectedResourceType.Asset:
      return "Asset";
    case AffectedResourceType.Unspecified:
      return "Unspecified resource";
    case AffectedResourceType.WebEndpoint:
      return "Web endpoint";
    case AffectedResourceType.NetworkService:
      return "Network service";
    case AffectedResourceType.SourceCode:
      return "Source code";
    case AffectedResourceType.Package:
      return "Package";
    case AffectedResourceType.ContainerImage:
      return "Container image";
    case AffectedResourceType.CloudResource:
      return "Cloud resource";
  }
}

function formatLocation(
  location: NonNullable<Extract<FindingAffectedResource, { type: "sourceCode" }>["location"]>,
) {
  const start = [location.startLine, location.startColumn]
    .filter((value) => value !== undefined)
    .join(":");
  const end = [location.endLine, location.endColumn]
    .filter((value) => value !== undefined)
    .join(":");
  return end ? `${start}-${end}` : start;
}

function formatResourceValue(value: unknown) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  if (value && typeof value === "object" && "kind" in value) {
    const component = value as { kind: string; name?: string };
    return component.name ? `${component.kind}: ${component.name}` : component.kind;
  }

  return "Not recorded";
}

function formatResourceDetails(entries: Array<[string, unknown]>): Array<[string, string]> {
  return entries
    .filter(([, value]) => value !== undefined)
    .map(([label, value]) => [label, formatResourceValue(value)]);
}

function getResourceDetails(resource: FindingAffectedResource): Array<[string, string]> {
  switch (resource.type) {
    case AffectedResourceType.Asset:
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
        ["File", resource.file],
        ["Location", resource.location ? formatLocation(resource.location) : undefined],
        ["Symbol", resource.symbol],
        ["Location fingerprint", resource.locationFingerprint],
      ]);
    case AffectedResourceType.Package:
      return formatResourceDetails([
        ["Ecosystem", resource.ecosystem],
        ["Package", resource.name],
        ["Installation path", resource.installationPath],
      ]);
    case AffectedResourceType.ContainerImage:
      return formatResourceDetails([
        ["Registry", resource.registry],
        ["Repository", resource.repository],
        ["Digest", resource.digest],
      ]);
    case AffectedResourceType.CloudResource:
      return formatResourceDetails([
        ["Provider", resource.provider],
        ["Provider account", resource.providerAccount],
        ["Region", resource.region],
        ["Resource ID", resource.resourceId],
        ["Subresource", resource.subresource],
      ]);
  }
}

function FindingResourceCard({ finding }: { finding: FindingProjection }) {
  const details = getResourceDetails(finding.affectedResource);

  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Affected resource</CardTitle>
        <CardDescription>Canonical resource identity used by this finding.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Type
          </div>
          <div className="mt-1 font-medium">
            {formatResourceType(finding.affectedResource.type)}
          </div>
        </div>
        {details.length > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {details.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border/60 px-4 py-3">
                <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            {finding.affectedResource.type === AffectedResourceType.Asset
              ? "The weakness applies to the asset as a whole."
              : "A narrower affected resource has not been recorded."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FindingWeaknessCard({ finding }: { finding: FindingProjection }) {
  const identifiers = Object.entries(finding.weakness.identifiers);

  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Weakness</CardTitle>
        <CardDescription>Normalized identifiers reported for this finding.</CardDescription>
      </CardHeader>
      <CardContent>
        {identifiers.length > 0 ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            {identifiers.map(([namespace, values]) => (
              <div key={namespace} className="rounded-xl border border-border/60 px-4 py-3">
                <dt className="text-xs font-medium text-muted-foreground">{namespace}</dt>
                <dd className="mt-1 break-words text-sm font-medium">{values.join(", ")}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">No weakness identifiers are recorded.</p>
        )}
      </CardContent>
    </Card>
  );
}

function FindingVulnerabilitiesCard({ finding }: { finding: FindingProjection }) {
  const vulnerabilityQuery = useQuery(createListVulnerabilitiesQueryOptions());
  const findingLifecycle = useFindingLifecycle();
  const [selectedVulnerabilityId, setSelectedVulnerabilityId] = useState("");
  const [pendingVulnerabilityId, setPendingVulnerabilityId] = useState<string | null>(null);
  const linkedVulnerabilityIds = new Set(finding.vulnerabilities.map(({ id }) => id));
  const availableVulnerabilities =
    vulnerabilityQuery.data?.filter(({ id }) => !linkedVulnerabilityIds.has(id)) ?? [];

  const formatVulnerabilityOption = (vulnerability: VulnerabilityCatalog) =>
    `${vulnerability.type.toUpperCase()}: ${vulnerability.identifier}`;

  const handleLink = async () => {
    if (!selectedVulnerabilityId) {
      return;
    }

    setPendingVulnerabilityId(selectedVulnerabilityId);
    const linked = await findingLifecycle.linkVulnerability(finding.id, selectedVulnerabilityId);
    setPendingVulnerabilityId(null);
    if (linked) {
      setSelectedVulnerabilityId("");
    }
  };

  const handleUnlink = async (vulnerability: VulnerabilityCatalog) => {
    const confirmed = await ConfirmDialog.call({
      title: "Unlink catalog entry",
      description: "This does not change the finding's title, severity, or workflow state.",
      message: `Remove ${vulnerability.identifier} from this finding?`,
      confirmText: "Unlink",
      confirmVariant: "destructive",
    });
    if (!confirmed) {
      return;
    }

    setPendingVulnerabilityId(vulnerability.id);
    await findingLifecycle.unlinkVulnerability(finding.id, vulnerability.id);
    setPendingVulnerabilityId(null);
  };

  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">Catalog enrichment</CardTitle>
        <CardDescription>
          Linked catalog entries are equal enrichment and do not control finding identity or
          severity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {finding.vulnerabilities.length > 0 ? (
          <div className="space-y-3">
            {finding.vulnerabilities.map((vulnerability) => (
              <div
                key={vulnerability.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium">{vulnerability.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {formatVulnerabilityOption(vulnerability)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Link to="/vulnerabilities/$id" params={{ id: vulnerability.id }}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Open ${vulnerability.identifier}`}
                    >
                      <ExternalLink className="text-accent-foreground" size={20} />
                    </Button>
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleUnlink(vulnerability)}
                    disabled={pendingVulnerabilityId !== null}
                  >
                    {pendingVulnerabilityId === vulnerability.id ? <Spinner /> : "Unlink"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No catalog entries are linked.</p>
        )}
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/10 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor={`finding-${finding.id}-catalog-entry`}
              className="mb-2 block text-sm font-medium"
            >
              Link catalog entry
            </label>
            <Select
              value={selectedVulnerabilityId}
              onValueChange={(value) => setSelectedVulnerabilityId(value ?? "")}
              disabled={vulnerabilityQuery.isPending || pendingVulnerabilityId !== null}
            >
              <SelectTrigger id={`finding-${finding.id}-catalog-entry`} className="w-full">
                <SelectValue>
                  {(value) => {
                    const selected = availableVulnerabilities.find(({ id }) => id === value);
                    return selected
                      ? formatVulnerabilityOption(selected)
                      : "Select a catalog entry";
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {availableVulnerabilities.map((vulnerability) => (
                  <SelectItem key={vulnerability.id} value={vulnerability.id}>
                    {formatVulnerabilityOption(vulnerability)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            onClick={() => void handleLink()}
            disabled={!selectedVulnerabilityId || pendingVulnerabilityId !== null}
          >
            {pendingVulnerabilityId === selectedVulnerabilityId ? <Spinner /> : null}
            Link entry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResponsibleOwnerLabel({
  pending,
  ownerId,
  owner,
}: {
  pending: boolean;
  ownerId: string | null | undefined;
  owner: UserProfile | null;
}) {
  if (pending) {
    return <Skeleton className="inline-flex h-4 w-24" />;
  }

  return (
    <UserLabel userId={ownerId} user={owner} emptyLabel="No Owner" unknownLabel="Unknown Owner" />
  );
}

function FindingOverviewCard({
  findingData,
  titleAction,
  users,
  assetDisplayName,
  assetType,
}: {
  findingData: FindingProjection;
  titleAction?: ReactNode;
  users: Array<UserProfile>;
  assetDisplayName?: string;
  assetType?: string;
}) {
  return (
    <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {titleAction}
            <FindingCorrectionDialog finding={findingData} users={users} />
          </div>
          <div className="flex items-center gap-2">
            <SeverityBadge severity={findingData.severity} className="h-6 px-2.5 text-xs" />
            <FindingStatusBadge status={findingData.status} className="h-6 px-2.5 text-xs" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <CardTitle className="text-2xl font-semibold tracking-tight">
              {findingData.title}
            </CardTitle>
            <CardDescription className="max-w-3xl text-sm leading-6">
              Human workflow case for one weakness affecting one asset and canonical resource.
            </CardDescription>
          </div>
          <div className="grid gap-3 xl:grid-cols-5">
            <DetailHighlightCard
              label="Affected asset"
              value={assetDisplayName ?? "Unknown asset"}
              description={capitalizeFirstLetter(assetType ?? "Unclassified")}
            />
            <DetailHighlightCard
              label="Observations"
              value={String(findingData.observationCount)}
              description="Supporting source reports"
            />
            <DetailHighlightCard
              label="Observing sources"
              value={findingData.observingSources.join(", ") || "None observed"}
              description="Lexically ordered source summary"
            />
            <DetailHighlightCard
              label="First seen"
              value={formatDateTime(findingData.firstSeen)}
              description="Earliest observation time"
            />
            <DetailHighlightCard
              label="Last seen"
              value={formatDateTime(findingData.lastSeen)}
              description="Most recent observation time"
            />
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

function FindingSidebar({
  findingData,
  assetDisplayName,
  assetPending,
  ownerId,
  owner,
  assignee,
}: {
  findingData: FindingProjection;
  assetDisplayName?: string;
  assetPending: boolean;
  ownerId: string | null | undefined;
  owner: UserProfile | null;
  assignee: UserProfile | null;
}) {
  return (
    <MetadataSidebar title="Assessment" icon={ShieldAlert}>
      <div className="space-y-4">
        <MetadataDetailRow
          label="Severity"
          value={<SeverityBadge severity={findingData.severity} className="h-7 px-3 text-sm" />}
        />
        <MetadataDetailRow
          label="Status"
          value={<FindingStatusBadge status={findingData.status} className="h-7 px-3 text-sm" />}
        />
        <MetadataDetailRow label="Due date" value={formatDueDate(findingData.dueDate)} />
        <MetadataDetailRow
          label="Assignee"
          value={
            <UserLabel
              userId={findingData.assigneeId}
              user={assignee}
              emptyLabel="Unassigned"
              unknownLabel="Unknown Assignee"
            />
          }
        />
      </div>
      <Separator />
      <div className="space-y-3">
        <MetadataDetailRow
          label="Created by"
          value={<UserLabel userId={findingData.createdBy} />}
        />
        <MetadataDetailRow
          label="Updated by"
          value={<UserLabel userId={findingData.updatedBy} />}
        />
        <MetadataDetailRow label="Asset" value={assetDisplayName ?? "Unknown asset"} />
        <MetadataDetailRow
          label="Asset owner"
          value={<ResponsibleOwnerLabel pending={assetPending} ownerId={ownerId} owner={owner} />}
        />
        <MetadataDetailRow label="Created" value={formatDateTime(findingData.createdAt)} />
        <MetadataDetailRow label="Updated" value={formatDateTime(findingData.updatedAt)} />
      </div>
    </MetadataSidebar>
  );
}

export function FindingDetailContent({ findingId, titleAction }: FindingDetailContentProps) {
  const finding = useQuery(createFindingByIDQueryOptions(findingId));
  const users = useQuery(createListUsersQueryOptions());
  const asset = useQuery({
    ...createAssetByIDQueryOptions(finding.data?.assetId ?? ""),
    enabled: Boolean(finding.data?.assetId),
  });
  const userProfileById = createUserProfileById(users.data);

  return (
    <DetailQueryBoundary
      query={finding}
      title="Finding details"
      errorTitle="Unable to load finding"
      errorDescription="The selected finding could not be loaded."
      missingMessage="The API did not return a finding record."
    >
      {(findingData) => (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            <FindingOverviewCard
              findingData={findingData}
              titleAction={titleAction}
              users={users.data ?? []}
              assetDisplayName={asset.data?.displayName}
              assetType={asset.data?.type}
            />
            <AssetInfoItem assetId={findingData.assetId} />
            <FindingWeaknessCard finding={findingData} />
            <FindingResourceCard finding={findingData} />
            <FindingObservationsSection finding={findingData} />
            <FindingVulnerabilitiesCard finding={findingData} />
            <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
              <CardHeader>
                <CardTitle className="text-xl font-semibold">Mitigation</CardTitle>
                <CardDescription>Finding-owned handling guidance.</CardDescription>
              </CardHeader>
              <CardContent>
                {findingData.mitigation ? (
                  <SafeMarkdown>{findingData.mitigation}</SafeMarkdown>
                ) : (
                  <p className="text-sm text-muted-foreground">No mitigation guidance recorded.</p>
                )}
              </CardContent>
            </Card>
          </div>
          <FindingSidebar
            findingData={findingData}
            assetDisplayName={asset.data?.displayName}
            assetPending={asset.isPending}
            ownerId={asset.data?.ownerId}
            owner={asset.data?.ownerId ? (userProfileById.get(asset.data.ownerId) ?? null) : null}
            assignee={
              findingData.assigneeId ? (userProfileById.get(findingData.assigneeId) ?? null) : null
            }
          />
        </div>
      )}
    </DetailQueryBoundary>
  );
}
