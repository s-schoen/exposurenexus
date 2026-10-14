import { useSuspenseQuery } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";

import { RoleDetailContent } from "@/features/roles/components/role-detail-content.tsx";
import { useRoleRecordActions } from "@/features/roles/hooks/use-role-record-actions.ts";
import { createRoleByIDQueryOptions } from "@/features/roles/queries/roles.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface RoleDetailPageProps {
  roleId: string;
}

export function RoleDetailPage({ roleId }: RoleDetailPageProps) {
  const role = useSuspenseQuery(createRoleByIDQueryOptions(roleId));
  const actions = useRoleRecordActions(role.data);

  usePageMeta({
    title: role.data.name,
    icon: KeyRound,
    breadcrumbs: [{ label: "Roles", to: "/settings/roles" }],
    menu: actions,
  });

  return <RoleDetailContent role={role.data} />;
}
