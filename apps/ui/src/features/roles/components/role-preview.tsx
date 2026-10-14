import { useQuery } from "@tanstack/react-query";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { RecordMenu } from "@/components/record-menu.tsx";
import { RoleDetailContent } from "@/features/roles/components/role-detail-content.tsx";
import { useRoleRecordActions } from "@/features/roles/hooks/use-role-record-actions.ts";
import { createRoleByIDQueryOptions } from "@/features/roles/queries/roles.ts";

import type { Role } from "@exposurenexus/contracts/model/rbac";

function RoleRecordMenu({ role }: { role: Role }) {
  return <RecordMenu actions={useRoleRecordActions(role)} />;
}

/** The peek header's ⋯ menu. It waits for the preview's fetch instead of fetching again. */
export function RolePeekMenu({ roleId }: { roleId: string }) {
  const role = useQuery({ ...createRoleByIDQueryOptions(roleId), enabled: false });

  return role.data ? <RoleRecordMenu role={role.data} /> : null;
}

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
