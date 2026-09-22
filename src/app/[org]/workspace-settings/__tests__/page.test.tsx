/**
 * The workspace settings page: Members opens first, and the General tab holds
 * the workspace name and how a model comparison runs its models.
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
const renameOrganizationMock = jest.fn();
let mockOrganizations: Organization[] = [];

jest.mock("../../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "token-1",
  useActiveOrgUuid: () => ["org-1", jest.fn()],
  useOrganizations: () => ({
    organizations: mockOrganizations,
    isLoading: false,
    renameOrganization: renameOrganizationMock,
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

/** A workspace saved as running the models one after another. */
const RUNS_ONE_AFTER_ANOTHER: Partial<Organization> = {
  settings: { model_benchmarking: { run_models_in_parallel: false } },
};

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

/** Land on the General tab, the way a shared link does. */
function openSettingsTab() {
  window.history.replaceState(null, "", "?tab=general");
  render(<WorkspaceSettingsPage />);
}

beforeEach(() => {
  mockOrganizations = [makeOrg()];
  updateOrganizationMock.mockReset();
  renameOrganizationMock.mockReset();
  (toast.success as jest.Mock).mockReset();
});

it("opens the General tab from the address", () => {
  openSettingsTab();

  expect(
    screen.getByRole("heading", {
      name: "Benchmarking",
    }),
  ).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Parallel" })).toBeChecked();
});

it("has a General tab that opens from a click", async () => {
  const user = setupUser();
  window.history.replaceState(null, "", "/");
  render(<WorkspaceSettingsPage />);

  await user.click(screen.getByRole("button", { name: "General" }));

  expect(
    screen.getByRole("heading", {
      name: "Benchmarking",
    }),
  ).toBeInTheDocument();
});

it("opens on the Members tab, with the name kept to General", () => {
  window.history.replaceState(null, "", "/");
  render(<WorkspaceSettingsPage />);

  expect(screen.getByRole("heading", { name: "Members" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
});

it("renames the workspace from the General tab", async () => {
  const user = setupUser();
  renameOrganizationMock.mockResolvedValue(undefined);
  openSettingsTab();

  const nameInput = screen.getByRole("textbox", { name: "Name" });
  expect(nameInput).toHaveValue("Acme Health");
  await user.clear(nameInput);
  await user.type(nameInput, "Acme Clinics");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(renameOrganizationMock).toHaveBeenCalledWith("org-1", "Acme Clinics");
  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith("Workspace name updated"),
  );
});

it("shows the workspace's saved choice", () => {
  mockOrganizations = [makeOrg(RUNS_ONE_AFTER_ANOTHER)];
  openSettingsTab();

  expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
});

it("saves one after another and says so", async () => {
  const user = setupUser();
  updateOrganizationMock.mockResolvedValue(makeOrg(RUNS_ONE_AFTER_ANOTHER));
  openSettingsTab();

  await user.click(screen.getByRole("radio", { name: "Sequential" }));

  await waitFor(() =>
    expect(updateOrganizationMock).toHaveBeenCalledWith("org-1", {
      settings: { model_benchmarking: { run_models_in_parallel: false } },
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
  updateOrganizationMock.mockResolvedValue(makeOrg(RUNS_ONE_AFTER_ANOTHER));
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

  finishSave(makeOrg(RUNS_ONE_AFTER_ANOTHER));
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
