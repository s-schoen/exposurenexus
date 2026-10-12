import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CreateAssetDialog } from "@/features/assets/components/create-asset-dialog.tsx";

/** Opens the create asset dialog and goes to the new asset's page once it is created. */
export function useCreateAsset() {
  const navigate = useNavigate();

  return useCallback(async () => {
    const created = await CreateAssetDialog.call({});

    if (created) {
      await navigate({ to: "/assets/$id", params: { id: created.id } });
    }
  }, [navigate]);
}
