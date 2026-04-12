"use client"

import { useNavigate } from "@tanstack/react-router"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { authClient } from "@/lib/auth"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"

export function AccountMenu() {
  const { data: session, isPending } = authClient.useSession()
  const navigate = useNavigate()

  const onSignOut = async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/login", search: { redirect: "/" } })
        }
      }
    })
  }

  const displayName = session?.user.name ?? session?.user.email ?? "Account"
  const initial = displayName.at(0)?.toUpperCase() ?? "?"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        nativeButton={false}
        render={
          isPending ? (
            <Spinner />
          ) : (
            <div className="flex cursor-pointer items-center gap-3 rounded-2xl border border-border/70 bg-background/75 px-4 py-2 shadow-sm transition-colors hover:bg-muted/70">
              <Avatar className="size-9">
                <AvatarFallback className="bg-primary/12 text-sm font-semibold text-primary select-none">
                  {initial}
                </AvatarFallback>
              </Avatar>
              <div className="hidden min-w-0 text-left sm:block">
                <p className="truncate text-sm font-medium text-foreground select-none">
                  {displayName}
                </p>
                <p className="truncate text-xs text-muted-foreground select-none">
                  Account
                </p>
              </div>
            </div>
          )
        }
      ></DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>Profile</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onSignOut}>Sign Out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
