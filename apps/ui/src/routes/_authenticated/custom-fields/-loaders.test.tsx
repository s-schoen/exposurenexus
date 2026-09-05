import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  createAssetCustomFieldDefinitionByIDQueryOptions,
  createListAssetCustomFieldDefinitionsQueryOptions,
} from "@/features/custom-fields";
import { getAssetCustomFieldDefinitionByID } from "@/features/custom-fields/api/definitions.ts";
import { EditCustomFieldPage } from "@/features/custom-fields/pages/edit-custom-field-page.tsx";
import { Route as EditRoute } from "@/routes/_authenticated/custom-fields/$id.edit.tsx";
import { Route as DetailRoute } from "@/routes/_authenticated/custom-fields/$id.tsx";
import { Route as IndexRoute } from "@/routes/_authenticated/custom-fields/index.tsx";
import { Route as NewRoute } from "@/routes/_authenticated/custom-fields/new.tsx";
import { ASSET_CUSTOM_FIELD_FIXTURES } from "@/test/fixtures.ts";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  createFileRoute: () => (options: Record<string, unknown>) => ({ options }),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/hooks/use-page-meta.tsx", () => ({ usePageMeta: vi.fn() }));
vi.mock("@/features/custom-fields/hooks/use-asset-custom-field-definition-lifecycle.ts", () => ({
  useAssetCustomFieldDefinitionLifecycle: () => ({}),
}));
vi.mock("@/features/custom-fields/components/asset-custom-field-form.tsx", () => ({
  mapAssetCustomFieldDefinitionToFormValues: (field: { name: string }) => field,
  AssetCustomFieldForm: ({ defaultValues }: { defaultValues: { name: string } }) => (
    <div>{defaultValues.name}</div>
  ),
}));
vi.mock("@/features/custom-fields/api/definitions.ts", () => ({
  getAssetCustomFieldDefinitionByID: vi.fn(),
}));
afterEach(cleanup);
type Loader = (args: {
  context: { queryClient: QueryClient };
  params: { id: string };
}) => Promise<unknown>;
const field = ASSET_CUSTOM_FIELD_FIXTURES[0];
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
  vi.mocked(getAssetCustomFieldDefinitionByID).mockResolvedValue(field);
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
      <EditCustomFieldPage customFieldId={field.id} />
    </QueryClientProvider>,
  );
  expect(screen.getByText(field.name)).toBeVisible();
  expect(client.isFetching()).toBe(0);
  expect(getAssetCustomFieldDefinitionByID).toHaveBeenCalledExactlyOnceWith(field.id);
});
it("keeps creation loader-free", () => {
  expect(NewRoute.options.loader).toBeUndefined();
});
