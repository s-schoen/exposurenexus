import { useEffect } from "react"
import { useQueryState } from "nuqs"
import { Search, XIcon } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import type { ChangeEvent } from "react"
import type { Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"

interface DataTableFilterProps<TData> {
  table: Table<TData>
  hasActiveFilters?: boolean
}

export function DataTableFilter<TData>({
  table,
  hasActiveFilters = false
}: DataTableFilterProps<TData>) {
  const router = useRouter()
  const [filter, setFilter] = useQueryState("filter")

  useEffect(() => {
    table.setGlobalFilter(filter || undefined)
  }, [filter, table])

  const onFilter = (e: ChangeEvent<HTMLInputElement>) => {
    setFilter(e.target.value || null)
  }

  const handleClearAll = () => {
    table.resetColumnFilters()
    table.setGlobalFilter(undefined)
    // @ts-ignore this we dont know the page and want to reset whatever query
    router.navigate({ search: {} })
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search across visible columns"
          onChange={onFilter}
          value={filter ?? ""}
          className="h-9 rounded-xl bg-background pl-9"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClearAll}
        className="h-9 rounded-xl"
        disabled={!hasActiveFilters}
      >
        <XIcon />
        Clear all
      </Button>
    </div>
  )
}
