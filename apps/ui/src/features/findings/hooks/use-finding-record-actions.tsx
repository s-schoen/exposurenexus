import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { FindingDetailsDialog } from "@/features/findings/components/finding-details-dialog.tsx";
import { useFindingLifecycle } from "@/features/findings/hooks/use-finding-lifecycle.ts";
import { useLeaveDeletedRecords } from "@/hooks/use-leave-deleted-records.ts";
import { useStableCallback } from "@/hooks/use-stable-callback.ts";

import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { Finding } from "@exposurenexus/contracts/model/finding";

/** Confirms and deletes findings, then leaves the page or peek of any deleted finding. */
export function useDeleteFindings() {
  const findingLifecycle = useFindingLifecycle();
  const leaveDeletedRecords = useLeaveDeletedRecords("/findings");

  return useStableCallback(async (findings: Array<Finding>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete findings",
      description: "This action cannot be undone",
      message: `Are you sure you want to delete ${findings.length} findings(s)?`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const result = await findingLifecycle.deleteFindings(findings);
    await leaveDeletedRecords(result.successful.map((finding) => finding.id));
  });
}

/** The finding's ⋯ menu on its detail page and peek, and the details dialog it opens. */
export function useFindingRecordActions(finding: Finding) {
  const deleteFindings = useDeleteFindings();
  const [editingDetails, setEditingDetails] = useState(false);

  const actions = useMemo<Array<PageAction>>(
    () => [
      { label: "Edit details…", icon: Pencil, onClick: () => setEditingDetails(true) },
      {
        label: "Delete finding…",
        icon: Trash2,
        variant: "destructive",
        onClick: () => void deleteFindings([finding]),
      },
    ],
    [deleteFindings, finding],
  );

  const dialog = (
    <FindingDetailsDialog
      finding={finding}
      open={editingDetails}
      onOpenChange={setEditingDetails}
    />
  );

  return { actions, dialog };
}
