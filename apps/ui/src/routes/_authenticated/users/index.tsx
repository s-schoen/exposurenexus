import { createFileRoute, useNavigate } from "@tanstack/react-router"
import type { UserProfile } from "@exposurenexus/types/model/user"
import { DetailPreviewDialog } from "@/components/detail-preview-dialog.tsx"
import { UserDetailContent } from "@/components/user-detail-content.tsx"
import { UserTable } from "@/components/user-table"
import { usePageMeta } from "@/context/page.tsx"
import {
  useSelectedSearchParam,
  validateSelectedSearch
} from "@/hooks/use-selected-search-param.ts"

export const Route = createFileRoute("/_authenticated/users/")({
  validateSearch: (search) => ({
    ...search,
    ...validateSelectedSearch(search)
  }),
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const { selected } = Route.useSearch()
  const selectedSearch = useSelectedSearchParam<UserProfile>({
    selectedId: selected,
    to: "/users",
    getId: (user) => user.id
  })

  usePageMeta({
    title: "Users",
    description: "Browse users with access to the platform."
  })

  return (
    <>
      <UserTable
        selectedUserId={selectedSearch.selectedId}
        onSelectUser={(user) => {
          void selectedSearch.selectRow(user)
        }}
        onCreateUser={() => {
          void navigate({ to: "/users/new" })
        }}
      />
      <DetailPreviewDialog
        selectedId={selectedSearch.selectedId}
        onClose={() => {
          void selectedSearch.clearSelected()
        }}
        title="User details"
        description="Review the selected user without leaving the user table."
        fullPageHref={selected ? `/users/${selected}` : undefined}
      >
        {selected && <UserDetailContent userId={selected} />}
      </DetailPreviewDialog>
    </>
  )
}
