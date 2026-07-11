import { act, render, screen, setupUser, waitFor } from "@/test-utils";
import {
  PublicPageLayout,
  PublicNotFound,
  PublicLoading,
} from "../PublicPageLayout";
import { useAuth } from "../../hooks";

jest.mock("../../hooks", () => ({
  __esModule: true,
  useAuth: jest.fn(),
}));

const mockUseAuth = useAuth as jest.Mock;

function mockMatchMedia(matches: boolean) {
  const listeners: Array<(e: any) => void> = [];
  const mql = {
    matches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: (e: any) => void) => listeners.push(cb),
    removeEventListener: jest.fn(),
    addListener: jest.fn(),
    removeListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
  window.matchMedia = jest.fn().mockReturnValue(mql);
  return { mql, listeners };
}

describe("PublicPageLayout", () => {
  beforeEach(() => {
    localStorage.clear();
    mockMatchMedia(false);
    document.documentElement.classList.remove("light", "dark");
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
  });

  it("renders the Calibrate brand link and children", () => {
    render(
      <PublicPageLayout>
        <div>page content</div>
      </PublicPageLayout>,
    );
    expect(screen.getAllByText("Calibrate").length).toBeGreaterThan(0);
    expect(screen.getByText("page content")).toBeInTheDocument();
  });

  it("renders title and pills when provided", () => {
    render(
      <PublicPageLayout title="Run details" pills={<span>Pill</span>}>
        <div>content</div>
      </PublicPageLayout>,
    );
    expect(screen.getByText("Run details")).toBeInTheDocument();
    expect(screen.getByText("Pill")).toBeInTheDocument();
  });

  it("does not render the title/pills row when neither is provided", () => {
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    expect(screen.queryByText("Run details")).not.toBeInTheDocument();
  });

  it("applies device theme on mount, defaulting to light when system prefers light", async () => {
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    await waitFor(() =>
      expect(document.documentElement.classList.contains("light")).toBe(true),
    );
  });

  it("applies dark theme on mount when saved as dark", async () => {
    localStorage.setItem("theme", "dark");
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
    expect(
      screen.getByLabelText("Switch to light mode"),
    ).toBeInTheDocument();
  });

  it("applies device dark theme when system prefers dark", async () => {
    mockMatchMedia(true);
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    await waitFor(() =>
      expect(document.documentElement.classList.contains("dark")).toBe(true),
    );
  });

  it("toggles the theme on button click and persists to localStorage", async () => {
    const user = setupUser();
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    const toggle = await screen.findByLabelText("Switch to dark mode");
    await user.click(toggle);

    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument();
  });

  it("toggles from dark back to light on a second click", async () => {
    const user = setupUser();
    localStorage.setItem("theme", "dark");
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    const toggle = await screen.findByLabelText("Switch to light mode");
    await user.click(toggle);

    expect(localStorage.getItem("theme")).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
  });

  it("reacts to a system color-scheme change while theme is 'device'", async () => {
    const { listeners } = mockMatchMedia(false);
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    await screen.findByLabelText("Switch to dark mode");

    // Flip the system preference and fire the change listener registered by
    // the component's effect.
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: false });
    const mql = (window.matchMedia as jest.Mock).mock.results[0].value;
    mql.matches = true;
    act(() => {
      listeners.forEach((cb) => cb({ matches: true }));
    });

    await waitFor(() =>
      expect(screen.getByLabelText("Switch to light mode")).toBeInTheDocument(),
    );
  });

  it("ignores system color-scheme changes when a saved theme overrides device", async () => {
    localStorage.setItem("theme", "light");
    const { listeners } = mockMatchMedia(false);
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    await screen.findByLabelText("Switch to dark mode");

    act(() => {
      listeners.forEach((cb) => cb({ matches: true }));
    });

    // Still light because saved theme is "light", not "device".
    expect(screen.getByLabelText("Switch to dark mode")).toBeInTheDocument();
  });

  it('shows "Go to app" link when authenticated', async () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    const link = await screen.findByText("Go to app");
    expect(link.closest("a")).toHaveAttribute("href", "/agents");
  });

  it('shows "Sign in" link when unauthenticated', async () => {
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    const link = await screen.findByText("Sign in");
    expect(link.closest("a")).toHaveAttribute("href", "/login");
  });

  it("shows neither auth link while auth is loading", () => {
    mockUseAuth.mockReturnValue({ isAuthenticated: false, isLoading: true });
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    expect(screen.queryByText("Sign in")).not.toBeInTheDocument();
    expect(screen.queryByText("Go to app")).not.toBeInTheDocument();
  });

  it("applies a custom contentClassName", () => {
    render(
      <PublicPageLayout contentClassName="max-w-3xl">
        <div>content</div>
      </PublicPageLayout>,
    );
    expect(screen.getByText("content").closest("main")).toHaveClass(
      "max-w-3xl",
    );
  });

  it("renders the footer with a link back home", () => {
    render(
      <PublicPageLayout>
        <div>content</div>
      </PublicPageLayout>,
    );
    const homeLinks = screen.getAllByRole("link", { name: "Calibrate" });
    expect(homeLinks.length).toBeGreaterThan(0);
    expect(homeLinks[0]).toHaveAttribute("href", "/");
  });
});

describe("PublicNotFound", () => {
  it("renders the default message", () => {
    render(<PublicNotFound />);
    expect(screen.getByText("This link is not available")).toBeInTheDocument();
  });

  it("renders a custom message", () => {
    render(<PublicNotFound message="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("PublicLoading", () => {
  it("renders a loading spinner", () => {
    const { container } = render(<PublicLoading />);
    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
  });
});
