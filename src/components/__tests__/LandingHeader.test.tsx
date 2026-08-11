import { render, screen, setupUser } from "@/test-utils";
import { LandingHeader } from "../LandingHeader";

describe("LandingHeader", () => {
  const originalDocsUrl = process.env.NEXT_PUBLIC_DOCS_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.example.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = originalDocsUrl;
  });

  it("renders the logo without a link by default", () => {
    render(<LandingHeader />);
    expect(screen.getByText("Calibrate")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Calibrate/ }),
    ).not.toBeInTheDocument();
  });

  it("renders the logo as a link to / when showLogoLink is true", () => {
    render(<LandingHeader showLogoLink />);
    const link = screen.getByRole("link", { name: /Calibrate/ });
    expect(link).toHaveAttribute("href", "/");
  });

  it("uses the default talk-to-us href", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("link", { name: "Talk to us" })).toHaveAttribute(
      "href",
      "#join-community",
    );
  });

  it("uses a custom talk-to-us href", () => {
    render(<LandingHeader talkToUsHref="/custom" />);
    expect(screen.getByRole("link", { name: "Talk to us" })).toHaveAttribute(
      "href",
      "/custom",
    );
  });

  it("renders documentation and get started links", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("link", { name: "Documentation" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get started" }),
    ).toHaveAttribute("href", "/login");
  });

  it("does not render a GitHub link", () => {
    render(<LandingHeader />);
    expect(
      screen.queryByRole("link", { name: "GitHub" }),
    ).not.toBeInTheDocument();
  });

  it("toggles the mobile menu with the hamburger button", async () => {
    const user = setupUser();
    render(<LandingHeader />);
    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    // Desktop copy of the nav links is always in the DOM.
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(1);

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    // Mobile menu adds a second copy of each link.
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(2);

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(1);
  });

  it("links case studies, integrations, and open source to their landing sections", () => {
    render(<LandingHeader />);
    expect(
      screen.getByRole("link", { name: "Case studies" }),
    ).toHaveAttribute("href", "/#use-cases");
    expect(
      screen.getByRole("link", { name: "Integrations" }),
    ).toHaveAttribute("href", "/#integrations");
    expect(
      screen.getByRole("link", { name: "Open source" }),
    ).toHaveAttribute("href", "/#open-source");
  });
});
