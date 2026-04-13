import { CircleAlert, Mail, User as UserIcon } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { createUserByIDQueryOptions } from "@/api/user.ts"
import { DetailHighlightCard } from "@/components/detail-highlight-card.tsx"
import { MetadataSidebar } from "@/components/metadata-sidebar"
import { MetadataDetailRow } from "@/components/metadata-sidebar/metadata-detail-row.tsx"
import {
  Alert,
  AlertDescription,
  AlertTitle
} from "@/components/ui/alert.tsx"
import { Badge } from "@/components/ui/badge.tsx"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card.tsx"
import { Skeleton } from "@/components/ui/skeleton.tsx"

interface UserDetailContentProps {
  userId: string
  titleAction?: ReactNode
}

function UserStatusBadge({ emailVerified }: { emailVerified: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        emailVerified
          ? "rounded-full border-emerald-200 bg-emerald-50 text-emerald-700"
          : "rounded-full border-amber-200 bg-amber-50 text-amber-700"
      }
    >
      {emailVerified ? "Verified" : "Unverified"}
    </Badge>
  )
}

export function UserDetailContent({
  userId,
  titleAction
}: UserDetailContentProps) {
  const user = useQuery(createUserByIDQueryOptions(userId))

  function formatDateTime(value: Date | string | null | undefined) {
    if (!value) return "Not available"

    const date = value instanceof Date ? value : new Date(value)

    if (Number.isNaN(date.getTime())) {
      return "Invalid date"
    }

    return date.toLocaleString()
  }

  function CardPlaceholder() {
    return (
      <Card>
        <CardHeader>
          <CardTitle>User details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    )
  }

  function ErrorCard() {
    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader>
          <CardTitle>User details</CardTitle>
          <CardDescription>
            The selected user could not be loaded.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Unable to load user</AlertTitle>
            <AlertDescription>
              {user.error?.message ?? "The API did not return a user record."}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (user.isPending) {
    return <CardPlaceholder />
  }

  if (!user.data) {
    return <ErrorCard />
  }

  const userData = user.data
  const emailVerified = Boolean(userData.emailVerified)

  function UserOverviewCard() {
    const username = userData.displayUsername ?? userData.username

    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">{titleAction}</div>
            <UserStatusBadge emailVerified={emailVerified} />
          </div>
          <div className="space-y-3">
            <div className="space-y-2">
              <CardTitle className="text-2xl font-semibold tracking-tight">
                {userData.name}
              </CardTitle>
              <CardDescription className="max-w-3xl text-sm leading-6">
                Platform user account with access credentials, profile
                identifiers, and audit timestamps.
              </CardDescription>
            </div>
            <div className="grid gap-3 xl:grid-cols-3">
              <DetailHighlightCard
                label="Email"
                value={userData.email}
                description="Primary contact and sign-in address"
              />
              <DetailHighlightCard
                label="Username"
                value={username ?? "Not assigned"}
                description="Preferred user-facing account handle"
              />
              <DetailHighlightCard
                label="Status"
                value={<UserStatusBadge emailVerified={emailVerified} />}
                description="Whether the email address has been verified"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    )
  }

  function UserProfileCard() {
    const username = userData.displayUsername ?? userData.username

    return (
      <Card className="border-border/60 bg-shell-panel shadow-(--shell-shadow)">
        <CardHeader className="gap-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-xl font-semibold">Profile</CardTitle>
              <CardDescription>
                Identity fields exposed by the authentication provider for this
                account.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-md">
              <Mail className="size-3" />
              Account
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Name</div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {userData.name}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">Email</div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {userData.email}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              Username
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {username ?? "Not assigned"}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium text-foreground">
              Display username
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
              {userData.displayUsername ?? "Not assigned"}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  function UserSidebar() {
    const username = userData.displayUsername ?? userData.username

    return (
      <MetadataSidebar title="User details" icon={UserIcon}>
        <div className="space-y-3">
          <MetadataDetailRow label="Name" value={userData.name} />
          <MetadataDetailRow label="Email" value={userData.email} />
          <MetadataDetailRow label="Username" value={username ?? "Not assigned"} />
          <MetadataDetailRow
            label="Email status"
            value={emailVerified ? "Verified" : "Unverified"}
          />
        </div>
        <div className="space-y-3 border-t border-border/70 pt-5">
          <MetadataDetailRow label="Created" value={formatDateTime(userData.createdAt)} />
          <MetadataDetailRow label="Updated" value={formatDateTime(userData.updatedAt)} />
        </div>
      </MetadataSidebar>
    )
  }

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex min-w-0 flex-col gap-4">
        <UserOverviewCard />
        <UserProfileCard />
      </div>
      <UserSidebar />
    </div>
  )
}
