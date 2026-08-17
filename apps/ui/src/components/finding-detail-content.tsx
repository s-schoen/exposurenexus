import { AffectedResourceType } from "@exposurenexus/types/model/affected-resource";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { useState } from "react";

import { createAssetByIDQueryOptions } from "@/api/asset.ts";
import { createFindingByIDQueryOptions } from "@/api/finding.ts";
import { createListUsersQueryOptions } from "@/api/user.ts";
import { createListVulnerabilitiesQueryOptions } from "@/api/vulnerability.ts";
import { AssetInfoItem } from "@/components/asset-info-item.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx";
import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { UserLabel, createUserProfileById } from "@/components/user-label.tsx";
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts";
import { capitalizeFirstLetter } from "@/lib/format.ts";

import type { FindingAffectedResource } from "@exposurenexus/types/model/affected-resource";
import type { FindingProjection } from "@exposurenexus/types/model/finding";
import type { VulnerabilityCatalog } from "@exposurenexus/types/model/vulnerability";
import type { ReactNode } from "react";

interface FindingDetailContentProps {
  findingId: string;
  titleAction?: ReactNode;
}

function formatDateTime(value: Date | null) {
  return value ? value.toLocaleString() : "Not available";
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

export function FindingDetailContent({ findingId, titleAction }: FindingDetailContentProps) {
  const finding = useQuery(createFindingByIDQueryOptions(findingId));
  const users = useQuery(createListUsersQueryOptions());
  const asset = useQuery({
    ...createAssetByIDQueryOptions(finding.data?.assetId ?? ""),
    enabled: Boolean(finding.data?.assetId),
  });
  const userProfileById = createUserProfileById(users.data);

  function ResponsibleOwnerLabel() {
    if (asset.isPending) {
      return <Skeleton className="inline-flex h-4 w-24" />;
    }

    return (
      <UserLabel
        userId={asset.data?.ownerId}
        user={asset.data?.ownerId ? (userProfileById.get(asset.data.ownerId) ?? null) : null}
        emptyLabel="No Owner"
        unknownLabel="Unknown Owner"
      />
    );
  }

  function FindingOverviewCard({ findingData }: { findingData: FindingProjection }) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{titleAction}</div>
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
                value={asset.data?.displayName ?? "Unknown asset"}
                description={capitalizeFirstLetter(asset.data?.type ?? "Unclassified")}
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

  function FindingSidebar({ findingData }: { findingData: FindingProjection }) {
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
          <MetadataDetailRow label="Due date" value={formatDateTime(findingData.dueDate)} />
          <MetadataDetailRow
            label="Assignee"
            value={
              <UserLabel
                userId={findingData.assigneeId}
                user={
                  findingData.assigneeId
                    ? (userProfileById.get(findingData.assigneeId) ?? null)
                    : null
                }
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
          <MetadataDetailRow label="Asset" value={asset.data?.displayName ?? "Unknown asset"} />
          <MetadataDetailRow label="Asset owner" value={<ResponsibleOwnerLabel />} />
          <MetadataDetailRow label="Created" value={formatDateTime(findingData.createdAt)} />
          <MetadataDetailRow label="Updated" value={formatDateTime(findingData.updatedAt)} />
        </div>
      </MetadataSidebar>
    );
  }

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
            <FindingOverviewCard findingData={findingData} />
            <AssetInfoItem assetId={findingData.assetId} />
            <FindingWeaknessCard finding={findingData} />
            <FindingResourceCard finding={findingData} />
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
          <FindingSidebar findingData={findingData} />
        </div>
      )}
    </DetailQueryBoundary>
  );
}
