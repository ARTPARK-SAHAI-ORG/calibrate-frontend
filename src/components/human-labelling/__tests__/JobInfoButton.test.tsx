import { render, screen, setupUser, waitFor } from "@/test-utils";
import { JobInfoButton } from "../JobInfoButton";

describe("JobInfoButton", () => {
  const renderIt = () =>
    render(
      <JobInfoButton
        labeller="Aman"
        itemCount={9}
        createdAt="2026-11-03 20:00:00"
      />,
    );

  it("shows nothing about the job until hovered", () => {
    renderIt();
    expect(screen.queryByText("Aman")).not.toBeInTheDocument();
  });

  it("shows the labeller, the item count and the date on hover, reading the backend's time as UTC", async () => {
    const user = setupUser();
    renderIt();
    await user.hover(screen.getByRole("button", { name: "About this job" }));
    expect(await screen.findByText("Labeller")).toBeInTheDocument();
    expect(screen.getByText("Aman")).toBeInTheDocument();
    expect(screen.getByText("Items to label")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("Date created")).toBeInTheDocument();
    // 8 pm UTC on the 3rd is already the 4th in India, where the tests run.
    expect(screen.getByText("4 Nov 2026")).toBeInTheDocument();
  });

  it("hides again when the pointer leaves", async () => {
    const user = setupUser();
    renderIt();
    const button = screen.getByRole("button", { name: "About this job" });
    await user.hover(button);
    await screen.findByText("Aman");
    await user.unhover(button);
    await waitFor(() =>
      expect(screen.queryByText("Aman")).not.toBeInTheDocument(),
    );
  });
});
