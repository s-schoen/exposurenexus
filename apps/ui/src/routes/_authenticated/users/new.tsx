import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import { builtInRoleIds } from "@openvlp/types/model/rbac"
import { toast } from "sonner"
import { createListUsersQueryOptions, createUser } from "@/api/user.ts"
import { createListRolesQueryOptions } from "@/api/role.ts"
import { UserForm, mapCreateUserFormValues } from "@/components/user-form.tsx"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"
import { usePageMeta } from "@/context/page.tsx"
import { toastActionError } from "@/lib/action-error-toast.ts"

export const Route = createFileRoute("/_authenticated/users/new")({
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const roles = useQuery(createListRolesQueryOptions())

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
      toast.success(`Created user ${payload.displayName}`)
      await navigate({
        to: "/users",
        search: { selected: undefined }
      })
    } catch (error) {
      toastActionError(error, `Failed to create user: ${error}`)
      console.error(error)
    }
  }

  if (roles.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Create user</CardTitle>
          <CardDescription>Loading available roles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!roles.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Create user</CardTitle>
          <CardDescription>
            Available roles could not be loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load roles</AlertTitle>
            <AlertDescription>{roles.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <UserForm
      mode="create"
      roles={roles.data}
      defaultValues={{ roleIds: [builtInRoleIds.viewer] }}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
