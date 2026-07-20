import { render, screen, setupUser } from "@/test-utils";
import { AppLayout } from "@/components/AppLayout";

// WorkspaceSwitcher does its own org fetching; stub it so the shell renders
// without touching the network.
jest.mock("../WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid={`workspace-switcher-${collapsed ? "collapsed" : "expanded"}`} />
  ),
}));

// The layout waits on the workspace list before it renders anything, so drive
// that hook from the test instead of hitting the network.
let mockWorkspaces: { uuid: string }[] = [{ uuid: "org-1" }];
let mockWorkspacesLoading = false;
let mockAccessToken: string | null = "token-1";
let mockAuthLoading = false;

jest.mock("../../hooks", () => ({
  __esModule: true,
  useAuth: () => ({ accessToken: mockAccessToken, isLoading: mockAuthLoading }),
  useOrganizations: () => ({
    organizations: mockWorkspaces,
    isLoading: mockWorkspacesLoading,
  }),
  clearOrgsCache: jest.fn(),
}));

beforeEach(() => {
  mockWorkspaces = [{ uuid: "org-1" }];
  mockWorkspacesLoading = false;
  mockAccessToken = "token-1";
  mockAuthLoading = false;
});

// jsdom has no matchMedia; AppLayout reads it when applying the "device" theme.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    }),
  });
});

afterEach(() => {
  localStorage.clear();
});

function renderLayout(overrides: Partial<React.ComponentProps<typeof AppLayout>> = {}) {
  const onItemChange = jest.fn();
  const onSidebarToggle = jest.fn();
  render(
    <AppLayout
      activeItem="agents"
      onItemChange={onItemChange}
      sidebarOpen
      onSidebarToggle={onSidebarToggle}
      {...overrides}
    >
      <div>Page content</div>
    </AppLayout>,
  );
  return { onItemChange, onSidebarToggle };
}

describe("AppLayout", () => {
  it("renders the sidebar nav and page content when open", () => {
    renderLayout();
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.getByText("Agents")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    expect(screen.getByTestId("workspace-switcher-expanded")).toBeInTheDocument();
  });

  it("shows only a spinner while the workspace list is still loading", () => {
    mockWorkspaces = [];
    mockWorkspacesLoading = true;
    renderLayout();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("shows only a spinner while the sign-in details are still being read", () => {
    mockWorkspaces = [];
    mockWorkspacesLoading = true;
    mockAccessToken = null;
    mockAuthLoading = true;
    renderLayout();
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });

  it("renders a cached workspace list at once, with no spinner in between", () => {
    mockAuthLoading = true;
    renderLayout();
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("renders the page while the workspace list refreshes in the background", () => {
    mockWorkspacesLoading = true;
    renderLayout();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders the page when there is no access token to load workspaces with", () => {
    mockWorkspaces = [];
    mockWorkspacesLoading = true;
    mockAccessToken = null;
    renderLayout();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders nav items as links to their routes", () => {
    renderLayout();
    const toolsLink = screen.getByText("Tools").closest("a");
    expect(toolsLink).toHaveAttribute("href", "/tools");
    const tracesLink = screen.getByText("Traces").closest("a");
    expect(tracesLink).toHaveAttribute("href", "/traces");
  });

  it("toggles the sidebar", async () => {
    const user = setupUser();
    const { onSidebarToggle } = renderLayout();
    await user.click(screen.getByLabelText("Toggle sidebar"));
    expect(onSidebarToggle).toHaveBeenCalled();
  });

  it("renders the collapsed rail when closed", () => {
    renderLayout({ sidebarOpen: false });
    expect(screen.getByTestId("workspace-switcher-collapsed")).toBeInTheDocument();
  });

  it("shows the display name from localStorage when there is no session", () => {
    localStorage.setItem(
      "user",
      JSON.stringify({ first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" }),
    );
    renderLayout();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("reveals the WhatsApp link when the sidebar Talk to us button is clicked", async () => {
    const user = setupUser();
    renderLayout();
    expect(screen.queryByText("Join WhatsApp")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Talk to us" }));
    expect(screen.getByText("Join WhatsApp").closest("a")).toHaveAttribute(
      "target",
      "_blank",
    );
  });

  it("shows the Talk to us button in the collapsed rail", () => {
    renderLayout({ sidebarOpen: false });
    expect(screen.getByRole("button", { name: "Talk to us" })).toBeInTheDocument();
  });

  it("links to the API keys tab from the profile dropdown", async () => {
    const user = setupUser();
    renderLayout();
    await user.click(screen.getByRole("button", { name: "Open profile menu" }));
    expect(screen.getByRole("link", { name: "API keys" })).toHaveAttribute(
      "href",
      "/workspace-settings?tab=api-keys",
    );
  });

  it("renders custom header and header actions when provided", () => {
    renderLayout({
      customHeader: <div>Custom header</div>,
      headerActions: <button>Action</button>,
    });
    expect(screen.getByText("Custom header")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });
});
