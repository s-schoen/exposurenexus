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
import { useAuth } from "@/context/auth";

export function AccountMenu() {
  const { logout, status, user } = useAuth();
  const navigate = useNavigate();

  const onSignOut = async () => {
    await logout();
    navigate({ to: "/login", search: { redirect: "/" } });
  };

  const displayName = user?.displayName ?? user?.email ?? "Account";
  const initial = displayName.at(0)?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        nativeButton={false}
        render={
          status === "loading" ? (
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
                <p className="truncate text-xs text-muted-foreground select-none">Account</p>
              </div>
            </div>
          )
        }
      ></DropdownMenuTrigger>

      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Profile</DropdownMenuLabel>
          <DropdownMenuItem onClick={onSignOut}>Sign Out</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
