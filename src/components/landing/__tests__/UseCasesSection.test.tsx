import { fireEvent, render, screen, setupUser, within } from "@/test-utils";
import { UseCasesSection } from "../UseCasesSection";

function setReducedMotion(matches: boolean) {
  window.matchMedia = jest.fn().mockReturnValue({
    matches,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  });
}

/** The partners a screen reader is told about, in order. */
function partners() {
  return screen
    .getAllByRole("heading", { level: 3 })
    .map((heading) => heading.textContent);
}

function loopCopies(container: HTMLElement) {
  return container.querySelectorAll('[aria-hidden="true"].flex-col');
}

describe("UseCasesSection", () => {
  beforeEach(() => setReducedMotion(false));

  it("opens on All with every partner once, and a hidden second copy for the loop", () => {
    const { container } = render(<UseCasesSection />);

    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(partners()).toEqual([
      "Kabakoo",
      "Noora Health",
      "ARMMAN",
      "Raising The Village",
      "Maisha Meds",
    ]);
    expect(container.querySelector(".use-cases-marquee-track")).not.toBeNull();
    expect(loopCopies(container)).toHaveLength(5);
  });

  it("keeps the Tab key out of the second copy without stopping its links working", () => {
    const { container } = render(<UseCasesSection />);

    const copies = Array.from(loopCopies(container));
    const copyLinks = copies.flatMap((copy) =>
      Array.from(copy.querySelectorAll("a")),
    );
    // Kabakoo, ARMMAN and Raising The Village have stories, Noora Health a link.
    expect(copyLinks).toHaveLength(4);
    copyLinks.forEach((link) => {
      expect(link).toHaveAttribute("tabindex", "-1");
      expect(link).toHaveAttribute("href");
    });

    const realCard = screen
      .getByRole("heading", { name: "Kabakoo", level: 3 })
      .closest("div")!;
    expect(within(realCard).getByRole("link")).not.toHaveAttribute("tabindex");
  });

  it.each([
    ["Health", ["Noora Health", "ARMMAN", "Maisha Meds"]],
    ["Education", ["Kabakoo"]],
    ["Livelihoods", ["Kabakoo", "Raising The Village"]],
    ["Agriculture", ["Raising The Village"]],
  ])("shows only the %s partners and stops the row", async (domain, names) => {
    const user = setupUser();
    const { container } = render(<UseCasesSection />);

    await user.click(screen.getByRole("button", { name: domain }));

    expect(screen.getByRole("button", { name: domain })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(partners()).toEqual(names);
    expect(container.querySelector(".use-cases-marquee-track")).toBeNull();
    expect(loopCopies(container)).toHaveLength(0);
  });

  it("starts the loop again when All is picked after a domain", async () => {
    const user = setupUser();
    const { container } = render(<UseCasesSection />);

    await user.click(screen.getByRole("button", { name: "Health" }));
    await user.click(screen.getByRole("button", { name: "All" }));

    expect(partners()).toHaveLength(5);
    expect(container.querySelector(".use-cases-marquee-track")).not.toBeNull();
  });

  it("leaves the row still, with no second copy, when animations are turned off", () => {
    setReducedMotion(true);
    const { container } = render(<UseCasesSection />);

    expect(partners()).toHaveLength(5);
    expect(container.querySelector(".use-cases-marquee-track")).toBeNull();
    expect(loopCopies(container)).toHaveLength(0);
  });

  it("scrolls the row back after a link inside it loses keyboard focus", () => {
    const { container } = render(<UseCasesSection />);
    const row = container.querySelector<HTMLElement>(".use-cases-marquee")!;
    row.scrollTo = jest.fn();

    fireEvent.blur(screen.getAllByRole("link")[0]);

    expect(row.scrollTo).toHaveBeenCalledWith({ left: 0 });
  });

  describe("the arrow buttons", () => {
    /** jsdom has no animations, so the track is handed a fake one. */
    function renderWithAnimation(currentTime: number) {
      const animation = { currentTime };
      const { container } = render(<UseCasesSection />);
      const track = container.querySelector(".use-cases-marquee-track")!;
      track.getAnimations = () => [animation as unknown as Animation];
      return animation;
    }

    it("moves the row forward by one card", async () => {
      const user = setupUser();
      const animation = renderWithAnimation(5000);

      await user.click(
        screen.getByRole("button", { name: "Show the next partner" }),
      );

      expect(animation.currentTime).toBe(17000);
    });

    it("moves the row back by one card", async () => {
      const user = setupUser();
      const animation = renderWithAnimation(20000);

      await user.click(
        screen.getByRole("button", { name: "Show the previous partner" }),
      );

      expect(animation.currentTime).toBe(8000);
    });

    it("carries round to the end of the loop when moved back past the start", async () => {
      const user = setupUser();
      const animation = renderWithAnimation(5000);

      await user.click(
        screen.getByRole("button", { name: "Show the previous partner" }),
      );

      expect(animation.currentTime).toBe(53000);
    });

    it("does nothing when animations do not run, and the click does not break", async () => {
      const user = setupUser();
      const { container } = render(<UseCasesSection />);
      const track = container.querySelector(".use-cases-marquee-track")!;
      track.getAnimations = () => [];

      await user.click(
        screen.getByRole("button", { name: "Show the next partner" }),
      );

      expect(partners()).toHaveLength(5);
    });

    it("goes away with the loop when a domain is picked", async () => {
      const user = setupUser();
      render(<UseCasesSection />);

      await user.click(screen.getByRole("button", { name: "Health" }));

      expect(
        screen.queryByRole("button", { name: "Show the next partner" }),
      ).toBeNull();
    });
  });
});
