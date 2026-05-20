import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { toast } from "sonner"
import {
  createListRolesQueryOptions,
  useCreateRoleMutation
} from "@/api/role.ts"
import {
  RoleForm,
  getAvailableRolePermissions,
  mapCreateRoleFormValues
} from "@/components/role-form.tsx"
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

export function CreateRoleRouteComponent() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const roleCreate = useCreateRoleMutation()
  const roles = useQuery(createListRolesQueryOptions())

  usePageMeta({
    title: "Create Role",
    description: "Add a custom role and choose its permission grants."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/roles",
      search: { selected: undefined }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapCreateRoleFormValues>[0]
  ) => {
    const payload = mapCreateRoleFormValues(values)

    try {
      const role = await roleCreate.mutateAsync(payload)
      await queryClient.invalidateQueries({
        queryKey: createListRolesQueryOptions().queryKey
      })
      toast.success(`Created role ${payload.name}`)
      await navigate({
        to: "/roles/$id",
        params: { id: role.id }
      })
    } catch (error) {
      toastActionError(error, `Failed to create role: ${error}`)
      console.error(error)
    }
  }

  if (roles.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Create role</CardTitle>
          <CardDescription>Loading available permissions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!roles.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Create role</CardTitle>
          <CardDescription>
            Available permissions could not be loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load permissions</AlertTitle>
            <AlertDescription>{roles.error.message}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <RoleForm
      mode="create"
      availablePermissions={getAvailableRolePermissions(roles.data)}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
