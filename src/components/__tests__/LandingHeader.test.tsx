import { render, screen } from "@/test-utils";
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

  it("renders documentation, github, and get started links", () => {
    render(<LandingHeader />);
    expect(screen.getByRole("link", { name: "Documentation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "GitHub" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Get started" }),
    ).toHaveAttribute("href", "/login");
  });
});
