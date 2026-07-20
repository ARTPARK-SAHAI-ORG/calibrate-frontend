import { render, screen, setupUser } from "@/test-utils";
import { AppLayout } from "@/components/AppLayout";

// WorkspaceSwitcher does its own org fetching; stub it so the shell renders
// without touching the network.
jest.mock("../WorkspaceSwitcher", () => ({
  WorkspaceSwitcher: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid={`workspace-switcher-${collapsed ? "collapsed" : "expanded"}`} />
  ),
}));

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

  it("renders nav items as links to their routes", () => {
    renderLayout();
    const toolsLink = screen.getByText("Tools").closest("a");
    expect(toolsLink).toHaveAttribute("href", "/tools");
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

  it("renders custom header and header actions when provided", () => {
    renderLayout({
      customHeader: <div>Custom header</div>,
      headerActions: <button>Action</button>,
    });
    expect(screen.getByText("Custom header")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Action" })).toBeInTheDocument();
  });
});
