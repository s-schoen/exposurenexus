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
            <div className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 transition-colors duration-100 hover:bg-accent">
              <Avatar size="sm">
                <AvatarFallback className="select-none">{initial}</AvatarFallback>
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
