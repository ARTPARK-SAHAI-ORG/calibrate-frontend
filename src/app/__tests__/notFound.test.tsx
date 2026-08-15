/**
 * The screen for an address that matches no page at all. It must not show a
 * number, and its button must leave for the home page.
 */
import { render, screen, setupUser } from "@/test-utils";
import NotFound from "../not-found";

jest.mock("next/navigation", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), prefetch: jest.fn() }),
  usePathname: () => "/nope",
  useSearchParams: () => new URLSearchParams(),
}));

describe("NotFound", () => {
  it("says the page is not available, with no code on screen", () => {
    render(<NotFound />);
    expect(screen.getByText("This page is not available")).toBeInTheDocument();
    expect(screen.queryByText("404")).not.toBeInTheDocument();
  });

  it("leaves for the home page", async () => {
    const assign = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign },
    });
    const user = setupUser();
    render(<NotFound />);
    await user.click(screen.getByRole("button", { name: "Go to home" }));
    expect(assign).toHaveBeenCalledWith("/agents");
  });
});
