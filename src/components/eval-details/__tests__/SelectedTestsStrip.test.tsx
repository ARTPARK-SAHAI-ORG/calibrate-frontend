import { act } from "react";
import { render, screen, setupUser } from "@/test-utils";
import { SelectedTestsStrip } from "../SelectedTestsStrip";

const TOOLTIP = "The same test ticked under more than one model counts once.";

describe("SelectedTestsStrip", () => {
  it("renders nothing when no tests are selected", () => {
    const { container } = render(
      <SelectedTestsStrip count={0} onRun={jest.fn()} onCompare={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is neither Run nor Compare to offer", () => {
    const { container } = render(<SelectedTestsStrip count={3} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many tests are selected, singular and plural", () => {
    const { rerender } = render(
      <SelectedTestsStrip count={1} onRun={jest.fn()} />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("test selected", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("tests selected", { exact: false })).not.toBeInTheDocument();

    rerender(<SelectedTestsStrip count={3} onRun={jest.fn()} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("tests selected", { exact: false })).toBeInTheDocument();
  });

  it("fires each button's callback", async () => {
    const user = setupUser();
    const onRun = jest.fn();
    const onCompare = jest.fn();
    render(
      <SelectedTestsStrip count={3} onRun={onRun} onCompare={onCompare} />,
    );

    await user.click(screen.getByRole("button", { name: "Run" }));
    await user.click(screen.getByRole("button", { name: "Compare" }));

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onCompare).toHaveBeenCalledTimes(1);
  });

  it("hides Compare when only Run is given", () => {
    render(<SelectedTestsStrip count={1} onRun={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Compare" })).not.toBeInTheDocument();
  });

  it("hides Run when only Compare is given", () => {
    render(<SelectedTestsStrip count={1} onCompare={jest.fn()} />);
    expect(screen.getByRole("button", { name: "Compare" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument();
  });

  it("disables both buttons until the run has been started", async () => {
    const user = setupUser();
    let finish: () => void = () => {};
    const onRun = jest.fn(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render(<SelectedTestsStrip count={2} onRun={onRun} onCompare={jest.fn()} />);

    const run = screen.getByRole("button", { name: "Run" });
    await user.click(run);
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(run).toBeDisabled();
    expect(run).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Compare" })).toBeDisabled();

    await act(async () => finish());
    expect(run).toBeEnabled();
    expect(screen.getByRole("button", { name: "Compare" })).toBeEnabled();
  });

  it("explains the count when more rows are ticked than distinct tests", async () => {
    const user = setupUser();
    render(<SelectedTestsStrip count={2} tickedCount={4} onRun={jest.fn()} />);

    const label = screen.getByText("tests selected", { exact: false });
    expect(label).toHaveClass("cursor-help");
    expect(screen.queryByText(TOOLTIP)).not.toBeInTheDocument();

    await user.hover(label);
    expect(await screen.findByText(TOOLTIP)).toBeInTheDocument();
  });

  it("has no explanation when the ticked rows equal the distinct tests", async () => {
    const user = setupUser();
    render(<SelectedTestsStrip count={2} tickedCount={2} onRun={jest.fn()} />);

    const label = screen.getByText("tests selected", { exact: false });
    expect(label).not.toHaveClass("cursor-help");

    await user.hover(label);
    expect(screen.queryByText(TOOLTIP)).not.toBeInTheDocument();
  });
});
