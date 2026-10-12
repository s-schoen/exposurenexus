import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CreateRoleDialog } from "@/features/roles/components/create-role-dialog.tsx";

/** Opens the create role dialog and goes to the new role's page once it is created. */
export function useCreateRole() {
  const navigate = useNavigate();

  return useCallback(async () => {
    const created = await CreateRoleDialog.call({});

    if (created) {
      await navigate({ to: "/settings/roles/$id", params: { id: created.id } });
    }
  }, [navigate]);
}
