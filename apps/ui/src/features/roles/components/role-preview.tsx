import { useQuery } from "@tanstack/react-query";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { RoleDetailContent } from "@/features/roles/components/role-detail-content.tsx";
import { createRoleByIDQueryOptions } from "@/features/roles/queries/roles.ts";

export function RolePreview({ roleId }: { roleId: string }) {
  const role = useQuery(createRoleByIDQueryOptions(roleId));

  return (
    <DetailQueryBoundary
      query={role}
      title="Role details"
      errorTitle="Unable to load role"
      errorDescription="The selected role could not be loaded."
      missingMessage="The API did not return a role record."
    >
      {(data) => <RoleDetailContent role={data} />}
    </DetailQueryBoundary>
  );
}
