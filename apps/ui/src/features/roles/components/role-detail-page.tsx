import { useMemo } from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft, Pencil } from "lucide-react"
import { createRoleByIDQueryOptions } from "@/api/role.ts"
import { RoleDetailContent } from "@/components/role-detail-content.tsx"
import { buttonVariants } from "@/components/ui/button.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { isBuiltInRoleId } from "@/lib/role.ts"
import { cn } from "@/lib/utils.ts"

interface RoleDetailPageProps {
  roleId: string
}

export function RoleDetailPage({ roleId }: RoleDetailPageProps) {
  const navigate = useNavigate()
  const role = useQuery(createRoleByIDQueryOptions(roleId))
  const actions = useMemo(() => {
    if (!role.data || isBuiltInRoleId(role.data.id)) {
      return []
    }

    return [
      {
        label: "Edit role",
        icon: Pencil,
        onClick: () => {
          void navigate({
            to: "/roles/$id/edit",
            params: { id: roleId }
          })
        }
      }
    ]
  }, [navigate, role.data, roleId])

  usePageMeta({
    title: role.data?.name ?? "Role",
    description:
      "Inspect the selected role and review how its permissions map to protected resources.",
    actions
  })

  return (
    <RoleDetailContent
      roleId={roleId}
      titleAction={
        <Link
          to="/roles"
          search={(previous) => ({
            filter: previous.filter,
            kind: previous.kind,
            selected: undefined
          })}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "-ml-2 rounded-xl"
          )}
        >
          <ArrowLeft />
          Back to roles
        </Link>
      }
    />
  )
}
