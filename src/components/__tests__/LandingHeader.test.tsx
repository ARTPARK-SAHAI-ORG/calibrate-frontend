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

  // The logo's name comes from its image alt plus the wordmark, so anchoring on
  // "Calibrate Logo" keeps these from also matching the "Why Calibrate?" link.
  const logoName = /^Calibrate Logo/;

  it("renders the logo without a link by default", () => {
    render(<LandingHeader />);
    expect(screen.getByText("Calibrate")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: logoName }),
    ).not.toBeInTheDocument();
  });

  it("renders the logo as a link to / when showLogoLink is true", () => {
    render(<LandingHeader showLogoLink />);
    const link = screen.getByRole("link", { name: logoName });
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

  it("renders learn and get started links", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("link", { name: "Learn" })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute(
      "href",
      "/login",
    );
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
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(
      1,
    );

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    // Mobile menu adds a second copy of each link.
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(
      2,
    );

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getAllByRole("link", { name: "Open source" })).toHaveLength(
      1,
    );
  });

  it("links why calibrate, how it works, partners, and open source to their landing sections", () => {
    render(<LandingHeader />);
    expect(
      screen.getByRole("link", { name: "Why Calibrate?" }),
    ).toHaveAttribute("href", "/#why-calibrate");
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "/#how-it-works",
    );
    expect(screen.getByRole("link", { name: "Partners" })).toHaveAttribute(
      "href",
      "/#use-cases",
    );
    expect(
      screen.queryByRole("link", { name: "Integrations" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open source" })).toHaveAttribute(
      "href",
      "/#open-source",
    );
    // The link carries a "New" pill, so its name is the label plus the pill.
    expect(
      screen.getByRole("link", { name: "Use with AI tools New" }),
    ).toHaveAttribute("href", "/#coding-agents");
  });

  it("shows open source as a green pill", () => {
    render(<LandingHeader />);
    const label = screen
      .getByRole("link", { name: "Open source" })
      .querySelector("span");
    expect(label).toHaveTextContent("Open source");
    expect(label?.className).toContain("bg-emerald-50/90");
  });
});
