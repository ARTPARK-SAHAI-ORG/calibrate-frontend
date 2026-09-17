import { render, screen, setupUser } from "@/test-utils";
import { ResultTabs } from "../ResultTabs";

describe("ResultTabs", () => {
  it("gives every surface the same name for each tab", () => {
    render(
      <ResultTabs
        tabs={["summary", "leaderboard", "top-picks", "tests", "about"]}
        activeTab="summary"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tests" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Leaderboard" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Model selection" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "About" })).toBeInTheDocument();
  });

  it("keeps calling the speech pages' row-by-row tab Results", () => {
    render(
      <ResultTabs
        tabs={["leaderboard", "outputs"]}
        activeTab="leaderboard"
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument();
  });

  it("marks the tab being read and reports a click on another one", async () => {
    const onChange = jest.fn();
    const user = setupUser();
    render(
      <ResultTabs
        tabs={["summary", "tests"]}
        activeTab="summary"
        onChange={onChange}
      />,
    );

    expect(screen.getByRole("button", { name: "Results" }).className).toContain(
      "border-foreground",
    );
    await user.click(screen.getByRole("button", { name: "Tests" }));
    expect(onChange).toHaveBeenCalledWith("tests");
  });

  it("names the buttons for the guided tour when asked to", () => {
    render(
      <ResultTabs
        tabs={["summary", "tests"]}
        activeTab="summary"
        onChange={() => {}}
        size="window"
        tourPrefix="run-tab"
      />,
    );

    expect(
      document.querySelector('[data-tour="run-tab-tests"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Results" }).className).toContain(
      "md:text-base",
    );
  });
});
