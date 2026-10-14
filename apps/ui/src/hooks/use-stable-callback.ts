import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * A function that keeps one identity across renders but always runs the latest `callback`.
 * Memoized header menus use it to call lifecycle actions, which change on every render; a new
 * menu per render would re-render the page forever.
 */
export function useStableCallback<TArgs extends Array<unknown>, TResult>(
  callback: (...args: TArgs) => TResult,
) {
  const callbackRef = useRef(callback);

  useLayoutEffect(() => {
    callbackRef.current = callback;
  });

  return useCallback((...args: TArgs) => callbackRef.current(...args), []);
}
