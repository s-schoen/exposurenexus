import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo } from "react";

import { createListAssetsQueryOptions } from "@/api/asset.ts";
import { createListFindingsQueryOptions } from "@/api/finding.ts";
import { createListUsersQueryOptions } from "@/api/user.ts";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { DataTable } from "@/components/data-table/data-table.tsx";
import {
  FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE,
  createFindingColumns,
  formatFindingAssignee,
} from "@/components/finding-table/columns.tsx";
import { FindingContextMenu } from "@/components/finding-table/context-menu.tsx";
import { Button } from "@/components/ui/button.tsx";
import { createUserProfileById } from "@/components/user-label.tsx";
import { useFindingLifecycle } from "@/hooks/use-finding-lifecycle.ts";

import type { DataTableFilterState, GroupingOption } from "@/components/data-table/types.ts";
import type { Finding } from "@exposurenexus/contracts/model/finding";

interface FindingTableProps {
  initialGrouping?: Array<string>;
  filterState?: DataTableFilterState;
  onFilterStateChange?: (state: DataTableFilterState) => void;
  selectedFindingId?: string;
  onSelectFinding?: (finding: Finding) => void;
}

export function FindingTable({
  initialGrouping = [],
  filterState,
  onFilterStateChange,
  selectedFindingId,
  onSelectFinding,
}: FindingTableProps) {
  const navigate = useNavigate();
  const findingLifecycle = useFindingLifecycle();
  const findingsQuery = useQuery(createListFindingsQueryOptions());
  const assetsQuery = useQuery(createListAssetsQueryOptions());
  const usersQuery = useQuery(createListUsersQueryOptions());

  const assetsById = useMemo(
    () => new Map((assetsQuery.data ?? []).map((asset) => [asset.id, asset])),
    [assetsQuery.data],
  );
  const assetNamesById = useMemo(
    () => new Map((assetsQuery.data ?? []).map((asset) => [asset.id, asset.displayName])),
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
        id: "severity",
        label: "Severity",
        formatValue: (value) => String(value),
      },
      {
        id: "status",
        label: "Status",
        formatValue: (value) => String(value),
      },
      {
        id: "assetId",
        label: "Asset",
        formatValue: (value) => assetNamesById.get(String(value)) ?? "Unknown asset",
      },
      {
        id: "responsibleOwner",
        label: "Asset Owner",
        formatValue: (value) => String(value),
      },
      {
        id: "assignee",
        label: "Assignee",
        formatValue: (value) =>
          String(value) === FINDING_ASSIGNEE_UNASSIGNED_FILTER_VALUE
            ? "Unassigned"
            : formatFindingAssignee(String(value), userProfileById),
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
      title: "Delete Findings",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${findings.length} findings(s)?`,
      confirmVariant: "destructive",
    });

    if (confirmed) {
      await findingLifecycle.deleteFindings(findings);
    }
  };

  const handleCreateFinding = async () => {
    await navigate({
      to: "/findings/new",
    });
  };

  function ToolbarElements() {
    return (
      <>
        <Button
          variant="default"
          size="sm"
          className="h-9 rounded-xl"
          onClick={handleCreateFinding}
        >
          <Plus />
          New finding
        </Button>
      </>
    );
  }

  return (
    <DataTable
      columns={columns}
      query={findingsQuery}
      groupingOptions={groupingOptions}
      initialGrouping={initialGrouping}
      filterState={filterState}
      onFilterStateChange={onFilterStateChange}
      initialSorting={[{ id: "updatedAt", desc: true }]}
      initialColumnVisibility={{ updatedAt: false }}
      onRowClick={onSelectFinding}
      onRowDoubleClick={handleOpenFinding}
      isRowActive={(finding) => finding.id === selectedFindingId}
      onRowDelete={handleDeleteFindings}
      toolbarControls={ToolbarElements}
      contextMenu={(findings, children, key) => (
        <FindingContextMenu
          key={key}
          findings={findings}
          onDelete={() => handleDeleteFindings(findings)}
        >
          {children}
        </FindingContextMenu>
      )}
    />
  );
}
