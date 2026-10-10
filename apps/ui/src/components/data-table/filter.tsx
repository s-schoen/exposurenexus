import { Search, XIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";

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
      <div className="relative w-full max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          aria-label="Search across visible columns"
          placeholder="Search across visible columns"
          onChange={onFilter}
          onBlur={() => setDraft(null)}
          value={draft ?? value}
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
  );
}
