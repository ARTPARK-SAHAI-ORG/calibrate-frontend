/**
 * The list of sessions down the left of the Learn page. The one being read has
 * to change as the reader scrolls, otherwise the list is just three links.
 */
import { act, render, screen } from "@/test-utils";
import { LearnTableOfContents } from "../LearnTableOfContents";

const SECTIONS = [
  { id: "one", title: "First session" },
  { id: "two", title: "Second session" },
  { id: "three", title: "Third session" },
];

/**
 * Stands in for the page behind the list: one block per session, each at the
 * distance from the top of the screen given here. jsdom lays nothing out, so
 * the distances are handed over rather than measured.
 */
function placeSections(topsById: Record<string, number>) {
  SECTIONS.forEach((section) => {
    const block = document.createElement("div");
    block.id = section.id;
    block.getBoundingClientRect = () =>
      ({ top: topsById[section.id] }) as DOMRect;
    document.body.appendChild(block);
  });
}

function scroll() {
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

/** The session the list is currently marking as the one being read. */
function markedSession() {
  return screen
    .getAllByRole("link")
    .find((link) => link.getAttribute("aria-current") === "true")?.textContent;
}

describe("LearnTableOfContents", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("marks the first session before any of them is scrolled to", () => {
    placeSections({ one: 400, two: 1200, three: 2000 });
    render(<LearnTableOfContents sections={SECTIONS} />);
    expect(markedSession()).toBe("First session");
  });

  it("moves the mark as the reader scrolls past each session", () => {
    const tops: Record<string, number> = { one: 400, two: 1200, three: 2000 };
    placeSections(tops);
    render(<LearnTableOfContents sections={SECTIONS} />);

    // Far enough that the first session has gone above the reading line.
    Object.assign(tops, { one: 100, two: 900, three: 1700 });
    scroll();
    expect(markedSession()).toBe("First session");

    Object.assign(tops, { one: -700, two: 100, three: 900 });
    scroll();
    expect(markedSession()).toBe("Second session");

    Object.assign(tops, { one: -1500, two: -700, three: 100 });
    scroll();
    expect(markedSession()).toBe("Third session");
  });

  it("links each session to its place on the page", () => {
    placeSections({ one: 400, two: 1200, three: 2000 });
    render(<LearnTableOfContents sections={SECTIONS} />);
    expect(screen.getByRole("link", { name: "Second session" })).toHaveAttribute(
      "href",
      "#two",
    );
  });

  it("renders nothing when there are no sessions", () => {
    const { container } = render(<LearnTableOfContents sections={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stops listening for scrolling once it is gone", () => {
    placeSections({ one: 400, two: 1200, three: 2000 });
    const remove = jest.spyOn(window, "removeEventListener");
    const { unmount } = render(<LearnTableOfContents sections={SECTIONS} />);
    unmount();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function));
    remove.mockRestore();
  });
});
