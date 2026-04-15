import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { createListUsersQueryOptions, createUser } from "@/api/user.ts"
import { UserForm, mapCreateUserFormValues } from "@/components/user-form.tsx"
import { usePageMeta } from "@/context/page.tsx"

export const Route = createFileRoute("/_authenticated/users/new")({
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  usePageMeta({
    title: "Create User",
    description: "Add a new platform user and set their initial credentials."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/users",
      search: { selected: undefined }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapCreateUserFormValues>[0]
  ) => {
    const payload = mapCreateUserFormValues(values)

    try {
      await createUser(payload)
      await queryClient.invalidateQueries({
        queryKey: createListUsersQueryOptions().queryKey
      })
      toast.success(`Created user ${payload.displayUsername}`)
      await navigate({
        to: "/users",
        search: { selected: undefined }
      })
    } catch (error) {
      toast.error(`Failed to create user: ${error}`)
      console.error(error)
    }
  }

  return (
    <UserForm mode="create" onSubmit={handleSubmit} onCancel={handleCancel} />
  )
}
