import {  useEffect } from "react"
import { useQueryState } from "nuqs"
import { XIcon } from "lucide-react"
import { useRouter } from "@tanstack/react-router"
import type {ChangeEvent} from "react";
import type { Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"

interface DataTableFilterProps<TData> {
  table: Table<TData>
}

export function DataTableFilter<TData>({ table }: DataTableFilterProps<TData>) {
  const router = useRouter()
  const [filter, setFilter] = useQueryState("filter")

  useEffect(() => {
    table.setGlobalFilter(filter || undefined)
  }, [filter, table])

  const onFilter = (e: ChangeEvent<HTMLInputElement>) => {
    setFilter(e.target.value || null)
  }

  const handleClearAll = () => {
    // @ts-ignore this we dont know the page and want to reset whatever query
    router.navigate({ search: {} })
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        type="text"
        placeholder="Filter..."
        onChange={onFilter}
        value={filter ?? ""}
      />
      <Button variant="outline" size="sm" onClick={handleClearAll}>
        <XIcon />
      </Button>
    </div>
  )
}
