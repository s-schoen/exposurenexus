import type { Table } from "@tanstack/react-table"
import { Input } from "@/components/ui/input.tsx"
import type { ChangeEvent } from "react"

export function DataTableFilter<TData>({ table }: { table: Table<TData> }) {
  const onFilter = (e: ChangeEvent<HTMLInputElement>) => {
    table.setGlobalFilter(e.target.value || undefined)
  }

  return (
    <div>
      <Input type="text" placeholder="Filter..." onChange={onFilter} />
    </div>
  )
}
