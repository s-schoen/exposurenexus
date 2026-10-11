import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Server, ShieldAlert } from "lucide-react";
import { useMemo } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DataList } from "@/components/data-list/data-list.tsx";
import { DataListEmpty } from "@/components/data-list/empty-state.tsx";
import { Button } from "@/components/ui/button.tsx";
import { createListAssetsQueryOptions } from "@/features/assets";
import {
  FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE,
  createFindingColumns,
  formatFindingAssignee,
} from "@/features/findings/components/finding-list/columns.tsx";
import { STATUS_ORDER } from "@/features/findings/components/finding-list/constants.ts";
import { FindingContextMenu } from "@/features/findings/components/finding-list/context-menu.tsx";
import { FindingStatusIcon } from "@/features/findings/components/finding-status-icon.tsx";
import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import { formatFindingStatus } from "@/features/findings/lib/format.ts";
import { createListFindingsQueryOptions } from "@/features/findings/queries/findings.ts";
import { UserAvatar, createListUsersQueryOptions, createUserProfileById } from "@/features/users";
import { SEVERITY_ORDER, SeverityIcon, formatSeverity } from "@/features/vulnerabilities";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { Finding, FindingStatus } from "@exposurenexus/contracts/model/finding";
import type { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";

const initialSorting = [{ id: "updatedAt", desc: true }];
// Plane's default row: severity, title, then status, asset, due date and assignee.
const initialColumnVisibility = {
  responsibleOwner: false,
  observationCount: false,
  firstSeen: false,
  lastSeen: false,
  updatedAt: false,
};

function compareByOrder<T>(order: ReadonlyArray<T>) {
  return (left: unknown, right: unknown) => order.indexOf(left as T) - order.indexOf(right as T);
}

interface FindingListProps {
  grouping?: string;
  onGroupingChange?: (grouping: string | undefined) => void;
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  selectedFindingId?: string;
  onSelectFinding?: (finding: Finding) => void;
}

export function FindingList({
  grouping,
  onGroupingChange,
  filterState,
  onFilterStateChange,
  selectedFindingId,
  onSelectFinding,
}: FindingListProps) {
  const navigate = useNavigate();
  const findingLifecycle = useFindingLifecycle();
  const findingsQuery = useSuspenseQuery(createListFindingsQueryOptions());
  const assetsQuery = useSuspenseQuery(createListAssetsQueryOptions());
  const usersQuery = useSuspenseQuery(createListUsersQueryOptions());

  const assetsById = useMemo(
    () => new Map(assetsQuery.data.map((asset) => [asset.id, asset])),
    [assetsQuery.data],
  );
  const assetNamesById = useMemo(
    () => new Map(assetsQuery.data.map((asset) => [asset.id, asset.displayName])),
    [assetsQuery.data],
  );
  const userProfileById = useMemo(() => createUserProfileById(usersQuery.data), [usersQuery.data]);

  const columns = useMemo(
    () => createFindingColumns(assetNamesById, assetsById, userProfileById, usersQuery.isPending),
    [assetNamesById, assetsById, userProfileById, usersQuery.isPending],
  );

  const groupingOptions = useMemo<Array<GroupingOption>>(
    () => [
      {
        id: "status",
        label: "Status",
        formatValue: (value) => formatFindingStatus(value as FindingStatus),
        renderIcon: (value) => <FindingStatusIcon status={value as FindingStatus} decorative />,
        compareValues: compareByOrder(STATUS_ORDER),
      },
      {
        id: "severity",
        label: "Severity",
        formatValue: (value) => formatSeverity(value as VulnerabilitySeverity),
        renderIcon: (value) => (
          <SeverityIcon severity={value as VulnerabilitySeverity} decorative />
        ),
        compareValues: compareByOrder(SEVERITY_ORDER),
      },
      {
        id: "assetId",
        label: "Asset",
        formatValue: (value) => assetNamesById.get(String(value)) ?? "Unknown asset",
        renderIcon: () => (
          <Server className="size-4 text-muted-foreground" strokeWidth={1.5} aria-hidden="true" />
        ),
      },
      {
        id: "responsibleOwner",
        label: "Asset owner",
      },
      {
        id: "assignee",
        label: "Assignee",
        formatValue: (value) =>
          String(value) === FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE
            ? "Unassigned"
            : formatFindingAssignee(String(value), userProfileById),
        renderIcon: (value) => {
          const userId =
            String(value) === FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE ? null : String(value);

          return (
            <UserAvatar
              userId={userId}
              user={userId ? (userProfileById.get(userId) ?? null) : null}
              emptyLabel="Unassigned"
              unknownLabel="Unknown assignee"
            />
          );
        },
      },
    ],
    [assetNamesById, userProfileById],
  );

  const handleOpenFinding = async (finding: Finding) => {
    await navigate({
      to: "/findings/$id",
      params: {
        id: finding.id,
      },
    });
  };

  const handleDeleteFindings = async (findings: Array<Finding>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete findings",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${findings.length} findings(s)?`,
      confirmVariant: "destructive",
    });

    if (confirmed) {
      await findingLifecycle.deleteFindings(findings);
    }
  };

  return (
    <DataList
      label="Findings"
      columns={columns}
      query={findingsQuery}
      getRowId={(finding) => finding.id}
      getRowHref={(finding) => `/findings/${finding.id}`}
      groupingOptions={groupingOptions}
      grouping={grouping}
      onGroupingChange={onGroupingChange}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      initialSorting={initialSorting}
      initialColumnVisibility={initialColumnVisibility}
      onRowClick={onSelectFinding}
      onRowDoubleClick={handleOpenFinding}
      isRowActive={(finding) => finding.id === selectedFindingId}
      onRowDelete={handleDeleteFindings}
      contextMenu={(findings, children, key) => (
        <FindingContextMenu
          key={key}
          findings={findings}
          onDelete={() => handleDeleteFindings(findings)}
        >
          {children}
        </FindingContextMenu>
      )}
      emptyState={
        <DataListEmpty icon={ShieldAlert} message="No findings yet.">
          <Button variant="outline" onClick={() => void navigate({ to: "/findings/new" })}>
            <Plus />
            New finding
          </Button>
        </DataListEmpty>
      }
    />
  );
}
