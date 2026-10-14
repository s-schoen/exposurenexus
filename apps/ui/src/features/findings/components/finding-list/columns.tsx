import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { CalendarDays, Clock3, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";
import { AssetTypeIcon } from "@/features/assets";
import { STATUS_ORDER } from "@/features/findings/components/finding-list/constants.ts";
import { FindingStatusBadge } from "@/features/findings/components/finding-status-badge.tsx";
import { FindingStatusIcon } from "@/features/findings/components/finding-status-icon.tsx";
import { formatFindingStatus } from "@/features/findings/lib/format.ts";
import {
  ASSIGNEE_LABELS,
  OWNER_LABELS,
  UserChip,
  createUserOptions,
  formatUserProfileReference,
} from "@/features/users";
import { SEVERITY_ORDER, SeverityIcon, formatSeverity } from "@/features/vulnerabilities";
import { formatDateTime, formatShortDate } from "@/lib/format.ts";
import { normalizeDateToUtcStart } from "@/lib/utc-date";

import type { DataTableColumnDef } from "@/components/data-table/types.ts";
import type { Asset } from "@exposurenexus/contracts/model/asset";
import type { Finding } from "@exposurenexus/contracts/model/finding";
import type { UserProfile } from "@exposurenexus/contracts/model/user";

export const FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE = "__unassigned_assignee__";

const severityRank = new Map(
  [...SEVERITY_ORDER].reverse().map((severity, index) => [severity, index]),
);

const overdueStatuses = new Set<FindingStatus>([FindingStatus.Active, FindingStatus.Confirmed]);

function getDateTimestamp(value: Date | null | undefined) {
  if (!value) {
    return 0;
  }

  return value.getTime();
}

function compareDateValues(left: Date | null | undefined, right: Date | null | undefined) {
  return getDateTimestamp(left) - getDateTimestamp(right);
}

function getDueDateTimestamp(value: Date | null | undefined) {
  if (!value) {
    return null;
  }

  return normalizeDateToUtcStart(value).getTime();
}

function compareDueDateValues(left: Date | null | undefined, right: Date | null | undefined) {
  const leftTime = getDueDateTimestamp(left);
  const rightTime = getDueDateTimestamp(right);

  if (leftTime === null && rightTime === null) return 0;
  if (leftTime === null) return 1;
  if (rightTime === null) return -1;

  return leftTime - rightTime;
}

export function isFindingOverdue(finding: Pick<Finding, "status" | "dueDate">, today = new Date()) {
  if (!finding.dueDate || !overdueStatuses.has(finding.status)) {
    return false;
  }

  const dueDateTime = normalizeDateToUtcStart(finding.dueDate).getTime();
  const todayTime = normalizeDateToUtcStart(today).getTime();

  return dueDateTime < todayTime;
}

export function formatFindingAssetOwner(
  assetId: string,
  assetsById: ReadonlyMap<string, Asset>,
  userProfileById: Map<string, UserProfile>,
): string {
  const asset = assetsById.get(assetId);

  if (!asset) {
    return "Unknown asset";
  }

  return formatUserProfileReference(asset.ownerId, userProfileById, OWNER_LABELS);
}

export function formatFindingAssignee(
  assigneeId: string | null,
  userProfileById: Map<string, UserProfile>,
): string {
  return formatUserProfileReference(assigneeId, userProfileById, ASSIGNEE_LABELS);
}

function DateChip({ label, value }: { label: string; value: Date | null | undefined }) {
  if (!value) {
    return null;
  }

  return (
    <Badge variant="property" title={`${label} ${formatDateTime(value)}`}>
      <Clock3 strokeWidth={1.5} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      {formatShortDate(value)}
    </Badge>
  );
}

function DueDateChip({ finding }: { finding: Finding }) {
  if (!finding.dueDate) {
    return (
      <Badge variant="property" title="No due date">
        <CalendarDays strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">No due date</span>
      </Badge>
    );
  }

  const overdue = isFindingOverdue(finding);

  return (
    <Badge variant="property" title={overdue ? "Overdue" : "Due date"}>
      <CalendarDays
        strokeWidth={1.5}
        aria-hidden="true"
        className={overdue ? "text-destructive" : undefined}
      />
      <span className={overdue ? "text-destructive" : undefined}>
        {overdue && <span className="sr-only">Overdue </span>}
        {formatShortDate(finding.dueDate, { timeZone: "UTC" })}
      </span>
    </Badge>
  );
}

function resolveUser(
  userId: string | null,
  userProfileById: Map<string, UserProfile>,
  usersLoading: boolean,
) {
  if (!userId) return null;
  if (usersLoading) return undefined;

  return userProfileById.get(userId) ?? null;
}

export function createFindingColumns(
  assetNamesById: ReadonlyMap<string, string>,
  assetsById: ReadonlyMap<string, Asset> = new Map(),
  userProfileById: Map<string, UserProfile> = new Map(),
  usersLoading = false,
): Array<DataTableColumnDef<Finding>> {
  return [
    {
      accessorKey: "severity",
      sortFn: (rowA, rowB) => {
        const left = severityRank.get(rowA.original.severity) ?? -1;
        const right = severityRank.get(rowB.original.severity) ?? -1;

        return left - right;
      },
      cell: ({ row }) => <SeverityIcon severity={row.original.severity} />,
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.original.severity);
      },
      enableHiding: false,
      meta: {
        label: "Severity",
        placement: "leading",
        filterVariant: "select",
        options: SEVERITY_ORDER.map((severity) => ({
          label: formatSeverity(severity),
          value: severity,
          icon: <SeverityIcon severity={severity} decorative />,
        })),
      },
    },
    {
      accessorKey: "title",
      cell: ({ row }) => row.original.title,
      enableColumnFilter: false,
      enableHiding: false,
      meta: { label: "Title", placement: "title" },
    },
    {
      accessorKey: "status",
      cell: ({ row }) => <FindingStatusBadge status={row.original.status} />,
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.original.status);
      },
      meta: {
        label: "Status",
        placement: "property",
        filterVariant: "select",
        options: STATUS_ORDER.map((status) => ({
          label: formatFindingStatus(status),
          value: status,
          icon: <FindingStatusIcon status={status} decorative />,
        })),
      },
    },
    {
      id: "assetId",
      // Search and order by the asset's name; group by its id, so equally named assets stay apart.
      accessorFn: (finding) => assetNamesById.get(finding.assetId) ?? "Unknown asset",
      getGroupingValue: (finding) => finding.assetId,
      cell: ({ row }) => {
        const asset = assetsById.get(row.original.assetId);

        return (
          <Badge variant="property" title="Asset">
            {asset && <AssetTypeIcon type={asset.type} decorative />}
            <span className="max-w-40 truncate">
              {assetNamesById.get(row.original.assetId) ?? "Unknown asset"}
            </span>
          </Badge>
        );
      },
      meta: { label: "Asset", placement: "property" },
    },
    {
      id: "responsibleOwner",
      accessorFn: (finding) =>
        formatFindingAssetOwner(finding.assetId, assetsById, userProfileById),
      cell: ({ row }) => {
        const asset = assetsById.get(row.original.assetId);

        if (!asset) {
          return (
            <Badge variant="property" title="Asset owner">
              <span className="text-muted-foreground">Unknown asset</span>
            </Badge>
          );
        }

        return (
          <UserChip
            userId={asset.ownerId}
            user={resolveUser(asset.ownerId, userProfileById, usersLoading)}
            labels={OWNER_LABELS}
            title="Asset owner"
          />
        );
      },
      enableColumnFilter: false,
      meta: { label: "Asset owner", placement: "property" },
    },
    {
      accessorKey: "dueDate",
      sortFn: (rowA, rowB) => compareDueDateValues(rowA.original.dueDate, rowB.original.dueDate),
      cell: ({ row }) => <DueDateChip finding={row.original} />,
      enableColumnFilter: false,
      meta: { label: "Due date", placement: "property" },
    },
    {
      id: "assignee",
      accessorFn: (finding) => formatFindingAssignee(finding.assigneeId, userProfileById),
      getGroupingValue: (finding) => finding.assigneeId ?? FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE,
      cell: ({ row }) => (
        <UserChip
          userId={row.original.assigneeId}
          user={resolveUser(row.original.assigneeId, userProfileById, usersLoading)}
          labels={ASSIGNEE_LABELS}
          title="Assignee"
        />
      ),
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;

        const assigneeFilterValue =
          row.original.assigneeId ?? FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE;

        return filterValue.includes(assigneeFilterValue);
      },
      meta: {
        label: "Assignee",
        placement: "property",
        filterVariant: "select",
        options: createUserOptions([...userProfileById.values()], ASSIGNEE_LABELS, {
          emptyValue: FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE,
        }),
      },
    },
    {
      id: "observationCount",
      accessorFn: (finding) => finding.observationCount,
      cell: ({ row }) => (
        <Badge variant="property" title="Observations">
          <Eye strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">Observations</span>
          {row.original.observationCount}
        </Badge>
      ),
      meta: { label: "Observations", placement: "property" },
    },
    {
      accessorKey: "firstSeen",
      sortFn: (rowA, rowB) => compareDateValues(rowA.original.firstSeen, rowB.original.firstSeen),
      cell: ({ row }) => <DateChip label="First seen" value={row.original.firstSeen} />,
      meta: { label: "First seen", placement: "property" },
    },
    {
      accessorKey: "lastSeen",
      sortFn: (rowA, rowB) => compareDateValues(rowA.original.lastSeen, rowB.original.lastSeen),
      cell: ({ row }) => <DateChip label="Last seen" value={row.original.lastSeen} />,
      meta: { label: "Last seen", placement: "property" },
    },
    {
      accessorKey: "updatedAt",
      sortFn: (rowA, rowB) => compareDateValues(rowA.original.updatedAt, rowB.original.updatedAt),
      cell: ({ row }) => <DateChip label="Updated" value={row.original.updatedAt} />,
      enableColumnFilter: false,
      meta: { label: "Updated", placement: "property" },
    },
  ];
}
