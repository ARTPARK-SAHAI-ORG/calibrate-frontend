import { act, render, screen, waitFor } from "@/test-utils";
import { useIsNameClipped } from "../useIsNameClipped";

// jsdom reports every width as 0, so a cut-off name is described directly by
// standing in for the two widths the hook compares.
function mockWidths(scroll: number, client: number) {
  const scrollWidth = jest
    .spyOn(HTMLElement.prototype, "scrollWidth", "get")
    .mockReturnValue(scroll);
  const clientWidth = jest
    .spyOn(HTMLElement.prototype, "clientWidth", "get")
    .mockReturnValue(client);
  return () => {
    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  };
}

function Name({ name }: { name: string }) {
  const { ref, clipped } = useIsNameClipped(name);
  return (
    <>
      <span ref={ref} className="truncate">
        {name}
      </span>
      <span data-testid="verdict">{clipped ? "cut off" : "fits"}</span>
    </>
  );
}

const observers: { el: Element; disconnected: boolean }[] = [];
let measure: (() => void) | null = null;

class RecordingResizeObserver {
  constructor(callback: () => void) {
    measure = callback;
  }
  observe(el: Element) {
    observers.push({ el, disconnected: false });
  }
  disconnect() {
    observers.forEach((o) => (o.disconnected = true));
  }
}

const realResizeObserver = global.ResizeObserver;

beforeEach(() => {
  observers.length = 0;
  measure = null;
  (
    global as unknown as { ResizeObserver: typeof RecordingResizeObserver }
  ).ResizeObserver = RecordingResizeObserver;
});

afterEach(() => {
  (global as unknown as { ResizeObserver: unknown }).ResizeObserver =
    realResizeObserver;
});

// The same, for text cut off after a few lines rather than sideways.
function mockHeights(scroll: number, client: number) {
  const scrollHeight = jest
    .spyOn(HTMLElement.prototype, "scrollHeight", "get")
    .mockReturnValue(scroll);
  const clientHeight = jest
    .spyOn(HTMLElement.prototype, "clientHeight", "get")
    .mockReturnValue(client);
  return () => {
    scrollHeight.mockRestore();
    clientHeight.mockRestore();
  };
}

describe("useIsNameClipped", () => {
  it("says text cut off after a few lines is cut off", () => {
    // A cell with line-clamp-4, or one that scrolls inside a fixed height,
    // cuts its text off downwards. Its width never gives that away.
    const restoreW = mockWidths(80, 80);
    const restoreH = mockHeights(300, 96);
    render(<Name name="A long reason that runs past four lines" />);
    expect(screen.getByTestId("verdict")).toHaveTextContent("cut off");
    restoreH();
    restoreW();
  });

  it("says text that fits in its height is not cut off", () => {
    const restoreW = mockWidths(80, 80);
    const restoreH = mockHeights(40, 96);
    render(<Name name="Short reason" />);
    expect(screen.getByTestId("verdict")).toHaveTextContent("fits");
    restoreH();
    restoreW();
  });

  it("says a name that fits is not cut off", () => {
    const restore = mockWidths(80, 80);
    render(<Name name="Correctness" />);
    expect(screen.getByTestId("verdict")).toHaveTextContent("fits");
    restore();
  });

  it("says a name wider than its box is cut off", async () => {
    const restore = mockWidths(300, 80);
    render(<Name name="a very long evaluator name indeed" />);
    await waitFor(() =>
      expect(screen.getByTestId("verdict")).toHaveTextContent("cut off"),
    );
    restore();
  });

  it("watches the element it was given for size changes", async () => {
    const restore = mockWidths(300, 80);
    render(<Name name="a very long evaluator name indeed" />);
    await waitFor(() => expect(observers.length).toBe(1));
    expect(observers[0].el).toBe(
      screen.getByText("a very long evaluator name indeed"),
    );
    restore();
  });

  it("clears the verdict once there is room for the whole name", async () => {
    const restore = mockWidths(300, 80);
    render(<Name name="a very long evaluator name indeed" />);
    await waitFor(() =>
      expect(screen.getByTestId("verdict")).toHaveTextContent("cut off"),
    );
    restore();

    const widened = mockWidths(80, 300);
    act(() => measure!());
    await waitFor(() =>
      expect(screen.getByTestId("verdict")).toHaveTextContent("fits"),
    );
    widened();
  });

  it("measures again when the name itself changes", async () => {
    const restore = mockWidths(80, 80);
    const { rerender } = render(<Name name="Short" />);
    expect(screen.getByTestId("verdict")).toHaveTextContent("fits");
    restore();

    const longer = mockWidths(300, 80);
    rerender(<Name name="a very long evaluator name indeed" />);
    await waitFor(() =>
      expect(screen.getByTestId("verdict")).toHaveTextContent("cut off"),
    );
    longer();
  });

  it("stops watching when the name goes away", async () => {
    const restore = mockWidths(300, 80);
    const { unmount } = render(<Name name="a very long evaluator name" />);
    await waitFor(() => expect(observers.length).toBe(1));
    unmount();
    expect(observers[0].disconnected).toBe(true);
    restore();
  });

  it("still measures once where nothing watches for size changes", async () => {
    (global as unknown as { ResizeObserver: undefined }).ResizeObserver =
      undefined;
    const restore = mockWidths(300, 80);
    render(<Name name="a very long evaluator name indeed" />);
    await waitFor(() =>
      expect(screen.getByTestId("verdict")).toHaveTextContent("cut off"),
    );
    restore();
  });
});
