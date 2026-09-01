import { useQueryClient } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { expect, it } from "vitest";

import { Provider, getContext } from "@/integrations/tanstack-query/root-provider.tsx";

it("provides the same query client returned by getContext", () => {
  const context = getContext();
  const { result } = renderHook(() => useQueryClient(), {
    wrapper: ({ children }) => <Provider {...context}>{children}</Provider>,
  });

  expect(result.current).toBe(context.queryClient);
});
