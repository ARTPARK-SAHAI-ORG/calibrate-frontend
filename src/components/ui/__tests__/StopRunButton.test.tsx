import { render, screen, setupUser, waitFor } from "@/test-utils";
import { StopRunButton } from "../StopRunButton";

describe("StopRunButton", () => {
  it("asks before stopping, and stops once the question is answered", async () => {
    const onStop = jest.fn();
    const user = setupUser();
    render(<StopRunButton onStop={onStop} />);

    await user.click(screen.getByRole("button", { name: "Stop" }));
    // Nothing is stopped yet: the question is on screen.
    expect(onStop).not.toHaveBeenCalled();
    expect(screen.getByText("Are you sure you want to stop this run?")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Stop" })[1]);
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it("leaves the run alone when the question is cancelled", async () => {
    const onStop = jest.fn();
    const user = setupUser();
    render(<StopRunButton onStop={onStop} />);

    await user.click(screen.getByRole("button", { name: "Stop" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onStop).not.toHaveBeenCalled();
    expect(screen.queryByText("Are you sure you want to stop this run?")).not.toBeInTheDocument();
  });

  it("names what is being stopped", async () => {
    const user = setupUser();
    render(<StopRunButton onStop={jest.fn()} noun="model comparison" />);

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByText("Are you sure you want to stop this model comparison?")).toBeInTheDocument();
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
    await user.click(screen.getAllByRole("button", { name: "Stop" })[1]);

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
