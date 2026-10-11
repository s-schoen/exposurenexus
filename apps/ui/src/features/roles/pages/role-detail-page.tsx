import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, Pencil } from "lucide-react";
import { useMemo } from "react";

import { RoleDetailContent } from "@/features/roles/components/role-detail-content.tsx";
import { isBuiltInRoleId } from "@/features/roles/lib/role.ts";
import { createRoleByIDQueryOptions } from "@/features/roles/queries/roles.ts";
import { usePageMeta } from "@/hooks/use-page-meta.tsx";

interface RoleDetailPageProps {
  roleId: string;
}

export function RoleDetailPage({ roleId }: RoleDetailPageProps) {
  const navigate = useNavigate();
  const role = useSuspenseQuery(createRoleByIDQueryOptions(roleId));
  const actions = useMemo(() => {
    if (isBuiltInRoleId(role.data.id)) {
      return [];
    }

    return [
      {
        label: "Edit role",
        icon: Pencil,
        onClick: () => {
          void navigate({
            to: "/roles/$id/edit",
            params: { id: roleId },
          });
        },
      },
    ];
  }, [navigate, role.data, roleId]);

  usePageMeta({
    title: role.data.name,
    icon: KeyRound,
    breadcrumbs: [{ label: "Roles", to: "/roles" }],
    actions,
  });

  return <RoleDetailContent role={role.data} />;
}
