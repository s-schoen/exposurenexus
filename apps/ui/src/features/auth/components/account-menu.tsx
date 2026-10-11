"use client";

import { useNavigate } from "@tanstack/react-router";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/features/auth/providers/auth-provider.tsx";

export function AccountMenu() {
  const { logout, status, user } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await logout();
    void navigate({ to: "/login", search: { redirect: "/" } });
  };

  if (status === "loading") {
    return <Spinner />;
  }

  const displayName = user?.displayName ?? user?.email ?? "Account";
  const initial = displayName.at(0)?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={displayName}
            className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        }
      >
        <Avatar className="size-7">
          <AvatarFallback>{initial}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{displayName}</DropdownMenuLabel>
          <DropdownMenuItem onClick={onSignOut}>Sign out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
