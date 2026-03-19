import { Settings2 } from "lucide-react"
import type {Table} from "@tanstack/react-table";

import { Button } from "@/components/ui/button.tsx"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu.tsx"

export function DataTableColumnVisibilityOptions<TData>({
  table
}: {
  table: Table<TData>
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            nativeButton={true}
            variant="outline"
            size="sm"
            className="ml-auto hidden h-8 lg:flex"
          >
            <Settings2 />
          </Button>
        }
      ></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[150px]">
        <DropdownMenuSeparator />
        {table
          .getAllColumns()
          .filter(
            (column) =>
              typeof column.accessorFn !== "undefined" && column.getCanHide()
          )
          .map((column) => {
            return (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="capitalize"
                checked={column.getIsVisible()}
                onCheckedChange={(value) => column.toggleVisibility(!!value)}
              >
                {column.id}
              </DropdownMenuCheckboxItem>
            )
          })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
