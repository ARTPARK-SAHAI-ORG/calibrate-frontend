import { render, screen } from "@/test-utils";
import { LandingFooter } from "../LandingFooter";
import { WEBINARS_URL, WHATSAPP_INVITE_URL } from "@/constants/links";

describe("LandingFooter", () => {
  const originalDocsUrl = process.env.NEXT_PUBLIC_DOCS_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = "https://docs.example.com";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_DOCS_URL = originalDocsUrl;
  });

  it("renders resource links", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: "Documentation" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "CLI" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Learn" })).toHaveAttribute(
      "href",
      "/learn",
    );
    expect(screen.getByRole("link", { name: "Blog" })).toHaveAttribute(
      "href",
      "/blog",
    );
    expect(screen.getByRole("link", { name: "Changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
      "href",
      "https://docs.google.com/document/d/e/2PACX-1vScdz5QUGyo_q4fBSAymagmoi55K8Ss77t2AcnsDYriYXp0LyM8GQ1Pnj3EDjrCUg/pub",
    );
    expect(screen.getByRole("link", { name: "Terms of Service" })).toHaveAttribute(
      "href",
      "https://docs.google.com/document/d/e/2PACX-1vR6h4w6CrrucGhf1LKrQZGQx6IzmoOTYgAlOvqFuaObeDtStMy5UC0kNT8z2efNEQ/pub",
    );
  });

  it("renders community links", () => {
    render(<LandingFooter />);
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute(
      "href",
      WHATSAPP_INVITE_URL,
    );
    expect(
      screen.getByRole("link", { name: "Webinars on AI evaluation" }),
    ).toHaveAttribute("href", WEBINARS_URL);
    expect(
      screen.queryByRole("link", { name: "LinkedIn" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the resources anchor for links written before the Learn page", () => {
    const { container } = render(<LandingFooter />);
    expect(container.querySelector("footer")).toHaveAttribute(
      "id",
      "resources",
    );
  });

  it("renders the current year in the copyright line", () => {
    render(<LandingFooter />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(`© ${year}`)).toBeInTheDocument();
  });
});
