import { useQuery } from "@tanstack/react-query";

import { DetailQueryBoundary } from "@/components/detail-query-boundary.tsx";
import { createListRolesQueryOptions } from "@/features/roles";
import { UserDetailContent } from "@/features/users/components/user-detail-content.tsx";
import { createUserByIDQueryOptions } from "@/features/users/queries/users.ts";

export function UserPreview({ userId }: { userId: string }) {
  const user = useQuery(createUserByIDQueryOptions(userId));
  const roles = useQuery(createListRolesQueryOptions());

  return (
    <DetailQueryBoundary
      query={user}
      title="User details"
      errorTitle="Unable to load user"
      errorDescription="The selected user could not be loaded."
      missingMessage="The API did not return a user record."
    >
      {(userData) => (
        <DetailQueryBoundary
          query={roles}
          title="User details"
          errorTitle="Unable to load roles"
          errorDescription="Available roles could not be loaded."
          missingMessage="The API did not return the required role data."
        >
          {(roleData) => <UserDetailContent user={userData} roles={roleData} />}
        </DetailQueryBoundary>
      )}
    </DetailQueryBoundary>
  );
}
