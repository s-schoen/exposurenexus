import { createFileRoute, useNavigate } from "@tanstack/react-router"
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

  usePageMeta({
    title: "Users",
    description: "Browse users with access to the platform."
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
