import type { Table } from "@tanstack/react-table"
import { Input } from "@/components/ui/input.tsx"
import { type ChangeEvent, useEffect } from "react"
import { useQueryState } from "nuqs"

export function DataTableFilter<TData>({ table }: { table: Table<TData> }) {
  const [filter, setFilter] = useQueryState("filter")

  useEffect(() => {
    table.setGlobalFilter(filter || undefined)
  }, [filter, table])

  const onFilter = (e: ChangeEvent<HTMLInputElement>) => {
    table.setGlobalFilter(e.target.value || undefined)
    setFilter(e.target.value || null)
  }

  return (
    <div>
      <Input
        type="text"
        placeholder="Filter..."
        onChange={onFilter}
        value={filter ?? ""}
      />
    </div>
  )
}
