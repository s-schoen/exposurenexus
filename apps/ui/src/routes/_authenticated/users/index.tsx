import { useMemo } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { UserDetailContent } from "@/components/user-detail-content.tsx"
import { UserTable } from "@/components/user-table"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/users/")({
  validateSearch: (search) => ({
    ...search,
    selected: typeof search.selected === "string" ? search.selected : undefined
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const { selected } = Route.useSearch()
  const actions = useMemo(
    () => [
      {
        label: "New user",
        icon: Plus,
        onClick: () => {
          void navigate({ to: "/users/new" })
        }
      }
    ],
    [navigate]
  )

  usePageMeta({
    title: "Users",
    description: "Browse users with access to the platform.",
    actions
  })

  return (
    <>
      <UserTable
        selectedUserId={selected}
        onSelectUser={(user) =>
          navigate({
            to: "/users",
            search: (prev) => ({
              ...prev,
              selected: user.id
            })
          })
        }
      />
      <DetailPreviewDialog
        selectedId={selected}
        onClose={() =>
          navigate({
            to: "/users",
            search: (prev) => ({
              ...prev,
              selected: undefined
            })
          })
        }
        title="User details"
        description="Review the selected user without leaving the user table."
        fullPageHref={selected ? `/users/${selected}` : undefined}
      >
        {selected && <UserDetailContent userId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
