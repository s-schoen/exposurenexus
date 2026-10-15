"use client";

import { useNavigate } from "@tanstack/react-router";
import { useTheme } from "next-themes";

import { THEME_OPTIONS } from "@/components/theme-provider.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  const { theme = "system", setTheme } = useTheme();
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Theme</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                {THEME_OPTIONS.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSignOut}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
