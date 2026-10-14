import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  CalendarDays,
  CircleDot,
  Clock3,
  Eye,
  History,
  Plus,
  Server,
  SignalHigh,
  Unlink,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Inplace } from "@/components/inplace.tsx";
import { DetailLayout } from "@/components/properties-panel/detail-layout.tsx";
import {
  DetailField,
  DetailFields,
  DetailList,
  DetailListItem,
} from "@/components/properties-panel/detail-rows.tsx";
import { DetailSection } from "@/components/properties-panel/detail-section.tsx";
import {
  PropertiesAuditLines,
  PropertiesPanel,
  PropertyGroup,
  PropertyRow,
  PropertyValue,
} from "@/components/properties-panel/properties-panel.tsx";
import { PropertyDate } from "@/components/properties-panel/property-date.tsx";
import { PropertySelect } from "@/components/properties-panel/property-select.tsx";
import { SafeMarkdown } from "@/components/safe-markdown.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { AssetTypeIcon } from "@/features/assets";
import { STATUS_ORDER } from "@/features/findings/components/finding-list/constants.ts";
import { FindingObservationsSection } from "@/features/findings/components/finding-observations-section.tsx";
import { FindingStatusIcon } from "@/features/findings/components/finding-status-icon.tsx";
import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import {
  formatResourceType,
  getResourceDetails,
  isIdentifierResourceDetail,
} from "@/features/findings/lib/affected-resource.ts";
import { formatFindingStatus } from "@/features/findings/lib/format.ts";
import { formatWeaknessIdentifier } from "@/features/findings/lib/weakness-text.ts";
import {
  ASSIGNEE_LABELS,
  OWNER_LABELS,
  UserAvatar,
  createListUsersQueryOptions,
  createUserOptions,
  createUserProfileById,
  formatUserProfileReference,
} from "@/features/users";
import {
  SEVERITY_ORDER,
  SeverityIcon,
  createListVulnerabilitiesQueryOptions,
  formatSeverity,
} from "@/features/vulnerabilities";
import { formatDateTime } from "@/lib/format.ts";

import type { PropertyOption } from "@/components/properties-panel/property-select.tsx";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Finding, FindingStatus, UpdateFinding } from "@exposurenexus/contracts/model/finding";
import type {
  VulnerabilityCatalog,
  VulnerabilitySeverity,
} from "@exposurenexus/contracts/model/vulnerability";

const unassignedValue = "__unassigned__";

const statusOptions: Array<PropertyOption<FindingStatus>> = STATUS_ORDER.map((status) => ({
  value: status,
  label: formatFindingStatus(status),
  icon: <FindingStatusIcon status={status} decorative />,
}));

const severityOptions: Array<PropertyOption<VulnerabilitySeverity>> = SEVERITY_ORDER.map(
  (severity) => ({
    value: severity,
    label: formatSeverity(severity),
    icon: <SeverityIcon severity={severity} decorative />,
  }),
);

function FindingPropertiesPanel({ finding, asset }: { finding: Finding; asset: Asset }) {
  const findingLifecycle = useFindingLifecycle();
  const users = useQuery(createListUsersQueryOptions());
  const userProfileById = createUserProfileById(users.data);
  const owner = asset.ownerId ? userProfileById.get(asset.ownerId) : null;
  const userName = (userId: string | null) =>
    users.isPending ? "…" : formatUserProfileReference(userId, userProfileById);

  const correct = async (update: UpdateFinding) =>
    (await findingLifecycle.correctFinding(finding.id, update)) !== null;

  return (
    <PropertiesPanel
      footer={
        <PropertiesAuditLines
          createdBy={userName(finding.createdBy)}
          createdAt={finding.createdAt}
          updatedBy={userName(finding.updatedBy)}
          updatedAt={finding.updatedAt}
        />
      }
    >
      <PropertyGroup>
        <PropertyRow icon={CircleDot} label="Status">
          <PropertySelect
            value={finding.status}
            options={statusOptions}
            searchPlaceholder="Search statuses…"
            onCommit={(status) => correct({ status })}
          />
        </PropertyRow>
        <PropertyRow icon={SignalHigh} label="Severity">
          <PropertySelect
            value={finding.severity}
            options={severityOptions}
            searchPlaceholder="Search severities…"
            onCommit={(severity) => correct({ severity })}
          />
        </PropertyRow>
        <PropertyRow icon={UserRound} label="Assignee">
          <PropertySelect
            value={finding.assigneeId ?? unassignedValue}
            options={createUserOptions(users.data, ASSIGNEE_LABELS, {
              emptyValue: unassignedValue,
              currentUserId: finding.assigneeId,
            })}
            searchPlaceholder="Search users…"
            onCommit={(assigneeId) =>
              correct({ assigneeId: assigneeId === unassignedValue ? null : assigneeId })
            }
          />
        </PropertyRow>
        <PropertyRow icon={CalendarDays} label="Due date">
          <PropertyDate
            label="Due date"
            value={finding.dueDate}
            emptyLabel="No due date"
            onCommit={(dueDate) => correct({ dueDate })}
          />
        </PropertyRow>
      </PropertyGroup>
      <PropertyGroup>
        <PropertyRow icon={Server} label="Asset">
          <Link
            to="/assets/$id"
            params={{ id: asset.id }}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-foreground transition-colors duration-100 hover:bg-accent"
          >
            <AssetTypeIcon type={asset.type} decorative />
            <span className="truncate">{asset.displayName}</span>
            <ArrowUpRight
              className="size-3.5 shrink-0 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </Link>
        </PropertyRow>
        <PropertyRow icon={UserRoundCheck} label="Asset owner">
          <PropertyValue>
            <UserAvatar
              userId={asset.ownerId}
              user={users.isPending ? undefined : (owner ?? null)}
              decorative
            />
            <span className="truncate">
              {users.isPending
                ? null
                : formatUserProfileReference(asset.ownerId, userProfileById, OWNER_LABELS)}
            </span>
          </PropertyValue>
        </PropertyRow>
      </PropertyGroup>
      <PropertyGroup>
        <PropertyRow icon={History} label="First seen">
          <PropertyValue>
            {finding.firstSeen ? formatDateTime(finding.firstSeen) : "–"}
          </PropertyValue>
        </PropertyRow>
        <PropertyRow icon={Clock3} label="Last seen">
          <PropertyValue>{finding.lastSeen ? formatDateTime(finding.lastSeen) : "–"}</PropertyValue>
        </PropertyRow>
        <PropertyRow icon={Eye} label="Observations">
          <PropertyValue>
            <span className="tabular-nums">{finding.observationCount}</span>
          </PropertyValue>
        </PropertyRow>
      </PropertyGroup>
    </PropertiesPanel>
  );
}

function AffectedResourceSection({ finding }: { finding: Finding }) {
  const details = getResourceDetails(finding.affectedResource);

  return (
    <DetailSection title="Affected resource">
      <DetailFields>
        <DetailField label="Type">{formatResourceType(finding.affectedResource.type)}</DetailField>
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
    </DetailSection>
  );
}

function WeaknessSection({ finding }: { finding: Finding }) {
  const identifiers = Object.entries(finding.weakness.identifiers);

  return (
    <DetailSection title="Weakness">
      {identifiers.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {identifiers.flatMap(([namespace, values]) =>
            values.map((value) => (
              <li key={`${namespace}:${value}`}>
                <Badge variant="property" title={namespace}>
                  <span className="font-mono">{formatWeaknessIdentifier(namespace, value)}</span>
                </Badge>
              </li>
            )),
          )}
        </ul>
      ) : (
        <p className="text-13 text-subtle-foreground">No weakness identifiers are recorded.</p>
      )}
    </DetailSection>
  );
}

function LinkVulnerabilityPicker({
  finding,
  pending,
  onLink,
}: {
  finding: Finding;
  pending: boolean;
  onLink: (vulnerabilityId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const vulnerabilities = useQuery({ ...createListVulnerabilitiesQueryOptions(), enabled: open });
  const linkedIds = new Set(finding.vulnerabilities.map(({ id }) => id));
  const available = vulnerabilities.data?.filter(({ id }) => !linkedIds.has(id)) ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={pending}
        render={<Button variant="ghost" size="icon-sm" aria-label="Link catalog entry" />}
      >
        {pending ? <Spinner /> : <Plus strokeWidth={1.5} />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-0 p-0">
        <Command>
          <CommandInput aria-label="Search catalog entries" placeholder="Search catalog…" />
          <CommandList>
            <CommandEmpty>
              {vulnerabilities.isPending ? "Loading…" : "No catalog entries to link."}
            </CommandEmpty>
            <CommandGroup>
              {available.map((vulnerability) => (
                <CommandItem
                  key={vulnerability.id}
                  value={vulnerability.id}
                  keywords={[vulnerability.identifier, vulnerability.title]}
                  onSelect={() => {
                    setOpen(false);
                    onLink(vulnerability.id);
                  }}
                >
                  <SeverityIcon severity={vulnerability.severity} decorative />
                  <span className="shrink-0 font-mono text-xs">{vulnerability.identifier}</span>
                  <span className="truncate text-muted-foreground">{vulnerability.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function VulnerabilitiesSection({ finding }: { finding: Finding }) {
  const findingLifecycle = useFindingLifecycle();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const link = async (vulnerabilityId: string) => {
    setPendingId(vulnerabilityId);
    await findingLifecycle.linkVulnerability(finding.id, vulnerabilityId);
    setPendingId(null);
  };

  const unlink = async (vulnerability: VulnerabilityCatalog) => {
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

    setPendingId(vulnerability.id);
    await findingLifecycle.unlinkVulnerability(finding.id, vulnerability.id);
    setPendingId(null);
  };

  return (
    <DetailSection
      title="Vulnerabilities"
      count={finding.vulnerabilities.length}
      action={
        <LinkVulnerabilityPicker
          finding={finding}
          pending={pendingId !== null}
          onLink={(id) => void link(id)}
        />
      }
    >
      {finding.vulnerabilities.length > 0 ? (
        <DetailList label="Linked vulnerabilities">
          {finding.vulnerabilities.map((vulnerability) => (
            <DetailListItem
              key={vulnerability.id}
              actions={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Unlink ${vulnerability.identifier}`}
                  title="Unlink"
                  aria-busy={pendingId === vulnerability.id || undefined}
                  disabled={pendingId !== null}
                  onClick={() => void unlink(vulnerability)}
                >
                  {pendingId === vulnerability.id ? <Spinner /> : <Unlink strokeWidth={1.5} />}
                </Button>
              }
            >
              <SeverityIcon severity={vulnerability.severity} />
              <span className="shrink-0 font-mono text-xs text-muted-foreground">
                {vulnerability.identifier}
              </span>
              <Link
                to="/vulnerabilities/$id"
                params={{ id: vulnerability.id }}
                className="min-w-0 flex-1 truncate font-medium hover:underline"
              >
                {vulnerability.title}
              </Link>
            </DetailListItem>
          ))}
        </DetailList>
      ) : (
        <p className="text-13 text-subtle-foreground">No catalog entries are linked.</p>
      )}
    </DetailSection>
  );
}

interface FindingDetailContentProps {
  finding: Finding;
  asset: Asset;
}

function FindingTitle({ finding }: { finding: Finding }) {
  const findingLifecycle = useFindingLifecycle();

  return (
    <h2 className="min-w-0 text-2xl leading-tight font-semibold break-words text-foreground">
      <Inplace
        value={finding.title}
        onSave={async (title) => {
          // A finding needs a title; clearing it keeps the current one.
          if (title.trim()) {
            await findingLifecycle.correctFinding(finding.id, { title: title.trim() });
          }
        }}
        displayElement={(title) => <span>{title}</span>}
        editOnClick
        showEditIcon={false}
      />
    </h2>
  );
}

export function FindingDetailContent({ finding, asset }: FindingDetailContentProps) {
  return (
    <DetailLayout
      header={
        <>
          <FindingTitle finding={finding} />
          {finding.mitigation ? (
            <SafeMarkdown className="mt-3">{finding.mitigation}</SafeMarkdown>
          ) : (
            <p className="mt-3 text-sm text-subtle-foreground">No mitigation recorded.</p>
          )}
        </>
      }
      panel={<FindingPropertiesPanel finding={finding} asset={asset} />}
    >
      <AffectedResourceSection finding={finding} />
      <WeaknessSection finding={finding} />
      <VulnerabilitiesSection finding={finding} />
      <FindingObservationsSection finding={finding} />
    </DetailLayout>
  );
}
