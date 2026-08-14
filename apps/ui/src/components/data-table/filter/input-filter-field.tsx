import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";

import type { Column } from "@tanstack/react-table";

export interface InputFilterFieldProps<TData> {
  column: Column<TData>;
  type: "number" | "text";
}

export function InputFilterField<TData>({ column, type }: InputFilterFieldProps<TData>) {
  const label = column.columnDef.meta?.label || column.id;
  const value = (column.getFilterValue() as string | undefined) ?? "";

  return (
    <InputGroup className="w-52 max-w-full rounded-xl border-dashed bg-background">
      <InputGroupAddon className="max-w-24 shrink-0">
        <span className="truncate">{label}</span>
      </InputGroupAddon>
      <InputGroupInput
        type={type}
        value={value}
        aria-label={`${label} filter`}
        placeholder="Filter..."
        onChange={(event) => {
          const nextValue = event.target.value;
          column.setFilterValue(nextValue.trim() ? nextValue : undefined);
        }}
      />
    </InputGroup>
  );
}
