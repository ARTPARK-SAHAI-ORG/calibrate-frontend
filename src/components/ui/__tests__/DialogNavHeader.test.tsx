import { render, screen, setupUser } from "@/test-utils";
import { DialogNavHeader, DialogNavRow } from "../DialogNavHeader";

describe("DialogNavHeader", () => {
  it("shows the arrows and where the open item sits in the list", () => {
    render(
      <DialogNavHeader
        noun="trace"
        onPrev={jest.fn()}
        onNext={jest.fn()}
        hasPrev
        hasNext
        position={{ index: 2, total: 12 }}
      />,
    );

    expect(screen.getByText("3 of 12")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous trace")).toBeEnabled();
    expect(screen.getByLabelText("Next trace")).toBeEnabled();
  });

  it("steps back and forward when the arrows are clicked", async () => {
    const user = setupUser();
    const onPrev = jest.fn();
    const onNext = jest.fn();
    render(
      <DialogNavHeader
        noun="item"
        onPrev={onPrev}
        onNext={onNext}
        hasPrev
        hasNext
        position={{ index: 0, total: 3 }}
      />,
    );

    await user.click(screen.getByLabelText("Previous item"));
    await user.click(screen.getByLabelText("Next item"));

    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("turns off the arrow at each end of the list", () => {
    render(
      <DialogNavHeader
        noun="item"
        onPrev={jest.fn()}
        onNext={jest.fn()}
        hasPrev={false}
        hasNext
        position={{ index: 0, total: 3 }}
      />,
    );

    expect(screen.getByLabelText("Previous item")).toBeDisabled();
    expect(screen.getByLabelText("Next item")).toBeEnabled();
  });

  it("draws nothing when there is nothing to step through", () => {
    const { container } = render(
      <DialogNavHeader noun="item" position={{ index: 0, total: 5 }} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when the list holds only the open item", () => {
    const { container } = render(
      <DialogNavHeader
        noun="item"
        onPrev={jest.fn()}
        onNext={jest.fn()}
        position={{ index: 0, total: 1 }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the arrows when no position was given", () => {
    render(<DialogNavHeader noun="item" onNext={jest.fn()} hasNext />);

    expect(screen.getByLabelText("Next item")).toBeEnabled();
    expect(screen.queryByText(/ of /)).not.toBeInTheDocument();
  });
});

describe("DialogNavRow", () => {
  it("puts the arrows and the position in a row of their own", () => {
    render(
      <DialogNavRow
        noun="test"
        onPrev={jest.fn()}
        onNext={jest.fn()}
        hasPrev
        hasNext
        position={{ index: 4, total: 9 }}
      />,
    );

    const row = screen.getByTestId("dialog-nav-row");
    expect(row).toBeInTheDocument();
    expect(row).toHaveTextContent("5 of 9");
    expect(screen.getByLabelText("Previous test")).toBeInTheDocument();
    expect(screen.getByLabelText("Next test")).toBeInTheDocument();
  });

  it("steps back and forward when the arrows are clicked", async () => {
    const user = setupUser();
    const onPrev = jest.fn();
    const onNext = jest.fn();
    render(
      <DialogNavRow
        noun="test"
        onPrev={onPrev}
        onNext={onNext}
        hasPrev
        hasNext
        position={{ index: 1, total: 4 }}
      />,
    );

    await user.click(screen.getByLabelText("Next test"));
    await user.click(screen.getByLabelText("Previous test"));

    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("draws no row at all when there is nothing to step through", () => {
    const { container } = render(
      <DialogNavRow noun="test" position={{ index: 0, total: 6 }} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("dialog-nav-row")).not.toBeInTheDocument();
  });

  it("draws no row when the list holds only the open test", () => {
    // The hand-written row this replaced left an empty bar across the top of
    // the window whenever a single test was open.
    const { container } = render(
      <DialogNavRow
        noun="test"
        onPrev={jest.fn()}
        onNext={jest.fn()}
        hasPrev={false}
        hasNext={false}
        position={{ index: 0, total: 1 }}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("dialog-nav-row")).not.toBeInTheDocument();
  });
});
