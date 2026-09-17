import { copyToClipboard } from "../clipboard";

describe("copyToClipboard", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("uses navigator.clipboard.writeText when available", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    await copyToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("falls back to execCommand when clipboard API throws", async () => {
    const writeText = jest.fn().mockRejectedValue(new Error("denied"));
    Object.assign(navigator, { clipboard: { writeText } });
    const execCommand = jest.fn();
    document.execCommand = execCommand as unknown as typeof document.execCommand;

    const appendSpy = jest.spyOn(document.body, "appendChild");
    const removeSpy = jest.spyOn(document.body, "removeChild");

    await copyToClipboard("fallback text");

    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();

    const el = appendSpy.mock.calls[0][0] as HTMLTextAreaElement;
    expect(el.value).toBe("fallback text");
  });

  // Some browsers throw from execCommand rather than answering false.
  it("answers false when the fallback throws", async () => {
    (navigator.clipboard.writeText as jest.Mock).mockRejectedValue(
      new Error("blocked"),
    );
    (document as unknown as { execCommand: () => boolean }).execCommand = () => {
      throw new Error("not allowed");
    };

    await expect(copyToClipboard("hello")).resolves.toBe(false);

    delete (document as unknown as { execCommand?: () => boolean }).execCommand;
  });
});
