import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function validateSelectedSearch(search: Record<string, unknown>) {
  return {
    selected: typeof search.selected === "string" ? search.selected : undefined,
  };
}

export function createSelectedSearch(selected: string | undefined) {
  return (prev: Record<string, unknown>) => ({
    ...prev,
    selected,
  });
}

export function useSelectedSearchParam<TItem>({
  getId,
  replace,
  selectedId,
  to,
}: {
  getId: (item: TItem) => string;
  replace?: boolean;
  selectedId?: string;
  to: string;
}) {
  const navigate = useNavigate();
  const navigateSelected = useCallback(
    (selected: string | undefined) => {
      // TanStack cannot prove an arbitrary string target has a compatible
      // `selected` search schema; callers use this only on list routes that
      // validate this shared parameter.
      return navigate({
        to,
        ...(typeof replace === "boolean" ? { replace } : {}),
        search: createSelectedSearch(selected),
      } as never);
    },
    [navigate, replace, to],
  );

  return {
    selectedId,
    selectRow: (item: TItem) => navigateSelected(getId(item)),
    clearSelected: () => navigateSelected(undefined),
    isRowSelected: (item: TItem) => getId(item) === selectedId,
  };
}
