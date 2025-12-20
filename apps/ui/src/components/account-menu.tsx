"use client"

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
import { useNavigate } from "@tanstack/react-router"

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

  const displayName = session?.user?.name ?? session?.user?.email ?? "Account"
  const initial = displayName?.at(0)?.toUpperCase() ?? "?"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {isPending ? (
          <Spinner />
        ) : (
          <div className="flex items-center space-x-2 cursor-pointer select-none">
            <Avatar>
              <AvatarFallback className="select-none">
                {isPending ? "…" : initial}
              </AvatarFallback>
            </Avatar>
            <span className="text-lg select-none">{displayName}</span>
          </div>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel>Profile</DropdownMenuLabel>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={onSignOut}>Sign Out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
