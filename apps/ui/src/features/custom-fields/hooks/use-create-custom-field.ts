import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CreateCustomFieldDialog } from "@/features/custom-fields/components/create-custom-field-dialog.tsx";

/** Opens the create custom field dialog and goes to the new custom field's page once it is created. */
export function useCreateCustomField() {
  const navigate = useNavigate();

  return useCallback(async () => {
    const created = await CreateCustomFieldDialog.call({});

    if (created) {
      await navigate({ to: "/settings/custom-fields/$id", params: { id: created.id } });
    }
  }, [navigate]);
}
