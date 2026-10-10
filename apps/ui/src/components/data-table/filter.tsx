import { Search, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group.tsx";

import type { ChangeEvent } from "react";

interface DataTableFilterProps {
  value: string;
  hasActiveFilters?: boolean;
  onFilterChange: (value: string) => void;
  onClearAll: () => void;
}

export function DataTableFilter({
  value,
  hasActiveFilters = false,
  onFilterChange,
  onClearAll,
}: DataTableFilterProps) {
  // `value` usually comes from the URL, which catches up only once the navigation started by a
  // keystroke completes. While the input has focus, show the typed text instead, so keystrokes
  // made in the meantime are not lost.
  const [draft, setDraft] = useState<string | null>(null);

  const onFilter = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    onFilterChange(e.target.value);
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
      <InputGroup className="w-full max-w-xl">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          type="text"
          aria-label="Search across visible columns"
          placeholder="Search across visible columns"
          onChange={onFilter}
          onBlur={() => setDraft(null)}
          value={draft ?? value}
        />
      </InputGroup>
      <Button variant="outline" onClick={onClearAll} disabled={!hasActiveFilters}>
        <XIcon />
        Clear all
      </Button>
    </div>
  );
}
