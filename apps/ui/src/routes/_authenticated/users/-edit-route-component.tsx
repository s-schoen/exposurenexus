import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleAlert } from "lucide-react"
import { toast } from "sonner"
import {
  createListUsersQueryOptions,
  createUserByIDQueryOptions,
  useUpdateUserMutation
} from "@/api/user.ts"
import { createListRolesQueryOptions } from "@/api/role.ts"
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
import { toastActionError } from "@/lib/action-error-toast.ts"

interface EditUserRouteComponentProps {
  userId: string
}

export function EditUserRouteComponent({
  userId
}: EditUserRouteComponentProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const userUpdate = useUpdateUserMutation()
  const user = useQuery(createUserByIDQueryOptions(userId))
  const roles = useQuery(createListRolesQueryOptions())

  usePageMeta({
    title: user.data?.displayName ?? "Edit User",
    description: "Update user profile fields and optionally reset the password."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/users/$id",
      params: { id: userId }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapUpdateUserFormValues>[0]
  ) => {
    if (!user.data) {
      return
    }

    try {
      await userUpdate.mutateAsync({
        id: userId,
        user: mapUpdateUserFormValues(values)
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createListUsersQueryOptions().queryKey
        }),
        queryClient.invalidateQueries({
          queryKey: createUserByIDQueryOptions(userId).queryKey
        })
      ])
      toast.success(`Updated user ${values.displayName.trim()}`)
      await navigate({
        to: "/users/$id",
        params: { id: userId }
      })
    } catch (error) {
      toastActionError(error, `Failed to update user: ${error}`)
      console.error(error)
    }
  }

  if (user.isPending || roles.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit user</CardTitle>
          <CardDescription>Loading user details and roles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!user.data || !roles.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit user</CardTitle>
          <CardDescription>
            The selected user could not be loaded for editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load edit form</AlertTitle>
            <AlertDescription>
              {user.error?.message ??
                roles.error?.message ??
                "The API did not return the required user data."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <UserForm
      mode="edit"
      roles={roles.data}
      defaultValues={{
        displayName: user.data.displayName,
        username: user.data.username,
        email: user.data.email,
        enabled: user.data.enabled,
        password: "",
        roleIds: user.data.roleIds
      }}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
