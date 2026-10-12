import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CreateFindingDialog } from "@/features/findings/components/create-finding-dialog.tsx";

/** Opens the create finding dialog and goes to the new finding's page once it is created. */
export function useCreateFinding() {
  const navigate = useNavigate();

  return useCallback(async () => {
    const created = await CreateFindingDialog.call({});

    if (created) {
      await navigate({ to: "/findings/$id", params: { id: created.id } });
    }
  }, [navigate]);
}
