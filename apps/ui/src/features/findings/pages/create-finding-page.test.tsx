import { AffectedResourceType } from "@exposurenexus/contracts/model/affected-resource";
import { FindingStatus } from "@exposurenexus/contracts/model/finding";
import { VulnerabilitySeverity } from "@exposurenexus/contracts/model/vulnerability";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreateFindingPage } from "@/features/findings/pages/create-finding-page.tsx";

import type { FindingAffectedResource } from "@exposurenexus/contracts/model/affected-resource";
import type { ReactNode } from "react";

const mocks = vi.hoisted(() => ({
  createFinding: vi.fn(),
  historyBack: vi.fn(),
  usePageMeta: vi.fn(),
  users: [
    {
      id: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
      username: "alex",
      displayName: "Alex Assignee",
      email: "alex@example.com",
      enabled: true,
      roleIds: [],
    },
    {
      id: "8f5f4c3b-c369-481d-98f7-cf7148d80d21",
      username: "sam",
      displayName: "",
      email: "sam@example.com",
      enabled: false,
      roleIds: [],
    },
  ],
}));

vi.mock("@/features/assets", () => ({
  AssetCombobox: ({ onChange }: { onChange?: (asset: { id: string }) => void }) => (
    <button
      type="button"
      onClick={() =>
        onChange?.({
          id: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        })
      }
    >
      Select asset
    </button>
  ),
}));

vi.mock("@tanstack/react-query", () => ({
  useSuspenseQuery: () => ({
    data: mocks.users,
    isPending: false,
    isSuccess: true,
  }),
}));

vi.mock("@/features/users", () => ({
  createListUsersQueryOptions: () => ({
    queryKey: ["users"],
  }),
  getUserProfileDisplayName: (user: { displayName: string }) => user.displayName,
}));

vi.mock("@/components/ui/select.tsx", async () => {
  const React = await import("react");
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
    value?: string | null;
  }>({});

  return {
    Select: ({
      children,
      onValueChange,
      value,
    }: {
      children: ReactNode;
      onValueChange?: (value: string) => void;
      value?: string | null;
    }) => (
      <SelectContext.Provider value={{ onValueChange, value }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectGroup: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    SelectItem: ({ children, value }: { children: ReactNode; value: string }) => {
      const { onValueChange } = React.useContext(SelectContext);

      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
    SelectTrigger: ({ children, id }: { children: ReactNode; id?: string }) => (
      <button type="button" role="combobox" id={id}>
        {children}
      </button>
    ),
    SelectValue: ({
      children,
      placeholder,
    }: {
      children?: ReactNode | ((value: string | null | undefined) => ReactNode);
      placeholder?: string;
    }) => {
      const { value } = React.useContext(SelectContext);
      const content = typeof children === "function" ? children(value) : (children ?? value);

      return <span>{content ?? placeholder}</span>;
    },
  };
});

vi.mock("@/hooks/use-page-meta.tsx", () => ({
  usePageMeta: mocks.usePageMeta,
}));

vi.mock("@/features/findings/hooks/use-finding-lifecycle.ts", () => ({
  useFindingLifecycle: () => ({
    createFinding: mocks.createFinding,
  }),
}));

function renderCreateFindingPage() {
  return render(<CreateFindingPage onClose={mocks.historyBack} />);
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^title$/i), {
    target: { value: "Exposed admin panel" },
  });
  fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
}

type ResourceCase = {
  typeLabel: string;
  expected: FindingAffectedResource;
  fields: Array<[string, string]>;
  selects?: Array<[string, string]>;
};

const resourceCases: Array<ResourceCase> = [
  {
    typeLabel: "Web endpoint",
    expected: {
      type: AffectedResourceType.WebEndpoint,
      scheme: "https",
      host: "api.example.com",
      port: 8443,
      path: "/admin",
      method: "POST",
    },
    fields: [
      ["Host", "api.example.com"],
      ["Port", "8443"],
      ["Path", "/admin"],
      ["Method", "POST"],
    ],
    selects: [["Scheme", "HTTPS"]],
  },
  {
    typeLabel: "Network service",
    expected: {
      type: AffectedResourceType.NetworkService,
      host: "db.example.com",
      port: 5432,
      transport: "tcp",
      protocol: "postgresql",
    },
    fields: [
      ["Host", "db.example.com"],
      ["Port", "5432"],
      ["Protocol", "postgresql"],
    ],
    selects: [["Transport", "TCP"]],
  },
  {
    typeLabel: "Source code",
    expected: {
      type: AffectedResourceType.SourceCode,
      repository: "github.com/example/service",
      file: "src/admin.ts",
      location: { startLine: 42 },
      symbol: "adminHandler",
      locationFingerprint: "sha256:abcd",
    },
    fields: [
      ["Repository", "github.com/example/service"],
      ["File", "src/admin.ts"],
      ["Start line", "42"],
      ["Symbol", "adminHandler"],
      ["Location fingerprint", "sha256:abcd"],
    ],
  },
  {
    typeLabel: "Package",
    expected: {
      type: AffectedResourceType.Package,
      ecosystem: "npm",
      name: "example-package",
      installationPath: "package-lock.json",
    },
    fields: [
      ["Ecosystem", "npm"],
      ["Package name", "example-package"],
      ["Installation path", "package-lock.json"],
    ],
  },
  {
    typeLabel: "Container image",
    expected: {
      type: AffectedResourceType.ContainerImage,
      registry: "registry.example.com",
      repository: "platform/admin",
      digest: "sha256:abcd",
    },
    fields: [
      ["Registry", "registry.example.com"],
      ["Repository", "platform/admin"],
      ["Digest", "sha256:abcd"],
    ],
  },
  {
    typeLabel: "Cloud resource",
    expected: {
      type: AffectedResourceType.CloudResource,
      provider: "aws",
      providerAccount: "123456789012",
      region: "eu-central-1",
      resourceId: "arn:aws:s3:::admin-data",
      subresource: "bucket-policy",
    },
    fields: [
      ["Provider", "aws"],
      ["Provider account", "123456789012"],
      ["Region", "eu-central-1"],
      ["Resource ID", "arn:aws:s3:::admin-data"],
      ["Subresource", "bucket-policy"],
    ],
  },
];

describe("CreateFindingPage", () => {
  beforeEach(() => {
    mocks.createFinding.mockReset();
    mocks.historyBack.mockReset();
    mocks.usePageMeta.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not submit invalid required fields", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    expect(mocks.createFinding).not.toHaveBeenCalled();
  });

  it("cancels back to the previous page", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(mocks.historyBack).toHaveBeenCalledTimes(1);
  });

  it("shows the canonical empty identity defaults", () => {
    renderCreateFindingPage();

    expect(screen.getByLabelText(/severity/i).textContent).toMatch(/medium/i);
    expect(screen.getByLabelText(/status/i).textContent).toMatch(/active/i);
    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    expect(screen.getByLabelText(/affected resource/i).textContent).toMatch(/unspecified/i);
    expect(screen.queryByRole("button", { name: /whole asset/i })).toBeNull();
  });

  it("keeps incomplete weakness text visible while typing", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    const weakness = screen.getByLabelText(/weakness identifiers/i);
    fireEvent.change(weakness, { target: { value: "cwe=" } });

    expect(weakness).toHaveValue("cwe=");
  });

  it("shows a syntax error without creating a finding", async () => {
    renderCreateFindingPage();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    fireEvent.change(screen.getByLabelText(/weakness identifiers/i), {
      target: { value: "invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Weakness identifiers must use namespace=identifier entries.",
    );
    expect(mocks.createFinding).not.toHaveBeenCalled();
    expect(mocks.historyBack).not.toHaveBeenCalled();
  });

  it("shows the first schema error without creating a finding", async () => {
    renderCreateFindingPage();
    fireEvent.click(screen.getByRole("button", { name: /select asset/i }));
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /unable to create finding\. title:/i,
    );
    expect(mocks.createFinding).not.toHaveBeenCalled();
    expect(mocks.historyBack).not.toHaveBeenCalled();
  });

  it("submits a finding with its initial manual observation defaults", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith({
        assetId: "447b53a7-c3ce-4a0c-b96a-099f5e5dc71c",
        title: "Exposed admin panel",
        severity: VulnerabilitySeverity.Medium,
        status: FindingStatus.Active,
        assigneeId: null,
        dueDate: null,
        mitigation: null,
        weakness: { identifiers: {} },
        affectedResource: { type: AffectedResourceType.Unspecified },
        vulnerabilityIds: [],
        observation: {},
      });
    });
    expect(mocks.historyBack).toHaveBeenCalledTimes(1);
  });

  it("submits selected resource, catalog, and observation values", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();

    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    fireEvent.click(screen.getByRole("button", { name: /web endpoint/i }));
    fireEvent.change(screen.getByLabelText(/catalog entry ids/i), {
      target: { value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe" },
    });

    fireEvent.click(screen.getByRole("tab", { name: /observation/i }));
    fireEvent.change(screen.getByLabelText(/^evidence$/i), {
      target: { value: "GET /admin returned 200" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          affectedResource: { type: AffectedResourceType.WebEndpoint },
          vulnerabilityIds: ["9d7acdd0-fad1-46c9-8218-1793f421f0fe"],
          observation: {
            evidence: "GET /admin returned 200",
          },
        }),
      );
    });
  });

  it.each([
    [
      "Network service",
      "Host",
      "db.example.com",
      { type: AffectedResourceType.NetworkService, host: "db.example.com" },
    ],
    [
      "Package",
      "Package name",
      "example-package",
      { type: AffectedResourceType.Package, name: "example-package" },
    ],
    [
      "Cloud resource",
      "Resource ID",
      "arn:aws:s3:::example",
      { type: AffectedResourceType.CloudResource, resourceId: "arn:aws:s3:::example" },
    ],
  ] as const)(
    "submits %s affected-resource fields",
    async (type, label, value, affectedResource) => {
      mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
      renderCreateFindingPage();
      fillRequiredFields();
      fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
      fireEvent.click(screen.getByRole("button", { name: type }));
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

      await waitFor(() => {
        expect(mocks.createFinding).toHaveBeenCalledWith(
          expect.objectContaining({ affectedResource }),
        );
      });
    },
  );

  it.each(resourceCases)("submits every %s resource field", async (resourceCase) => {
    const actor = userEvent.setup();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    renderCreateFindingPage();
    fillRequiredFields();

    await actor.click(screen.getByRole("tab", { name: /identity/i }));
    await actor.click(screen.getByLabelText("Affected resource"));
    await actor.click(await screen.findByRole("button", { name: resourceCase.typeLabel }));
    for (const [label, option] of resourceCase.selects ?? []) {
      await actor.click(screen.getByLabelText(label));
      await actor.click(screen.getByRole("button", { name: option }));
    }
    for (const [label, value] of resourceCase.fields) {
      await actor.type(screen.getByLabelText(label), value);
    }

    await actor.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({ affectedResource: resourceCase.expected }),
      );
    });
  });

  it.each(resourceCases)(
    "omits cleared %s resource fields from the payload",
    async (resourceCase) => {
      const actor = userEvent.setup();
      mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
      renderCreateFindingPage();
      fillRequiredFields();

      await actor.click(screen.getByRole("tab", { name: /identity/i }));
      await actor.click(screen.getByLabelText("Affected resource"));
      await actor.click(await screen.findByRole("button", { name: resourceCase.typeLabel }));
      for (const [label, value] of resourceCase.fields) {
        await actor.type(screen.getByLabelText(label), value);
      }
      for (const [label] of resourceCase.fields) {
        await actor.clear(screen.getByLabelText(label));
      }

      await actor.click(screen.getByRole("button", { name: /create finding/i }));

      await waitFor(() => {
        expect(mocks.createFinding).toHaveBeenCalledWith(
          expect.objectContaining({ affectedResource: { type: resourceCase.expected.type } }),
        );
      });
    },
  );

  it("normalizes the title and weakness in a populated creation payload", async () => {
    const actor = userEvent.setup();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    renderCreateFindingPage();
    fillRequiredFields();

    await actor.clear(screen.getByLabelText(/^title$/i));
    await actor.type(screen.getByLabelText(/^title$/i), "  Exposed admin panel  ");
    await actor.click(screen.getByRole("tab", { name: /identity/i }));
    await actor.type(screen.getByLabelText(/weakness identifiers/i), "cwe=cwe-89");
    await actor.click(screen.getByLabelText("Affected resource"));
    await actor.click(screen.getByRole("button", { name: "Source code" }));
    await actor.type(screen.getByLabelText("Repository"), "github.com/example/service");

    await actor.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Exposed admin panel",
          weakness: { identifiers: { cwe: ["CWE-89"] } },
          affectedResource: {
            type: AffectedResourceType.SourceCode,
            repository: "github.com/example/service",
          },
        }),
      );
    });
  });

  it("removes stale creation resource fields when switching back to unspecified", async () => {
    const actor = userEvent.setup();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    renderCreateFindingPage();
    fillRequiredFields();

    await actor.click(screen.getByRole("tab", { name: /identity/i }));
    await actor.click(screen.getByLabelText("Affected resource"));
    await actor.click(screen.getByRole("button", { name: "Web endpoint" }));
    await actor.type(screen.getByLabelText("Host"), "stale.example.com");
    await actor.click(screen.getByLabelText("Affected resource"));
    await actor.click(screen.getByRole("button", { name: "Unspecified resource" }));

    expect(screen.queryByLabelText("Host")).toBeNull();
    await actor.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({ affectedResource: { type: AffectedResourceType.Unspecified } }),
      );
    });
  });

  it("omits a cleared initial observation date and keeps a cleared due date null", async () => {
    const actor = userEvent.setup();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    renderCreateFindingPage();
    fillRequiredFields();

    const dueDate = screen.getByLabelText(/due date/i);
    fireEvent.change(dueDate, { target: { value: "2026-05-06" } });
    await actor.clear(dueDate);
    await actor.click(screen.getByRole("tab", { name: /observation/i }));
    const observedAt = screen.getByLabelText("Observed at");
    fireEvent.change(observedAt, { target: { value: "2026-05-01T13:45" } });
    await actor.clear(observedAt);
    await actor.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => expect(mocks.createFinding).toHaveBeenCalledTimes(1));
    const payload = mocks.createFinding.mock.calls[0][0] as {
      dueDate: Date | null;
      observation: Record<string, unknown>;
    };
    expect(payload.dueDate).toBeNull();
    expect(payload.observation.observedAt).toBeUndefined();
    expect(JSON.parse(JSON.stringify(payload)).observation).toEqual({});
  });

  it("drops stale resource fields when switching types", async () => {
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    renderCreateFindingPage();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    fireEvent.click(screen.getByRole("button", { name: /web endpoint/i }));
    fireEvent.change(screen.getByLabelText("Host"), { target: { value: "stale.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /cloud resource/i }));
    fireEvent.change(screen.getByLabelText("Provider"), { target: { value: "aws" } });
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          affectedResource: { type: AffectedResourceType.CloudResource, provider: "aws" },
        }),
      );
    });
  });

  it("submits all editable initial-observation fields", async () => {
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    renderCreateFindingPage();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("tab", { name: /observation/i }));
    for (const [label, value] of [
      ["Observation title", "Manual verification"],
      ["Description", "Observed externally"],
      ["Evidence", "GET /admin returned 200"],
      ["Observation remediation", "Restrict access"],
      ["Observed at", "2026-05-01T13:45"],
    ]) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          observation: {
            title: "Manual verification",
            description: "Observed externally",
            evidence: "GET /admin returned 200",
            remediation: "Restrict access",
            observedAt: new Date("2026-05-01T13:45"),
          },
        }),
      );
    });
  });

  it("deduplicates valid catalog IDs and rejects invalid IDs", async () => {
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    renderCreateFindingPage();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    const ids = screen.getByLabelText(/catalog entry ids/i);
    fireEvent.change(ids, {
      target: {
        value: "9d7acdd0-fad1-46c9-8218-1793f421f0fe, 9d7acdd0-fad1-46c9-8218-1793f421f0fe",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));
    await waitFor(() =>
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          vulnerabilityIds: ["9d7acdd0-fad1-46c9-8218-1793f421f0fe"],
        }),
      ),
    );

    cleanup();
    mocks.createFinding.mockReset();
    renderCreateFindingPage();
    fillRequiredFields();
    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    fireEvent.change(screen.getByLabelText(/catalog entry ids/i), {
      target: { value: "not-a-uuid" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/vulnerabilityIds/i);
    expect(mocks.createFinding).not.toHaveBeenCalled();
  });

  it("submits the schema-parsed weakness value", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();

    fireEvent.click(screen.getByRole("tab", { name: /identity/i }));
    fireEvent.change(screen.getByLabelText(/weakness identifiers/i), {
      target: { value: "cwe=cwe-89; nuclei=admin-panel" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          weakness: {
            identifiers: {
              cwe: ["CWE-89"],
              nuclei: ["admin-panel"],
            },
          },
        }),
      );
    });
    expect(mocks.historyBack).toHaveBeenCalledTimes(1);
  });

  it("supports severity, status, due date, and assignment", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmed/i }));
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: "2026-05-06" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: VulnerabilitySeverity.Critical,
          status: FindingStatus.Confirmed,
          dueDate: new Date("2026-05-06T00:00:00.000Z"),
          assigneeId: "f74d7ff2-2d81-4d1e-9fa9-73af7d46a37d",
        }),
      );
    });
  });

  it("renders the selected assignee label", () => {
    renderCreateFindingPage();

    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));

    expect(screen.getByLabelText(/assignee/i)).toHaveTextContent("Alex Assignee");
  });

  it("clears a selected assignee before creating", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce({ id: "finding-id" });
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Alex Assignee" }));
    fireEvent.click(screen.getByRole("button", { name: "Unassigned" }));
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => {
      expect(mocks.createFinding).toHaveBeenCalledWith(
        expect.objectContaining({ assigneeId: null }),
      );
    });
  });

  it("stays on the form when creation fails", async () => {
    renderCreateFindingPage();
    mocks.createFinding.mockResolvedValueOnce(null);
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /create finding/i }));

    await waitFor(() => expect(mocks.createFinding).toHaveBeenCalledTimes(1));
    expect(mocks.historyBack).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^title$/i)).toHaveValue("Exposed admin panel");
  });

  it("disables actions and prevents duplicate submission while creation is pending", async () => {
    let resolve!: (value: { id: string }) => void;
    mocks.createFinding.mockReturnValueOnce(
      new Promise((promiseResolve) => {
        resolve = promiseResolve;
      }),
    );
    renderCreateFindingPage();
    fillRequiredFields();
    const submit = screen.getByRole("button", { name: /create finding/i });
    fireEvent.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    fireEvent.click(submit);
    expect(mocks.createFinding).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    resolve({ id: "finding-id" });
    await waitFor(() => expect(mocks.historyBack).toHaveBeenCalledOnce());
  });
});
