import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PageProvider } from "@/hooks/use-page-meta.tsx";
import { routeTree } from "@/routeTree.gen";

import type * as AssetFeature from "@/features/assets";
import type { AuthState, LoginRedirects } from "@/features/auth";
import type * as CustomFieldFeature from "@/features/custom-fields";
import type * as FindingFeature from "@/features/findings";
import type * as RoleFeature from "@/features/roles";
import type * as UserFeature from "@/features/users";
import type * as VulnerabilityFeature from "@/features/vulnerabilities";
import type { PageState } from "@/hooks/use-page-meta.tsx";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  pages: {
    assetsList: vi.fn(),
    assetDetail: vi.fn(),
    customFieldsList: vi.fn(),
    customFieldDetail: vi.fn(),
    customFieldEdit: vi.fn(),
    customFieldCreate: vi.fn(),
    dashboard: vi.fn(),
    findingsList: vi.fn(),
    findingDetail: vi.fn(),
    findingImport: vi.fn(),
    findingTriage: vi.fn(),
    findingCreate: vi.fn(),
    rolesList: vi.fn(),
    roleDetail: vi.fn(),
    roleEdit: vi.fn(),
    roleCreate: vi.fn(),
    usersList: vi.fn(),
    userDetail: vi.fn(),
    userEdit: vi.fn(),
    userCreate: vi.fn(),
    vulnerabilitiesList: vi.fn(),
    vulnerabilityDetail: vi.fn(),
    vulnerabilityEdit: vi.fn(),
    vulnerabilityCreate: vi.fn(),
    login: vi.fn(),
  },
}));

type ListPageProps = {
  search: Record<string, unknown>;
  selected?: string;
};

type IdPageProps = {
  assetId?: string;
  customFieldId?: string;
  findingId?: string;
  roleId?: string;
  userId?: string;
  vulnerabilityId?: string;
};

type CreateFindingPageProps = {
  onClose: () => void;
};

function queryOptions(queryKey: ReadonlyArray<unknown>, data: unknown) {
  return {
    queryKey,
    queryFn: async () => data,
  };
}

function renderListPage(testId: string, spy: typeof mocks.pages.assetsList) {
  return (props: ListPageProps) => {
    spy(props);

    return (
      <div data-selected={props.selected ?? ""} data-testid={testId}>
        {JSON.stringify(props.search)}
      </div>
    );
  };
}

function renderIdPage(
  testId: string,
  spy: typeof mocks.pages.assetDetail,
  propName: keyof IdPageProps,
) {
  return (props: IdPageProps) => {
    spy(props);

    return <div data-testid={testId}>{String(props[propName])}</div>;
  };
}

function renderSimplePage(testId: string, spy: typeof mocks.pages.dashboard) {
  return () => {
    spy();
    return <div data-testid={testId} />;
  };
}

vi.mock("@/components/app-header.tsx", () => ({
  default: () => <header data-testid="app-header" />,
}));

vi.mock("@/components/app-sidebar.tsx", () => ({
  AppSidebar: () => <aside data-testid="app-sidebar" />,
}));

vi.mock("@/components/confirm-dialog.tsx", () => ({
  ConfirmDialog: {
    Root: () => null,
  },
}));

vi.mock("@/components/ui/button.tsx", () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/sidebar.tsx", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SidebarProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/sonner.tsx", () => ({
  Toaster: () => null,
}));

vi.mock("@/integrations/tanstack-query/devtools", () => ({
  default: null,
}));

vi.mock("@tanstack/react-devtools", () => ({
  TanStackDevtools: () => null,
}));

vi.mock("@tanstack/react-router-devtools", () => ({
  TanStackRouterDevtoolsPanel: () => null,
}));

vi.mock("@/features/auth", () => ({
  AccountMenu: () => <div data-testid="account-menu" />,
  LoginPage: (props: { redirect: string }) => {
    mocks.pages.login(props);
    return <div data-testid="login-page">{props.redirect}</div>;
  },
}));

vi.mock("@/features/dashboard", () => ({
  DashboardPage: renderSimplePage("dashboard-page", mocks.pages.dashboard),
}));

vi.mock("@/features/assets", async () => {
  const actual = await vi.importActual<typeof AssetFeature>(
    "@/features/assets/hooks/use-asset-table-search-state.ts",
  );

  return {
    AssetDialog: { Root: () => null },
    AssetDetailPage: renderIdPage("asset-detail-page", mocks.pages.assetDetail, "assetId"),
    AssetsPage: renderListPage("assets-list-page", mocks.pages.assetsList),
    createAssetByIDQueryOptions: vi.fn((id: string) =>
      queryOptions(["assets", id], { id, displayName: "Test asset" }),
    ),
    createAssetListOptionsFromSearch: actual.createAssetListOptionsFromSearch,
    createListAssetsQueryOptions: vi.fn(() => queryOptions(["assets"], [])),
    createListAssetsWithCustomFieldsQueryOptions: vi.fn(() =>
      queryOptions(["assets", "with-custom-fields"], []),
    ),
    validateAssetTableSearch: actual.validateAssetTableSearch,
  };
});

vi.mock("@/features/custom-fields", async () => {
  const actual = await vi.importActual<typeof CustomFieldFeature>(
    "@/features/custom-fields/hooks/use-custom-field-table-search-state.ts",
  );

  return {
    CreateCustomFieldPage: renderSimplePage(
      "custom-field-create-page",
      mocks.pages.customFieldCreate,
    ),
    CustomFieldDetailPage: renderIdPage(
      "custom-field-detail-page",
      mocks.pages.customFieldDetail,
      "customFieldId",
    ),
    CustomFieldsPage: renderListPage("custom-fields-list-page", mocks.pages.customFieldsList),
    EditCustomFieldPage: renderIdPage(
      "custom-field-edit-page",
      mocks.pages.customFieldEdit,
      "customFieldId",
    ),
    createAssetCustomFieldDefinitionByIDQueryOptions: vi.fn((id: string) =>
      queryOptions(["custom-fields", id], { id, key: "test-field" }),
    ),
    createListAssetCustomFieldDefinitionsQueryOptions: vi.fn(() =>
      queryOptions(["custom-fields"], []),
    ),
    validateCustomFieldTableSearch: actual.validateCustomFieldTableSearch,
  };
});

vi.mock("@/features/findings", async () => {
  const actual = await vi.importActual<typeof FindingFeature>(
    "@/features/findings/hooks/use-finding-table-search-state.ts",
  );

  return {
    CreateFindingPage: (props: CreateFindingPageProps) => {
      mocks.pages.findingCreate(props);
      return (
        <button data-testid="finding-create-page" type="button" onClick={props.onClose}>
          Cancel finding creation
        </button>
      );
    },
    FindingDetailPage: renderIdPage("finding-detail-page", mocks.pages.findingDetail, "findingId"),
    FindingsPage: renderListPage("findings-list-page", mocks.pages.findingsList),
    ImportFindingsPage: renderSimplePage("finding-import-page", mocks.pages.findingImport),
    TriageFindingsPage: renderListPage("finding-triage-page", mocks.pages.findingTriage),
    createFindingByIDQueryOptions: vi.fn((id: string) =>
      queryOptions(["findings", id], { id, assetId: "asset-1" }),
    ),
    createFindingStatsQueryOptions: vi.fn(() =>
      queryOptions(["findings", "stats"], { status: { active: 0, confirmed: 0 } }),
    ),
    createListFindingsQueryOptions: vi.fn(() => queryOptions(["findings"], [])),
    getFindingNavigationCounts: () => ({ mitigationCount: 0, triageCount: 0 }),
    validateFindingTableSearch: actual.validateFindingTableSearch,
  };
});

vi.mock("@/features/roles", async () => {
  const actual = await vi.importActual<typeof RoleFeature>(
    "@/features/roles/hooks/use-role-table-search-state.ts",
  );

  return {
    CreateRolePage: renderSimplePage("role-create-page", mocks.pages.roleCreate),
    EditRolePage: renderIdPage("role-edit-page", mocks.pages.roleEdit, "roleId"),
    RoleDetailPage: renderIdPage("role-detail-page", mocks.pages.roleDetail, "roleId"),
    RolesPage: renderListPage("roles-list-page", mocks.pages.rolesList),
    createListRolesQueryOptions: vi.fn(() => queryOptions(["roles"], [])),
    createRoleByIDQueryOptions: vi.fn((id: string) =>
      queryOptions(["roles", id], { id, name: "Test role" }),
    ),
    validateRoleTableSearch: actual.validateRoleTableSearch,
  };
});

vi.mock("@/features/users", async () => {
  const actual = await vi.importActual<typeof UserFeature>(
    "@/features/users/hooks/use-user-table-search-state.ts",
  );

  return {
    CreateUserPage: renderSimplePage("user-create-page", mocks.pages.userCreate),
    EditUserPage: renderIdPage("user-edit-page", mocks.pages.userEdit, "userId"),
    UserDetailPage: renderIdPage("user-detail-page", mocks.pages.userDetail, "userId"),
    UsersPage: renderListPage("users-list-page", mocks.pages.usersList),
    createListUsersQueryOptions: vi.fn(() => queryOptions(["users"], [])),
    createListRolesQueryOptions: vi.fn(() => queryOptions(["roles"], [])),
    createUserByIDQueryOptions: vi.fn((id: string) =>
      queryOptions(["users", id], { id, username: "test-user" }),
    ),
    validateUserTableSearch: actual.validateUserTableSearch,
  };
});

vi.mock("@/features/vulnerabilities", async () => {
  const actual = await vi.importActual<typeof VulnerabilityFeature>(
    "@/features/vulnerabilities/hooks/use-vulnerability-table-search-state.ts",
  );

  return {
    CreateVulnerabilityPage: renderSimplePage(
      "vulnerability-create-page",
      mocks.pages.vulnerabilityCreate,
    ),
    EditVulnerabilityPage: renderIdPage(
      "vulnerability-edit-page",
      mocks.pages.vulnerabilityEdit,
      "vulnerabilityId",
    ),
    VulnerabilitiesPage: renderListPage(
      "vulnerabilities-list-page",
      mocks.pages.vulnerabilitiesList,
    ),
    VulnerabilityDetailPage: renderIdPage(
      "vulnerability-detail-page",
      mocks.pages.vulnerabilityDetail,
      "vulnerabilityId",
    ),
    createListVulnerabilitiesQueryOptions: vi.fn(() => queryOptions(["vulnerabilities"], [])),
    createVulnerabilityByIDQueryOptions: vi.fn((id: string) =>
      queryOptions(["vulnerabilities", id], { id, identifier: "TEST-1" }),
    ),
    validateVulnerabilityTableSearch: actual.validateVulnerabilityTableSearch,
  };
});

function createAuth(isAuthenticated: boolean): AuthState {
  return {
    clearSession: vi.fn(),
    ensureSession: vi.fn().mockResolvedValue(isAuthenticated),
    isAuthenticated,
    login: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    status: isAuthenticated ? "authenticated" : "unauthenticated",
    user: null,
  };
}

function createPageState(): PageState {
  return {
    actions: [],
    description: "",
    setActions: vi.fn(),
    setDescription: vi.fn(),
    setTitle: vi.fn(),
    title: "",
  };
}

function createRedirects(): LoginRedirects {
  return {
    safeLoginRedirect: vi.fn((redirect: unknown) =>
      typeof redirect === "string" ? redirect : "/",
    ),
  };
}

function renderRoute(initialEntry: string, isAuthenticated = true) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  const auth = createAuth(isAuthenticated);
  const router = createRouter({
    context: {
      auth,
      page: createPageState(),
      queryClient,
      redirects: createRedirects(),
    },
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
    routeTree,
  });

  render(
    <QueryClientProvider client={queryClient}>
      <PageProvider>
        <RouterProvider router={router} />
      </PageProvider>
    </QueryClientProvider>,
  );

  return { auth, router };
}

describe("route adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ["assets", "/assets", "assets-list-page", "asset-1"],
    ["findings", "/findings", "findings-list-page", "finding-1"],
    ["users", "/users", "users-list-page", "user-1"],
    ["vulnerabilities", "/vulnerabilities", "vulnerabilities-list-page", "vulnerability-1"],
    ["custom fields", "/custom-fields", "custom-fields-list-page", "field-1"],
    ["roles", "/roles", "roles-list-page", "role-1"],
    ["triage", "/findings/triage", "finding-triage-page", "finding-1"],
  ])(
    "renders the %s list adapter with validated search and selected forwarding",
    async (_name, path, testId, selected) => {
      const { router } = renderRoute(`${path}?filter=api&selected=${selected}`);

      const page = await screen.findByTestId(testId);

      expect(page).toHaveAttribute("data-selected", selected);
      expect(page).toHaveTextContent('"filter":"api"');
      expect(router.state.location.search.selected).toBe(selected);
    },
  );

  it("removes an invalid selected value before forwarding list props", async () => {
    const { router } = renderRoute("/assets");

    await screen.findByTestId("assets-list-page");

    await router.navigate({
      search: { filter: "api", selected: 42 } as never,
      to: "/assets",
    });

    await waitFor(() => {
      expect(router.state.location.search.selected).toBeUndefined();
    });
    expect(screen.getByTestId("assets-list-page")).toHaveAttribute("data-selected", "");
  });

  it.each([
    ["asset", "/assets/asset-1", "asset-detail-page", "asset-1"],
    ["finding", "/findings/finding-1", "finding-detail-page", "finding-1"],
    ["user", "/users/user-1", "user-detail-page", "user-1"],
    [
      "vulnerability",
      "/vulnerabilities/vulnerability-1",
      "vulnerability-detail-page",
      "vulnerability-1",
    ],
    ["custom field", "/custom-fields/field-1", "custom-field-detail-page", "field-1"],
    ["role", "/roles/role-1", "role-detail-page", "role-1"],
  ])("renders the %s detail adapter with its route param", async (_name, path, testId, id) => {
    renderRoute(path);

    expect(await screen.findByTestId(testId)).toHaveTextContent(id);
  });

  it.each([
    [
      "custom field",
      "/custom-fields/field-1/edit",
      "custom-field-edit-page",
      "field-1",
      "custom-field-detail-page",
    ],
    ["role", "/roles/role-1/edit", "role-edit-page", "role-1", "role-detail-page"],
    ["user", "/users/user-1/edit", "user-edit-page", "user-1", "user-detail-page"],
    [
      "vulnerability",
      "/vulnerabilities/vulnerability-1/edit",
      "vulnerability-edit-page",
      "vulnerability-1",
      "vulnerability-detail-page",
    ],
  ])(
    "renders the %s nested edit outlet instead of the detail page",
    async (_name, path, editTestId, id, detailTestId) => {
      renderRoute(path);

      expect(await screen.findByTestId(editTestId)).toHaveTextContent(id);
      expect(screen.queryByTestId(detailTestId)).toBeNull();
    },
  );

  it.each([
    ["finding", "/findings/new", "finding-create-page"],
    ["user", "/users/new", "user-create-page"],
    ["vulnerability", "/vulnerabilities/new", "vulnerability-create-page"],
    ["custom field", "/custom-fields/new", "custom-field-create-page"],
    ["role", "/roles/new", "role-create-page"],
  ])("renders the %s create adapter", async (_name, path, testId) => {
    renderRoute(path);

    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it("uses the finding create adapter callback to navigate back", async () => {
    const user = userEvent.setup();
    const { router } = renderRoute("/findings");

    await screen.findByTestId("findings-list-page");
    await router.navigate({ to: "/findings/new" });
    await screen.findByRole("button", { name: "Cancel finding creation" });

    await user.click(screen.getByRole("button", { name: "Cancel finding creation" }));

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/findings");
    });
  });

  it.each([
    ["dashboard", "/", "dashboard-page"],
    ["import", "/findings/import", "finding-import-page"],
    ["triage", "/findings/triage", "finding-triage-page"],
  ])("renders the %s entry route", async (_name, path, testId) => {
    renderRoute(path);

    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it("renders login through the root outlet", async () => {
    const { auth } = renderRoute("/login?redirect=%2Ffindings", false);

    expect(await screen.findByTestId("login-page")).toHaveTextContent("/findings");
    expect(auth.ensureSession).toHaveBeenCalledTimes(1);
  });

  it("keeps the authenticated guard redirect path when a session is missing", async () => {
    const { auth, router } = renderRoute("/assets", false);

    expect(await screen.findByTestId("login-page")).toHaveTextContent("/assets");
    expect(router.state.location.pathname).toBe("/login");
    expect(router.state.location.search.redirect).toBe("/assets");
    expect(auth.ensureSession).toHaveBeenCalledTimes(2);
  });
});
