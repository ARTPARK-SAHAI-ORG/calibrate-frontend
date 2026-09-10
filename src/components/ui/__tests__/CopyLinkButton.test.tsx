import { act, render, screen, setupUser, userEvent, waitFor } from "@/test-utils";
import { CopyLinkButton } from "../CopyLinkButton";

const URL = "https://calibrate.test/invite/abc123";

// A failing test must not leave fake timers on for the next one.
afterEach(() => {
  jest.useRealTimers();
});

describe("CopyLinkButton", () => {
  it("copies the address", async () => {
    const user = setupUser();
    render(<CopyLinkButton value={URL} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    await expect(navigator.clipboard.readText()).resolves.toBe(URL);
  });

  it("says it copied, then goes back to offering the copy", async () => {
    jest.useFakeTimers();
    // setupUser() takes no options, and user-event waits on real time unless
    // it is told how to move the clock, so it is built directly here.
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<CopyLinkButton value={URL} />);

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(
      await screen.findByRole("button", { name: "Copied" }),
    ).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(1500);
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Copy link" }),
      ).toBeInTheDocument(),
    );
  });

  it("uses the words it is given", () => {
    render(<CopyLinkButton value={URL} label="Copy the invite link" />);

    expect(
      screen.getByRole("button", { name: "Copy the invite link" }),
    ).toBeInTheDocument();
  });

  // The control sits inside table rows that open something of their own, so a
  // click on it must not also open the row.
  it("does not let the click reach the row underneath", async () => {
    const onRowClick = jest.fn();
    const user = setupUser();
    render(
      <div onClick={onRowClick}>
        <CopyLinkButton value={URL} />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "Copy link" }));

    expect(onRowClick).not.toHaveBeenCalled();
  });
});
