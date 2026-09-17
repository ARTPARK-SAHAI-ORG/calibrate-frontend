import React from "react";
import { render, screen, setupUser, fireEvent, act } from "../../test-utils";
import { RunFailureBox, RUN_FAILED_SENTENCE } from "../RunFailureBox";
import { copyToClipboard } from "../../lib/clipboard";

jest.mock("../../lib/clipboard", () => ({
  __esModule: true,
  copyToClipboard: jest.fn(),
}));

const copyMock = copyToClipboard as jest.Mock;

describe("RunFailureBox", () => {
  beforeEach(() => {
    copyMock.mockReset();
    copyMock.mockResolvedValue(true);
  });

  it("shows the heading and the default sentence, with no details block", () => {
    render(<RunFailureBox details={null} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(RUN_FAILED_SENTENCE)).toBeInTheDocument();
    expect(
      screen.getByText(
        "The evaluation run failed before it produced any result.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy" }),
    ).not.toBeInTheDocument();
  });

  it("shows what the backend recorded, verbatim, with a Copy button", () => {
    render(<RunFailureBox details={"line one\nline two"} />);
    expect(screen.getByText("Details")).toBeInTheDocument();
    const pre = screen.getByText(
      (_, el) => el?.tagName === "PRE" && el.textContent === "line one\nline two",
    );
    expect(pre).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("copies the details and says Copied for two seconds", async () => {
    // The clock is held still so the two seconds cannot pass on their own.
    jest.useFakeTimers();
    render(<RunFailureBox details="boom" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    });
    expect(copyMock).toHaveBeenCalledWith("boom");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1999);
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    jest.useRealTimers();
  });

  it("keeps saying Copy when the clipboard refused the text", async () => {
    copyMock.mockResolvedValue(false);
    const user = setupUser();
    render(<RunFailureBox details="boom" />);
    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(copyMock).toHaveBeenCalledWith("boom");
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copied" }),
    ).not.toBeInTheDocument();
  });

  it("shows Try again only when there is something to try again", async () => {
    const { unmount } = render(<RunFailureBox details={null} />);
    expect(
      screen.queryByRole("button", { name: "Try again" }),
    ).not.toBeInTheDocument();
    unmount();

    const onTryAgain = jest.fn();
    render(<RunFailureBox details={null} onTryAgain={onTryAgain} />);
    await setupUser().click(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalledTimes(1);
  });

  it("takes a sentence of its own in place of the default", () => {
    render(<RunFailureBox details={null} sentence="It broke after 2 of 5." />);
    expect(screen.getByText("It broke after 2 of 5.")).toBeInTheDocument();
    expect(screen.queryByText(RUN_FAILED_SENTENCE)).not.toBeInTheDocument();
  });
});
