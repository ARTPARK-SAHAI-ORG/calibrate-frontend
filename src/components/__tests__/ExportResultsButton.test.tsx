import { render, screen, setupUser, waitFor } from "@/test-utils";
import { ExportResultsButton } from "../ExportResultsButton";

function readBlobAsText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function mockAnchor() {
  if (!URL.createObjectURL) (URL as any).createObjectURL = () => "";
  if (!URL.revokeObjectURL) (URL as any).revokeObjectURL = () => {};
  const createObjectURL = jest
    .spyOn(URL, "createObjectURL")
    .mockReturnValue("blob:mock-url");
  const revokeObjectURL = jest
    .spyOn(URL, "revokeObjectURL")
    .mockImplementation(() => {});
  const clickSpy = jest
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  return { createObjectURL, revokeObjectURL, clickSpy };
}

describe("ExportResultsButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it("renders the default label", () => {
    render(<ExportResultsButton filename="f" getRows={() => ({ columns: [], rows: [] })} />);
    expect(screen.getByRole("button", { name: "Export results" })).toBeInTheDocument();
  });

  it("renders a custom label and applies the neutral variant class", () => {
    render(
      <ExportResultsButton
        filename="f"
        getRows={() => ({ columns: [], rows: [] })}
        label="Custom label"
        variant="neutral"
        className="extra-class"
      />,
    );
    const button = screen.getByRole("button", { name: "Custom label" });
    expect(button.className).toContain("slate-500");
    expect(button.className).toContain("extra-class");
  });

  it("is disabled when the disabled prop is true", () => {
    render(
      <ExportResultsButton
        filename="f"
        getRows={() => ({ columns: [], rows: [] })}
        disabled
      />,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("does nothing when getRows returns empty rows (sync)", async () => {
    const user = setupUser();
    const { createObjectURL } = mockAnchor();
    const getRows = jest.fn().mockReturnValue({ columns: [], rows: [] });
    render(<ExportResultsButton filename="f" getRows={getRows} />);

    await user.click(screen.getByRole("button"));
    expect(getRows).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("builds and downloads a CSV, escaping commas/quotes/newlines/formulas", async () => {
    const user = setupUser();
    const { createObjectURL, clickSpy } = mockAnchor();
    const getRows = jest.fn().mockReturnValue({
      columns: [
        { key: "name", header: "Name" },
        { key: "note", header: "Note" },
      ],
      rows: [
        { name: "Alice, Bob", note: 'Says "hi"' },
        { name: "=SUM(A1)", note: "line1\nline2" },
        { name: null, note: { nested: true } },
        { name: 42, note: true },
      ],
    });
    render(<ExportResultsButton filename="report" getRows={getRows} />);

    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const text = await readBlobAsText(blob);
    expect(text).toContain('"Alice, Bob"');
    expect(text).toContain('"Says ""hi"""');
    expect(text).toContain("'=SUM(A1)");
    expect(text).toContain('"line1\nline2"');
    expect(text).toContain('""nested"":true');
    expect(text).toContain("42,true");
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("awaits an async getRows and shows the busy/spinner state while pending", async () => {
    const user = setupUser();
    mockAnchor();
    let resolvePromise: (value: { columns: []; rows: [] }) => void = () => {};
    const getRows = jest.fn().mockReturnValue(
      new Promise<{ columns: never[]; rows: never[] }>((resolve) => {
        resolvePromise = resolve;
      }),
    );
    render(<ExportResultsButton filename="f" getRows={getRows} />);

    await user.click(screen.getByRole("button"));
    expect(screen.getByText("Preparing…")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeDisabled();

    resolvePromise({ columns: [], rows: [] });
    await waitFor(() =>
      expect(screen.getByText("Export results")).toBeInTheDocument(),
    );
  });

});
