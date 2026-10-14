import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { createSelectedSearch } from "@/hooks/use-selected-search-param.ts";

/**
 * Leaves views of records that were just deleted: a deleted record's detail page goes back to
 * its list, and a list closes the peek showing a deleted record. Other views stay put.
 *
 * `listPath` is the list route, such as `/findings`; detail pages live at `${listPath}/${id}`.
 */
export function useLeaveDeletedRecords(listPath: string) {
  const router = useRouter();

  return useCallback(
    async (deletedIds: Array<string>) => {
      const { pathname, search } = router.state.location;
      const selected = (search as Record<string, unknown>).selected;

      // TanStack cannot prove an arbitrary string target has a compatible search schema; list
      // routes validate `selected` and keep their other parameters.
      if (deletedIds.some((id) => pathname === `${listPath}/${id}`)) {
        await router.navigate({ to: listPath, search: createSelectedSearch(undefined) } as never);
      } else if (typeof selected === "string" && deletedIds.includes(selected)) {
        await router.navigate({
          to: pathname,
          replace: true,
          search: createSelectedSearch(undefined),
        } as never);
      }
    },
    [listPath, router],
  );
}
