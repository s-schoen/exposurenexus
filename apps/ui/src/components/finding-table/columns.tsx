import { normalizeDateToUtcStart } from "@exposurenexus/types/model/date";
import { FindingStatus } from "@exposurenexus/types/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/types/model/vulnerability";

import { DataTableColumnHeader } from "@/components/data-table/column-header.tsx";
import { FindingStatusBadge } from "@/components/finding-status-badge.tsx";
import { SEVERITY_ORDER } from "@/components/finding-table/constants.ts";
import { SeverityBadge } from "@/components/severity-badge.tsx";
import {
  UserLabel,
  formatUserProfileReference,
  getUserProfileDisplayName,
} from "@/components/user-label.tsx";

import type { Asset } from "@exposurenexus/types/model/asset";
import type { Finding } from "@exposurenexus/types/model/finding";
import type { UserProfile } from "@exposurenexus/types/model/user";
import type { ColumnDef } from "@tanstack/react-table";

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

function FindingDateCell({ value }: { value: Date | null | undefined }) {
  if (!value) {
    return <span className="text-muted-foreground">Not available</span>;
  }

  return (
    <span className="whitespace-nowrap font-medium text-foreground">{value.toLocaleString()}</span>
  );
}

export function formatFindingDueDate(value: Date | null | undefined) {
  if (!value) {
    return "No due date";
  }

  return normalizeDateToUtcStart(value).toISOString().slice(0, 10);
}

export function isFindingOverdue(finding: Pick<Finding, "status" | "dueDate">, today = new Date()) {
  if (!finding.dueDate || !overdueStatuses.has(finding.status)) {
    return false;
  }

  const dueDateTime = normalizeDateToUtcStart(finding.dueDate).getTime();
  const todayTime = normalizeDateToUtcStart(today).getTime();

  return dueDateTime < todayTime;
}

function FindingDueDateCell({ finding }: { finding: Finding }) {
  if (!finding.dueDate) {
    return <span className="text-muted-foreground">No due date</span>;
  }

  const overdue = isFindingOverdue(finding);

  return (
    <span
      className={
        overdue
          ? "block -mx-2 -my-2 whitespace-nowrap bg-destructive/5 px-2 py-2 font-medium text-foreground"
          : "whitespace-nowrap font-medium text-foreground"
      }
    >
      {formatFindingDueDate(finding.dueDate)}
    </span>
  );
}

export function formatFindingAssetOwner(
  assetId: string,
  assetsById: ReadonlyMap<string, Asset>,
  userProfileById: Map<string, UserProfile>,
): string {
  const asset = assetsById.get(assetId);

  if (!asset) {
    return "Unknown Asset";
  }

  return formatUserProfileReference(asset.ownerId, userProfileById, {
    emptyLabel: "No Owner",
    unknownLabel: "Unknown Owner",
  });
}

export function formatFindingAssignee(
  assigneeId: string | null,
  userProfileById: Map<string, UserProfile>,
): string {
  return formatUserProfileReference(assigneeId, userProfileById, {
    emptyLabel: "Unassigned",
    unknownLabel: "Unknown Assignee",
  });
}

export function createFindingColumns(
  assetNamesById: ReadonlyMap<string, string>,
  assetsById: ReadonlyMap<string, Asset> = new Map(),
  userProfileById: Map<string, UserProfile> = new Map(),
  usersLoading = false,
): Array<ColumnDef<Finding>> {
  return [
    {
      accessorKey: "vulnerability.title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div className="min-w-0 py-0.5">
          <div className="truncate font-medium text-foreground">
            {row.original.vulnerability.title}
          </div>
        </div>
      ),
      enableColumnFilter: false,
    },
    {
      accessorKey: "severity",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Severity" />,
      sortingFn: (rowA, rowB) => {
        const left = severityRank.get(rowA.original.severity) ?? -1;
        const right = severityRank.get(rowB.original.severity) ?? -1;

        return left - right;
      },
      cell: ({ row }) => {
        return <SeverityBadge severity={row.getValue("severity")} />;
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.getValue("severity"));
      },
      meta: {
        label: "Severity",
        filterVariant: "select",
        options: Object.keys(VulnerabilitySeverity).map((severity) => ({
          label: severity,
          value: VulnerabilitySeverity[severity as keyof typeof VulnerabilitySeverity],
        })),
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        return <FindingStatusBadge status={row.getValue("status")} />;
      },
      filterFn: (row, _columnId, filterValue: Array<string>) => {
        if (filterValue.length === 0) return true;
        return filterValue.includes(row.getValue("status"));
      },
      meta: {
        label: "Status",
        filterVariant: "select",
        options: Object.keys(FindingStatus).map((status) => ({
          label: status,
          value: FindingStatus[status as keyof typeof FindingStatus],
        })),
      },
    },
    {
      accessorKey: "assetId",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Asset" />,
      cell: ({ row }) => {
        const assetName = assetNamesById.get(row.original.assetId);

        return (
          <div className="min-w-0">
            <span className="truncate font-medium text-foreground">
              {assetName ?? "Unknown asset"}
            </span>
          </div>
        );
      },
    },
    {
      id: "responsibleOwner",
      accessorFn: (finding) =>
        formatFindingAssetOwner(finding.assetId, assetsById, userProfileById),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Asset Owner" />,
      cell: ({ row }) => {
        const asset = assetsById.get(row.original.assetId);

        if (!asset) {
          return <span className="text-muted-foreground">Unknown Asset</span>;
        }

        return (
          <UserLabel
            userId={asset.ownerId}
            user={
              asset.ownerId && usersLoading
                ? undefined
                : asset.ownerId
                  ? (userProfileById.get(asset.ownerId) ?? null)
                  : null
            }
            emptyLabel="No Owner"
            unknownLabel="Unknown Owner"
          />
        );
      },
      enableColumnFilter: false,
    },
    {
      id: "assignee",
      accessorFn: (finding) => formatFindingAssignee(finding.assigneeId, userProfileById),
      getGroupingValue: (finding) => finding.assigneeId ?? FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Assignee" />,
      cell: ({ row }) => (
        <UserLabel
          userId={row.original.assigneeId}
          user={
            row.original.assigneeId && usersLoading
              ? undefined
              : row.original.assigneeId
                ? (userProfileById.get(row.original.assigneeId) ?? null)
                : null
          }
          emptyLabel="Unassigned"
          unknownLabel="Unknown Assignee"
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
        filterVariant: "select",
        options: [
          {
            label: "Unassigned",
            value: FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE,
          },
          ...Array.from(userProfileById.values()).map((user) => ({
            label: getUserProfileDisplayName(user),
            value: user.id,
          })),
        ],
      },
    },
    {
      accessorKey: "dueDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due Date" />,
      sortingFn: (rowA, rowB) => compareDueDateValues(rowA.original.dueDate, rowB.original.dueDate),
      cell: ({ row }) => <FindingDueDateCell finding={row.original} />,
      enableColumnFilter: false,
    },
    {
      accessorKey: "source",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Source" />,
      cell: ({ row }) => (
        <span className="inline-flex rounded-full border border-border/70 bg-muted/35 px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {row.original.source || "Manual"}
        </span>
      ),
    },
    {
      accessorKey: "firstSeen",
      header: ({ column }) => <DataTableColumnHeader column={column} title="First Seen" />,
      sortingFn: (rowA, rowB) =>
        compareDateValues(rowA.original.firstSeen, rowB.original.firstSeen),
      cell: ({ row }) => <FindingDateCell value={row.getValue("firstSeen")} />,
    },
    {
      accessorKey: "lastSeen",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Last Seen" />,
      sortingFn: (rowA, rowB) => compareDateValues(rowA.original.lastSeen, rowB.original.lastSeen),
      cell: ({ row }) => <FindingDateCell value={row.getValue("lastSeen")} />,
    },
  ];
}
