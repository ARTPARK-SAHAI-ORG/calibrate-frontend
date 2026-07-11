import { render, screen } from "@/test-utils";
import { LandingFooter } from "../LandingFooter";
import { WHATSAPP_INVITE_URL } from "@/constants/links";

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
    expect(screen.getByRole("link", { name: "CLI" })).toHaveAttribute(
      "href",
      `${process.env.NEXT_PUBLIC_DOCS_URL}/cli/overview`,
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
    expect(screen.getByRole("link", { name: "LinkedIn" })).toHaveAttribute(
      "href",
      "https://linkedin.com/company/artpark",
    );
  });

  it("renders the current year in the copyright line", () => {
    render(<LandingFooter />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(`© ${year}`)).toBeInTheDocument();
  });
});
