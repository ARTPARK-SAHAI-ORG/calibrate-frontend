/**
 * Interaction tests for the sidebar WorkspaceSwitcher.
 *
 * The hooks it depends on (`useAccessToken` / `useActiveOrgUuid` /
 * `useOrganizations` from `@/hooks`) are mocked so we drive the component with
 * a fixed workspace list and assert its render + navigation behavior.
 *
 * Switching workspaces is an ordinary in-app navigation to the same section
 * under the new workspace, so the assertions watch `router.push` and the
 * address the component reads comes from `usePathname`.
 */
import { render, screen, setupUser, waitFor, within } from "@/test-utils";
import { WorkspaceSwitcher } from "../WorkspaceSwitcher";
import type { Organization } from "@/lib/orgs";

let mockOrganizations: Organization[] = [];
let mockActiveUuid: string | null = null;
let mockPathname = "/";

const createOrganizationMock = jest.fn();
const setActiveUuidMock = jest.fn();
const pushMock = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "token-1",
  useActiveOrgUuid: () => [mockActiveUuid, setActiveUuidMock],
  useOrganizations: () => ({
    organizations: mockOrganizations,
    createOrganization: createOrganizationMock,
  }),
}));

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock, replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

function makeOrg(overrides: Partial<Organization>): Organization {
  return {
    uuid: "11111111-1111-4111-8111-111111111111",
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
  uuid: "11111111-1111-4111-8111-111111111111",
  name: "Personal",
  is_personal: true,
});
const acmeOrg = makeOrg({
  uuid: "22222222-2222-4222-8222-222222222222",
  name: "Acme Health",
  is_personal: false,
});

const PERSONAL = "11111111-1111-4111-8111-111111111111";
const ACME = "22222222-2222-4222-8222-222222222222";

/** Put the user on a page inside the personal workspace. */
function setLocation(path: string) {
  mockPathname = `/${PERSONAL}${path}`;
}

describe("WorkspaceSwitcher", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: two workspaces, with the personal one open.
    mockOrganizations = [personalOrg, acmeOrg];
    mockActiveUuid = PERSONAL;
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
      ).toHaveAttribute(
        "href",
        `/${PERSONAL}/workspace-settings?tab=admin`,
      );
      expect(screen.getByRole("link", { name: "API keys" })).toHaveAttribute(
        "href",
        `/${PERSONAL}/workspace-settings?tab=api-keys`,
      );
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

      expect(setActiveUuidMock).toHaveBeenCalledWith(ACME);
      expect(pushMock).toHaveBeenCalledWith(`/${ACME}/tools`);
    });

    it("falls back to the agents page for a section without a list page", async () => {
      const user = setupUser();
      setLocation("/datasets/abc-123");
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      await user.click(screen.getByRole("button", { name: /Acme Health/ }));

      expect(pushMock).toHaveBeenCalledWith(`/${ACME}/agents`);
    });

    it("stays on workspace settings when switching from there", async () => {
      const user = setupUser();
      setLocation("/workspace-settings");
      render(<WorkspaceSwitcher collapsed={false} />);

      await user.click(screen.getByRole("button", { name: /Personal/ }));
      await user.click(screen.getByRole("button", { name: /Acme Health/ }));

      expect(setActiveUuidMock).toHaveBeenCalledWith(ACME);
      expect(pushMock).toHaveBeenCalledWith(`/${ACME}/workspace-settings`);
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
      expect(pushMock).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
      );
    });
  });

  describe("creating a workspace", () => {
    it("opens the create dialog and switches to the created workspace", async () => {
      const user = setupUser();
      const created = makeOrg({
        uuid: "33333333-3333-4333-8333-333333333333",
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
      expect(setActiveUuidMock).toHaveBeenCalledWith("33333333-3333-4333-8333-333333333333");
      expect(pushMock).toHaveBeenCalledWith(`/${created.uuid}/agents`);
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
      expect(pushMock).not.toHaveBeenCalled();
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

});
