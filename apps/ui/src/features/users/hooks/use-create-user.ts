import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CreateUserDialog } from "@/features/users/components/create-user-dialog.tsx";

/** Opens the create user dialog and goes to the new user's page once it is created. */
export function useCreateUser() {
  const navigate = useNavigate();

  return useCallback(async () => {
    const created = await CreateUserDialog.call({});

    if (created) {
      await navigate({ to: "/settings/users/$id", params: { id: created.id } });
    }
  }, [navigate]);
}
