import { render, screen } from "@/test-utils";
import { WhyCalibrateSection } from "../WhyCalibrateSection";

/**
 * The wording in this section changes constantly, so these tests deliberately
 * do NOT assert on copy. They hold the shape of the argument and the rules the
 * copy has to obey. If you are here because a test broke after an edit, the
 * question to ask is whether the shape changed, not whether a sentence did.
 */
describe("WhyCalibrateSection", () => {
  const groups = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>(".flex-wrap"));

  it("runs the argument in three beats", () => {
    const { container } = render(<WhyCalibrateSection />);

    // A section title, two named groups of problems, then the closing title
    // over the goals.
    expect(container.querySelectorAll("h2")).toHaveLength(2);
    expect(container.querySelectorAll("h3")).toHaveLength(2);
    expect(groups(container)).toHaveLength(3);
    for (const heading of container.querySelectorAll("h2, h3")) {
      expect(heading.textContent?.trim()).toBeTruthy();
    }
  });

  it("opens with a lead-in under the section title", () => {
    const { container } = render(<WhyCalibrateSection />);

    const intro = container.querySelector("h2 + p");
    expect(intro?.textContent?.length).toBeGreaterThan(40);
  });

  it("gives every point a picture, a title and a line of its own", () => {
    const { container } = render(<WhyCalibrateSection />);

    for (const group of groups(container)) {
      expect(group.children.length).toBeGreaterThan(0);
      for (const card of group.children) {
        expect(card.querySelector("svg")).toBeInTheDocument();
        expect(card.querySelector("h4")?.textContent?.trim()).toBeTruthy();
        expect(card.querySelector("p")?.textContent?.trim()).toBeTruthy();
      }
    }
  });

  it("labels every picture, because a shape alone says nothing", () => {
    const { container } = render(<WhyCalibrateSection />);

    for (const svg of container.querySelectorAll("svg")) {
      expect(svg.querySelectorAll("text").length).toBeGreaterThan(0);
    }
  });

  it("leaves self-hosting and pricing to the open source section", () => {
    render(<WhyCalibrateSection />);

    expect(screen.queryByText(/self-host/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/open source/i)).not.toBeInTheDocument();
  });

  it("offers both sessions, why it matters before how Calibrate does it", () => {
    const { container } = render(<WhyCalibrateSection />);

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(hrefs).toEqual([
      "/learn#workshop-for-leaders",
      "/learn#getting-started",
    ]);
  });
});
