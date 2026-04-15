import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import { toast } from "sonner"
import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions,
  updateUser
} from "@/api/user.ts"
import { UserForm, mapUpdateUserFormValues } from "@/components/user-form.tsx"
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

export const Route = createFileRoute("/_authenticated/users/$id/edit")({
  component: RouteComponent
})

function RouteComponent() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useQuery(createUserByIDQueryOptions(id))

  usePageMeta({
    title: user.data?.displayUsername ?? user.data?.name ?? "Edit User",
    description: "Update user profile fields and optionally reset the password."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/users/$id",
      params: { id }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapUpdateUserFormValues>[0]
  ) => {
    if (!user.data) {
      return
    }

    try {
      await updateUser(
        id,
        mapUpdateUserFormValues(values, user.data.image ?? null)
      )
      await queryClient.invalidateQueries({
        queryKey: createListUsersQueryOptions().queryKey
      })
      toast.success(`Updated user ${values.displayUsername.trim()}`)
      await navigate({
        to: "/users/$id",
        params: { id }
      })
    } catch (error) {
      toast.error(`Failed to update user: ${error}`)
      console.error(error)
    }
  }

  if (user.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit user</CardTitle>
          <CardDescription>Loading user details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!user.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit user</CardTitle>
          <CardDescription>
            The selected user could not be loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load user</AlertTitle>
            <AlertDescription>{user.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <UserForm
      mode="edit"
      defaultValues={{
        displayUsername: user.data.displayUsername ?? user.data.name,
        username: user.data.username ?? "",
        email: user.data.email,
        password: ""
      }}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
