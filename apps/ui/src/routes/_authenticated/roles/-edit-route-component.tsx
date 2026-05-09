import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { CircleAlert } from "lucide-react"
import { toast } from "sonner"
import {
  createListRolesQueryOptions,
  createRoleByIDQueryOptions,
  updateRole
} from "@/api/role.ts"
import {
  RoleForm,
  getAvailableRolePermissions,
  mapRoleToFormValues,
  mapUpdateRoleFormValues
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

interface EditRoleRouteComponentProps {
  roleId: string
}

export function EditRoleRouteComponent({
  roleId
}: EditRoleRouteComponentProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const role = useQuery(createRoleByIDQueryOptions(roleId))
  const roles = useQuery(createListRolesQueryOptions())

  usePageMeta({
    title: role.data?.name ? `Edit ${role.data.name}` : "Edit Role",
    description: "Update the role name and permission grants."
  })

  const handleCancel = async () => {
    await navigate({
      to: "/roles/$id",
      params: { id: roleId }
    })
  }

  const handleSubmit = async (
    values: Parameters<typeof mapUpdateRoleFormValues>[0]
  ) => {
    const payload = mapUpdateRoleFormValues(values)

    try {
      await updateRole(roleId, payload)
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: createListRolesQueryOptions().queryKey
        }),
        queryClient.invalidateQueries({
          queryKey: createRoleByIDQueryOptions(roleId).queryKey
        })
      ])
      toast.success(`Updated role ${payload.name}`)
      await navigate({
        to: "/roles/$id",
        params: { id: roleId }
      })
    } catch (error) {
      toastActionError(error, `Failed to update role: ${error}`)
      console.error(error)
    }
  }

  if (role.isPending || roles.isPending) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit role</CardTitle>
          <CardDescription>
            Loading role details and available permissions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (!role.data || !roles.data) {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>Edit role</CardTitle>
          <CardDescription>
            The selected role could not be loaded for editing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load edit form</AlertTitle>
            <AlertDescription>
              {role.error?.message ??
                roles.error?.message ??
                "The API did not return the required role data."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <RoleForm
      mode="edit"
      availablePermissions={getAvailableRolePermissions(roles.data)}
      defaultValues={mapRoleToFormValues(role.data)}
      onSubmit={handleSubmit}
      onCancel={handleCancel}
    />
  )
}
