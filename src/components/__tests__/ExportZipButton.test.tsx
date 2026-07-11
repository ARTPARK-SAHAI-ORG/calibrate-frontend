import { render, screen, setupUser, waitFor } from "@/test-utils";
import { ExportZipButton } from "../ExportZipButton";

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

import { reportError } from "../../lib/reportError";

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

describe("ExportZipButton", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    (global.fetch as jest.Mock | undefined)?.mockClear?.();
    // @ts-expect-error cleanup test-only global
    delete global.fetch;
  });

  it("renders the default label", () => {
    render(
      <ExportZipButton
        filename="f"
        getContents={() => ({ csv: { columns: [], rows: [] }, files: [] })}
      />,
    );
    expect(screen.getByRole("button", { name: "Export results" })).toBeInTheDocument();
  });

  it("renders a custom label and is disabled via prop", () => {
    render(
      <ExportZipButton
        filename="f"
        getContents={() => ({ csv: { columns: [], rows: [] }, files: [] })}
        label="Download bundle"
        disabled
        className="extra-class"
      />,
    );
    const button = screen.getByRole("button", { name: "Download bundle" });
    expect(button).toBeDisabled();
    expect(button.className).toContain("extra-class");
  });

  it("does nothing when csv rows and files are both empty", async () => {
    const user = setupUser();
    const { createObjectURL } = mockAnchor();
    const getContents = jest
      .fn()
      .mockReturnValue({ csv: { columns: [], rows: [] }, files: [] });
    render(<ExportZipButton filename="f" getContents={getContents} />);

    await user.click(screen.getByRole("button"));
    expect(getContents).toHaveBeenCalledTimes(1);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it("builds a zip with the csv and successfully fetched files, shows exporting state, then downloads", async () => {
    const user = setupUser();
    const { createObjectURL, clickSpy } = mockAnchor();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["audio-bytes"]),
    });

    const getContents = jest.fn().mockReturnValue({
      csv: {
        columns: [
          { key: "name", header: "Name" },
          { key: "score", header: "Score" },
        ],
        rows: [{ name: "Alice, Bob", score: 42 }],
      },
      files: [{ path: "audios/a.mp3", url: "https://example.com/a.mp3" }],
    });

    render(<ExportZipButton filename="bundle" getContents={getContents} />);

    await user.click(screen.getByRole("button"));
    expect(await screen.findByText("Exporting…")).toBeInTheDocument();

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByText("Export results")).toBeInTheDocument(),
    );
  });

  it("records a failed file fetch as an error entry without aborting the export", async () => {
    const user = setupUser();
    const { createObjectURL } = mockAnchor();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => new Blob(["ok-bytes"]),
      });

    const getContents = jest.fn().mockReturnValue({
      csv: { columns: [{ key: "name", header: "Name" }], rows: [{ name: "a" }] },
      files: [
        { path: "audios/missing.mp3", url: "https://example.com/missing.mp3" },
        { path: "audios/ok.mp3", url: "https://example.com/ok.mp3" },
      ],
    });

    render(<ExportZipButton filename="bundle" getContents={getContents} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(reportError).toHaveBeenCalledWith(
      expect.stringContaining("missing.mp3"),
      expect.anything(),
    );
  });

  it("handles a rejected fetch (network error) the same way as a non-ok response", async () => {
    const user = setupUser();
    const { createObjectURL } = mockAnchor();
    global.fetch = jest.fn().mockRejectedValue(new Error("network down"));

    const getContents = jest.fn().mockReturnValue({
      csv: { columns: [], rows: [] },
      files: [{ path: "audios/x.mp3", url: "https://example.com/x.mp3" }],
    });

    render(<ExportZipButton filename="bundle" getContents={getContents} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(reportError).toHaveBeenCalledWith(
      expect.stringContaining("x.mp3"),
      expect.any(Error),
    );
  });

  it("stringifies a non-Error rejection reason in the error file", async () => {
    const user = setupUser();
    const { createObjectURL } = mockAnchor();
    global.fetch = jest.fn().mockRejectedValue("plain string failure");

    const getContents = jest.fn().mockReturnValue({
      csv: { columns: [], rows: [] },
      files: [{ path: "audios/y.mp3", url: "https://example.com/y.mp3" }],
    });

    render(<ExportZipButton filename="bundle" getContents={getContents} />);
    await user.click(screen.getByRole("button"));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(reportError).toHaveBeenCalledWith(
      expect.stringContaining("y.mp3"),
      "plain string failure",
    );
  });
});
