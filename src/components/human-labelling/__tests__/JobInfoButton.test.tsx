import { render, screen, setupUser } from "@/test-utils";
import { JobInfoButton } from "../JobInfoButton";

describe("JobInfoButton", () => {
  const onShowHowItWorks = jest.fn();
  beforeEach(() => {
    onShowHowItWorks.mockClear();
    render(
      <JobInfoButton
        labeller="Aman"
        itemCount={9}
        createdAt="2026-11-03 20:00:00"
        onShowHowItWorks={onShowHowItWorks}
      />,
    );
  });

  it("brings the walkthrough back from How this works", async () => {
    await setupUser().click(
      screen.getByRole("button", { name: "How this works" }),
    );
    expect(onShowHowItWorks).toHaveBeenCalledTimes(1);
  });

  it("keeps the box hidden until hovered, tapped or tabbed to", () => {
    expect(screen.getByTestId("job-info-box").className).toMatch(
      /hidden group-hover:block group-focus-within:block/,
    );
  });

  it("holds the labeller, the item count and the date, reading the backend's time as UTC", () => {
    expect(screen.getByText("Labeller")).toBeInTheDocument();
    expect(screen.getByText("Aman")).toBeInTheDocument();
    expect(screen.getByText("Items to label")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Date created")).toBeInTheDocument();
    // 8 pm UTC on the 3rd is already the 4th in India, where the tests run.
    expect(screen.getByText("4 Nov 2026")).toBeInTheDocument();
  });
});
