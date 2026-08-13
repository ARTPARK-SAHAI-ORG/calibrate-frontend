/**
 * Interaction tests for the sidebar WorkspaceSwitcher.
 *
 * The hooks it depends on (`useAccessToken` / `useActiveOrgUuid` /
 * `useOrganizations` from `@/hooks`, plus `getActiveOrgUuid` / `pickDefaultOrg`
 * from `@/lib/orgs`) are mocked so we drive the component with a fixed org list
 * and assert its render + navigation behavior. Switching workspaces calls
 * `window.location.assign` / `.reload`, which we stub so no navigation happens.
 */
import { render, screen, setupUser, waitFor, within } from "@/test-utils";
import { WorkspaceSwitcher } from "../WorkspaceSwitcher";
import type { Organization } from "@/lib/orgs";

let mockOrganizations: Organization[] = [];
let mockActiveUuid: string | null = null;

const createOrganizationMock = jest.fn();
const setActiveUuidMock = jest.fn();
const getActiveOrgUuidMock = jest.fn();
const pickDefaultOrgMock = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "token-1",
  useActiveOrgUuid: () => [mockActiveUuid, setActiveUuidMock],
  useOrganizations: () => ({
    organizations: mockOrganizations,
    createOrganization: createOrganizationMock,
  }),
}));

jest.mock("../../lib/orgs", () => ({
  __esModule: true,
  getActiveOrgUuid: () => getActiveOrgUuidMock(),
  pickDefaultOrg: (...args: unknown[]) => pickDefaultOrgMock(...args),
}));

function makeOrg(overrides: Partial<Organization>): Organization {
  return {
    uuid: "org-1",
    name: "Personal",
    is_personal: true,
    created_by_user_id: "user-1",
    member_role: "owner",
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const personalOrg = makeOrg({
  uuid: "org-1",
  name: "Personal",
  is_personal: true,
});
const acmeOrg = makeOrg({
  uuid: "org-2",
  name: "Acme Health",
  is_personal: false,
});

const assignMock = jest.fn();
const reloadMock = jest.fn();

function setLocation(pathname: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { pathname, assign: assignMock, reload: reloadMock },
  });
}

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: two workspaces, personal active, and a persisted uuid that
    // matches the active org so the reconcile effect stays a no-op.
    mockOrganizations = [personalOrg, acmeOrg];
    mockActiveUuid = "org-1";
    getActiveOrgUuidMock.mockReturnValue("org-1");
    pickDefaultOrgMock.mockReturnValue(personalOrg);
    setLocation("/agents");
  });

  describe("expanded mode", () => {
    it("renders the active workspace name", () => {
      render(<WorkspaceSwitcher collapsed={false} />);
      expect(
        screen.getByRole("button", { name: /Personal/ }),
      ).toBeInTheDocument();
    });

    it("shows a generic label when there are no workspaces", () => {
      mockOrganizations = [];
      mockActiveUuid = null;
      getActiveOrgUuidMock.mockReturnValue(null);
      render(<WorkspaceSwitcher collapsed={false} />);
      expect(screen.getByText("Workspace")).toBeInTheDocument();
    });

    it("opens the dropdown and lists all workspaces plus the actions", async () => {
      const user = setupUser();
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));

      const menu = screen.getByRole("menu");
      expect(menu).toBeInTheDocument();
      expect(screen.getByText("Acme Health")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Create workspace" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "Workspace settings" }),
      ).toHaveAttribute("href", "/workspace-settings?tab=admin");
      expect(
        screen.getByRole("link", { name: "API keys" }),
      ).toHaveAttribute("href", "/workspace-settings?tab=api-keys");
    });

    it("closes the dropdown on an outside click", async () => {
      const user = setupUser();
      render(<WorkspaceSwitcher collapsed={false} />);
      await user.click(screen.getByRole("button", { name: /Personal/ }));
      expect(screen.getByRole("menu")).toBeInTheDocument();

      await user.click(document.body);
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      );
    });
  });

  describe("selecting a workspace", () => {
    it("switches to a different workspace and navigates to the section root", async () => {
      const user = setupUser();
      setLocation("/tools");
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      await user.click(screen.getByRole("button", { name: /Acme Health/ }));

      expect(setActiveUuidMock).toHaveBeenCalledWith("org-2");
      expect(assignMock).toHaveBeenCalledWith("/tools");
      expect(reloadMock).not.toHaveBeenCalled();
    });

    it("falls back to /agents for a section without a list page", async () => {
      const user = setupUser();
      setLocation("/datasets/abc-123");
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      await user.click(screen.getByRole("button", { name: /Acme Health/ }));

      expect(assignMock).toHaveBeenCalledWith("/agents");
    });

    it("reloads in place when switching from /workspace-settings", async () => {
      const user = setupUser();
      setLocation("/workspace-settings");
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      await user.click(screen.getByRole("button", { name: /Acme Health/ }));

      expect(setActiveUuidMock).toHaveBeenCalledWith("org-2");
      expect(reloadMock).toHaveBeenCalledTimes(1);
      expect(assignMock).not.toHaveBeenCalled();
    });

    it("just closes the dropdown when the active workspace is re-selected", async () => {
      const user = setupUser();
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      const menu = screen.getByRole("menu");
      await user.click(
        within(menu).getByRole("button", { name: /Personal/ }),
      );

      expect(setActiveUuidMock).not.toHaveBeenCalled();
      expect(assignMock).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      );
    });
  });

  describe("creating a workspace", () => {
    it("opens the create dialog and switches to the created workspace", async () => {
      const user = setupUser();
      const created = makeOrg({
        uuid: "org-3",
        name: "New WS",
        is_personal: false,
      });
      createOrganizationMock.mockResolvedValue(created);
      setLocation("/agents");
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      await user.click(
        screen.getByRole("button", { name: "Create workspace" }),
      );

      // Dropdown closed, dialog opened.
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
      const input = await screen.findByPlaceholderText("e.g. Acme Health");
      await user.type(input, "New WS");
      await user.click(
        screen.getByRole("button", { name: "Create workspace" }),
      );

      await waitFor(() =>
        expect(createOrganizationMock).toHaveBeenCalledWith("New WS"),
      );
      expect(setActiveUuidMock).toHaveBeenCalledWith("org-3");
      expect(assignMock).toHaveBeenCalledWith("/agents");
    });

    it("does not navigate when creation returns nothing", async () => {
      const user = setupUser();
      createOrganizationMock.mockResolvedValue(null);
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      await user.click(
        screen.getByRole("button", { name: "Create workspace" }),
      );
      const input = await screen.findByPlaceholderText("e.g. Acme Health");
      await user.type(input, "Nope");
      await user.click(
        screen.getByRole("button", { name: "Create workspace" }),
      );

      await waitFor(() =>
        expect(createOrganizationMock).toHaveBeenCalledWith("Nope"),
      );
      expect(setActiveUuidMock).not.toHaveBeenCalled();
      expect(assignMock).not.toHaveBeenCalled();
    });
  });

  describe("collapsed mode", () => {
    it("renders an avatar-only switcher button with a tooltip", () => {
      render(<WorkspaceSwitcher collapsed />);
      expect(
        screen.getByRole("button", { name: "Workspace switcher" }),
      ).toBeInTheDocument();
      // Tooltip label reflects the active workspace name.
      expect(screen.getByText("Personal")).toBeInTheDocument();
    });

    it("opens the dropdown from the collapsed avatar", async () => {
      const user = setupUser();
      render(<WorkspaceSwitcher collapsed />);

      await user.click(
        screen.getByRole("button", { name: "Workspace switcher" }),
      );
      expect(screen.getByRole("menu")).toBeInTheDocument();
      expect(screen.getByText("Acme Health")).toBeInTheDocument();
    });
  });

  describe("dropdown edge cases", () => {
    it("shows an empty state when there are no workspaces", async () => {
      const user = setupUser();
      mockOrganizations = [];
      mockActiveUuid = null;
      getActiveOrgUuidMock.mockReturnValue(null);
      pickDefaultOrgMock.mockReturnValue(null);
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Workspace/ }));
      expect(screen.getByText("No workspaces yet.")).toBeInTheDocument();
      // With no active org, the settings and API keys links are hidden.
      expect(
        screen.queryByRole("link", { name: "Workspace settings" }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: "API keys" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("reconciling a stale active uuid", () => {
    it("resets to the default workspace when the persisted uuid is unknown", async () => {
      mockActiveUuid = "stale-uuid";
      getActiveOrgUuidMock.mockReturnValue("stale-uuid");
      pickDefaultOrgMock.mockReturnValue(personalOrg);
      render(<WorkspaceSwitcher collapsed={false} />);

      await waitFor(() =>
        expect(setActiveUuidMock).toHaveBeenCalledWith("org-1"),
      );
    });

    it("reloads the section under the new workspace so the page refetches", async () => {
      mockActiveUuid = "stale-uuid";
      // Reads the stale uuid first, then the stored default — as it would
      // once setActiveUuid has written the new choice.
      getActiveOrgUuidMock
        .mockReturnValueOnce("stale-uuid")
        .mockReturnValue("org-1");
      pickDefaultOrgMock.mockReturnValue(personalOrg);
      setLocation("/tools");
      render(<WorkspaceSwitcher collapsed={false} />);

      await waitFor(() => expect(assignMock).toHaveBeenCalledWith("/tools"));
    });

    it("stays put when the new choice could not be stored", async () => {
      // Browser storage is refusing writes, so the uuid never changes.
      // Navigating would load the same stale workspace and navigate again.
      mockActiveUuid = "stale-uuid";
      getActiveOrgUuidMock.mockReturnValue("stale-uuid");
      pickDefaultOrgMock.mockReturnValue(personalOrg);
      setLocation("/tools");
      render(<WorkspaceSwitcher collapsed={false} />);

      await waitFor(() =>
        expect(setActiveUuidMock).toHaveBeenCalledWith("org-1"),
      );
      expect(assignMock).not.toHaveBeenCalled();
      expect(reloadMock).not.toHaveBeenCalled();
    });

    it("does not navigate when no workspace was stored yet", async () => {
      mockActiveUuid = null;
      getActiveOrgUuidMock.mockReturnValue(null);
      pickDefaultOrgMock.mockReturnValue(personalOrg);
      render(<WorkspaceSwitcher collapsed={false} />);

      await waitFor(() =>
        expect(setActiveUuidMock).toHaveBeenCalledWith("org-1"),
      );
      expect(assignMock).not.toHaveBeenCalled();
      expect(reloadMock).not.toHaveBeenCalled();
    });
  });
});
