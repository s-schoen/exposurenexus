import { Trash2 } from "lucide-react";
import { useMemo } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { useAssetLifecycle } from "@/features/assets/hooks/use-asset-lifecycle.ts";
import { useLeaveDeletedRecords } from "@/hooks/use-leave-deleted-records.ts";
import { useStableCallback } from "@/hooks/use-stable-callback.ts";
import { formatCount } from "@/lib/format.ts";

import type { PageAction } from "@/hooks/use-page-meta.tsx";
import type { Asset } from "@exposurenexus/contracts/model/asset";

/** Confirms and deletes assets, then leaves the page or peek of any deleted asset. */
export function useDeleteAssets() {
  const assetLifecycle = useAssetLifecycle();
  const leaveDeletedRecords = useLeaveDeletedRecords("/assets");

  return useStableCallback(async (assets: Array<Asset>) => {
    const confirmed = await ConfirmDialog.call({
      title: "Delete assets",
      description: "This action cannot be undone.",
      message: `Are you sure you want to delete ${formatCount(assets.length, "asset")}?`,
      confirmVariant: "destructive",
    });

    if (!confirmed) {
      return;
    }

    const result = await assetLifecycle.deleteAssets(assets);
    await leaveDeletedRecords(result.successful.map((asset) => asset.id));
  });
}

/** The asset's ⋯ menu on its detail page and peek. Its name and properties are edited in place. */
export function useAssetRecordActions(asset: Asset) {
  const deleteAssets = useDeleteAssets();

  return useMemo<Array<PageAction>>(
    () => [
      {
        label: "Delete asset…",
        icon: Trash2,
        variant: "destructive",
        onClick: () => void deleteAssets([asset]),
      },
    ],
    [asset, deleteAssets],
  );
}
