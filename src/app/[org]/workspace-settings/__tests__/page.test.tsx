/**
 * The Settings tab on the workspace settings page: how a model comparison
 * runs its models for every agent in this workspace.
 *
 * The page's hooks are mocked so the test drives one workspace and watches the
 * save call, the same way the workspace switcher test does.
 */
import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import type { Organization } from "@/lib/orgs";
import WorkspaceSettingsPage from "../page";

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
import { toast } from "sonner";

jest.mock("../../../../components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHideFloatingButton: () => {},
}));

const updateOrganizationMock = jest.fn();
let mockOrganizations: Organization[] = [];

jest.mock("../../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "token-1",
  useActiveOrgUuid: () => ["org-1", jest.fn()],
  useOrganizations: () => ({
    organizations: mockOrganizations,
    isLoading: false,
    renameOrganization: jest.fn(),
    updateOrganization: updateOrganizationMock,
  }),
  useOrgMembers: () => ({
    members: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    addMember: jest.fn(),
    removeMember: jest.fn(),
  }),
  useWorkspaceApiKeys: () => ({
    apiKeys: [],
    isLoading: false,
    error: null,
    refetch: jest.fn(),
    createApiKey: jest.fn(),
    revokeApiKey: jest.fn(),
  }),
  seedOrgsCache: jest.fn(),
}));

function makeOrg(overrides: Partial<Organization> = {}): Organization {
  return {
    uuid: "org-1",
    name: "Acme Health",
    is_personal: false,
    created_by_user_id: "user-1",
    member_role: "owner",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Land on the Settings tab, the way a shared link does. */
function openSettingsTab() {
  window.history.replaceState(null, "", "?tab=settings");
  render(<WorkspaceSettingsPage />);
}

beforeEach(() => {
  mockOrganizations = [makeOrg()];
  updateOrganizationMock.mockReset();
  (toast.success as jest.Mock).mockReset();
});

it("opens the Settings tab from the address", () => {
  openSettingsTab();

  expect(
    screen.getByRole("heading", {
      name: "How to run the models in a comparison",
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Parallel" })).toBeChecked();
});

it("has a Settings tab that opens from a click", async () => {
  const user = setupUser();
  window.history.replaceState(null, "", "/");
  render(<WorkspaceSettingsPage />);

  await user.click(screen.getByRole("button", { name: "Settings" }));

  expect(
    screen.getByRole("heading", {
      name: "How to run the models in a comparison",
    }),
  ).toBeInTheDocument();
});

it("shows the workspace's saved choice", () => {
  mockOrganizations = [makeOrg({ benchmark_parallel_models: false })];
  openSettingsTab();

  expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
});

it("saves one after another and says so", async () => {
  const user = setupUser();
  updateOrganizationMock.mockResolvedValue(
    makeOrg({ benchmark_parallel_models: false }),
  );
  openSettingsTab();

  await user.click(screen.getByRole("radio", { name: "Sequential" }));

  await waitFor(() =>
    expect(updateOrganizationMock).toHaveBeenCalledWith("org-1", {
      benchmark_parallel_models: false,
    }),
  );
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      "Saved how the models run in a comparison",
    ),
  );
});

it("keeps the saved choice on screen while the workspace catches up", async () => {
  const user = setupUser();
  updateOrganizationMock.mockResolvedValue(
    makeOrg({ benchmark_parallel_models: false }),
  );
  openSettingsTab();

  await user.click(screen.getByRole("radio", { name: "Sequential" }));
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith(
      "Saved how the models run in a comparison",
    ),
  );

  // `mockOrganizations` still says Parallel, standing in for the workspace
  // list this page holds not having been read again yet. The choice just
  // saved must not jump back to Parallel while that happens.
  expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Parallel" })).not.toBeChecked();
});

it("keeps the choice disabled until the save answers", async () => {
  const user = setupUser();
  let finishSave: (value: Organization | null) => void = () => {};
  updateOrganizationMock.mockReturnValue(
    new Promise<Organization | null>((resolve) => {
      finishSave = resolve;
    }),
  );
  openSettingsTab();

  await user.click(screen.getByRole("radio", { name: "Sequential" }));

  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Sequential" })).toBeDisabled(),
  );
  expect(screen.getByRole("radio", { name: "Parallel" })).toBeDisabled();
  // The row the user clicked is the one shown while it is being saved.
  expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();

  finishSave(makeOrg({ benchmark_parallel_models: false }));
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Sequential" })).toBeEnabled(),
  );
});

it("puts the choice back when the save fails", async () => {
  const user = setupUser();
  updateOrganizationMock.mockRejectedValue(new Error("Workspace is read only"));
  openSettingsTab();

  await user.click(screen.getByRole("radio", { name: "Sequential" }));

  expect(await screen.findByText("Workspace is read only")).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Parallel" })).toBeChecked();
  expect(toast.success).not.toHaveBeenCalled();
});
