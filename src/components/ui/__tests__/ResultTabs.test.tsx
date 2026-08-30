import { render, screen, setupUser } from "@/test-utils";
import { ResultTabs } from "../ResultTabs";

describe("ResultTabs", () => {
  it("gives every surface the same name for each tab", () => {
    render(
      <ResultTabs
        tabs={["summary", "leaderboard", "top-picks", "outputs", "about"]}
        activeTab="summary"
        onChange={() => {}}
      />,
    );

    // The tab that used to be called "Outputs" on the shared pages.
    expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Summary" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Leaderboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Model selection" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About" })).toBeInTheDocument();
  });

  it("marks the tab being read and reports a click on another one", async () => {
    const onChange = jest.fn();
    const user = setupUser();
    render(
      <ResultTabs
        tabs={["summary", "outputs"]}
        activeTab="summary"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Summary" }).className).toContain(
      "border-foreground",
    );
    await user.click(screen.getByRole("button", { name: "Results" }));
    expect(onChange).toHaveBeenCalledWith("outputs");
  });

  it("names the buttons for the guided tour when asked to", () => {
    render(
      <ResultTabs
        tabs={["summary", "outputs"]}
        activeTab="summary"
        onChange={() => {}}
        size="window"
        tourPrefix="run-tab"
      />,
    );

    expect(
      document.querySelector('[data-tour="run-tab-outputs"]'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Summary" }).className,
    ).toContain("md:text-base");
  });
});
