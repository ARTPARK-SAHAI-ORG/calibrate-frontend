/**
 * The demo on the landing page: it plays in the hero, and the last button on
 * the page plays it in front of the page. Closing it has to take the video off
 * the page, otherwise it keeps playing behind whatever the reader does next.
 */
import { render, screen, setupUser } from "@/test-utils";
import HomePage from "../page";

const DEMO_TITLE = "Calibrate demo";
const EMBED_URL = "https://www.youtube.com/embed/F1oR8QlCnmI";

describe("Landing page demo", () => {
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

  it("plays the demo in the hero", () => {
    render(<HomePage />);
    expect(screen.getAllByTitle(DEMO_TITLE)[0]).toHaveAttribute(
      "src",
      EMBED_URL,
    );
  });

  it("opens the demo in front of the page, and closing it takes the video off", async () => {
    const user = setupUser();
    render(<HomePage />);

    expect(screen.queryByRole("dialog")).toBeNull();

    await user.click(screen.getByRole("button", { name: "See the demo" }));
    const dialog = screen.getByRole("dialog", { name: DEMO_TITLE });
    expect(
      dialog.querySelector<HTMLIFrameElement>("iframe")?.getAttribute("src"),
    ).toBe(`${EMBED_URL}?autoplay=1`);

    await user.click(screen.getByRole("button", { name: "Close the demo" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes the demo on Escape", async () => {
    const user = setupUser();
    render(<HomePage />);

    await user.click(screen.getByRole("button", { name: "See the demo" }));
    expect(screen.getByRole("dialog", { name: DEMO_TITLE })).toBeDefined();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
