/**
 * The customer cards on the landing page. Each card can point at the story
 * behind it: a post on this site, or one written elsewhere. A card with a
 * story nobody can reach is the failure this guards against.
 */
import { render, screen, within } from "@/test-utils";
import HomePage from "../page";

describe("Customer cards", () => {
  // The logo strip lower down the page asks the browser whether the reader
  // turned animations off, which jsdom does not answer on its own.
  beforeEach(() => {
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      media: "(prefers-reduced-motion: reduce)",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    });
  });

  /** The card under the heading with this name. */
  function card(name: string) {
    return screen.getByRole("heading", { name, level: 3 }).closest("div")!;
  }

  it("sends the ARMMAN card to the case study on this site", () => {
    render(<HomePage />);

    const link = within(card("ARMMAN")).getByRole("link", {
      name: "Read the story",
    });
    expect(link).toHaveAttribute(
      "href",
      "/blog/evaluating-a-form-filling-voice-agent",
    );
    // A post on this site opens where the reader already is.
    expect(link).not.toHaveAttribute("target");
  });

  it("opens a story written elsewhere in a new tab", () => {
    render(<HomePage />);

    const link = within(card("Kabakoo")).getByRole("link", {
      name: "Read the story",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://kabakoo.substack.com/p/the-ai-worked-did-it-work-for-the",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("leaves a card with no story to tell without a link", () => {
    render(<HomePage />);

    expect(
      within(card("Noora Health")).queryByRole("link", {
        name: "Read the story",
      }),
    ).toBeNull();
  });
});
