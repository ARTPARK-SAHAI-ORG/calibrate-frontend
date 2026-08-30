import { render, screen, setupUser, waitFor } from "@/test-utils";
import { StopRunButton } from "../StopRunButton";

describe("StopRunButton", () => {
  it("stops the run when clicked", async () => {
    const onStop = jest.fn();
    const user = setupUser();
    render(<StopRunButton onStop={onStop} />);

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("cannot send a second stop while the first is still going", async () => {
    let finishStop: () => void = () => {};
    const onStop = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishStop = resolve;
        }),
    );
    const user = setupUser();
    render(<StopRunButton onStop={onStop} />);

    await user.click(screen.getByRole("button", { name: "Stop" }));

    const button = await screen.findByRole("button", { name: "Stopping..." });
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onStop).toHaveBeenCalledTimes(1);

    finishStop();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stop" })).toBeEnabled(),
    );
  });
});
