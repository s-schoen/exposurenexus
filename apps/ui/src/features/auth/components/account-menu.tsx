"use client";

import { useNavigate } from "@tanstack/react-router";

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

import type { UserProfile } from "@exposurenexus/contracts/model/user";
import type { ReactNode } from "react";

interface AccountMenuProps {
  /** Draws the signed-in user's avatar. The users feature owns it, so the shell passes it in. */
  renderAvatar: (user: UserProfile | null) => ReactNode;
}

export function AccountMenu({ renderAvatar }: AccountMenuProps) {
  const { logout, status, user } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await logout();
    void navigate({ to: "/login", search: { redirect: "/" } });
  };

  if (status === "loading") {
    return <Spinner />;
  }

  const displayName = user?.displayName || user?.username || user?.email || "Account";

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
        {renderAvatar(user)}
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
