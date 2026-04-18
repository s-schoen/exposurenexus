import { Search, XIcon } from "lucide-react"
import type { ChangeEvent } from "react"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"

interface DataTableFilterProps {
  value: string
  hasActiveFilters?: boolean
  onFilterChange: (value: string) => void
  onClearAll: () => void
}

export function DataTableFilter({
  value,
  hasActiveFilters = false,
  onFilterChange,
  onClearAll
}: DataTableFilterProps) {
  const onFilter = (e: ChangeEvent<HTMLInputElement>) => {
    onFilterChange(e.target.value)
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search across visible columns"
          onChange={onFilter}
          value={value}
          className="h-9 rounded-xl bg-background pl-9"
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onClearAll}
        className="h-9 rounded-xl"
        disabled={!hasActiveFilters}
      >
        <XIcon />
        Clear all
      </Button>
    </div>
  )
}
