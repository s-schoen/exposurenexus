import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import {
  EditCustomFieldPage,
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
} from "@/features/custom-fields";
import { PageProvider } from "@/hooks/use-page-meta.tsx";
import { SEED_CUSTOM_FIELDS } from "@/mocks/fixtures/seed.ts";
import { Route as EditRoute } from "@/routes/_authenticated/custom-fields/$id.edit.tsx";
import { Route as DetailRoute } from "@/routes/_authenticated/custom-fields/$id.tsx";
import { Route as IndexRoute } from "@/routes/_authenticated/custom-fields/index.tsx";
import { Route as NewRoute } from "@/routes/_authenticated/custom-fields/new.tsx";
import { recordApiRequests } from "@/test/msw.ts";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => vi.fn(),
}));
type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
}) => Promise<unknown>;
const field = SEED_CUSTOM_FIELDS[0];
it("ensures exactly the list query without loading the selected preview", async () => {
  const client = new QueryClient();
  const ensure = vi.spyOn(client, "ensureQueryData").mockResolvedValue([]);
  await (IndexRoute.options.loader as unknown as Loader)({
    context: { queryClient: client },
    params: { id: field.id },
  });
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(ensure.mock.calls[0][0]).toEqual({
    ...createListAssetCustomFieldDefinitionsQueryOptions(),
    queryFn: expect.any(Function),
  });
});
it("ensures exactly the requested definition and lets nested edit reuse the parent cache", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const requests = recordApiRequests();
  const ensure = vi.spyOn(client, "ensureQueryData");
  await expect(
    (DetailRoute.options.loader as unknown as Loader)({
      context: { queryClient: client },
      params: { id: field.id },
    }),
  ).resolves.toEqual(field);
  expect(ensure).toHaveBeenCalledTimes(1);
  expect(ensure.mock.calls[0][0]).toEqual({
    ...createAssetCustomFieldDefinitionByIDQueryOptions(field.id),
    queryFn: expect.any(Function),
  });
  expect(EditRoute.options.loader).toBeUndefined();
  render(
    <QueryClientProvider client={client}>
      <PageProvider>
        <EditCustomFieldPage customFieldId={field.id} />
      </PageProvider>
    </QueryClientProvider>,
  );
  expect(screen.getByDisplayValue(field.name)).toBeVisible();
  expect(client.isFetching()).toBe(0);
  expect(requests).toEqual([`GET /api/assets/custom-fields/${field.id}`]);
});
it("keeps creation loader-free", () => {
  expect(NewRoute.options.loader).toBeUndefined();
});
