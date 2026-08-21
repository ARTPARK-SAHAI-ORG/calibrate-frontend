import { render, screen, setupUser } from "@/test-utils";
import { AgentDefaultsPromptDialog } from "../AgentDefaultsPromptDialog";

describe("AgentDefaultsPromptDialog", () => {
  const evaluators = [{ uuid: "ev-1", name: "Persona Adherence" }];

  it("shows a visible error alert and Try again after a failed save", async () => {
    const user = setupUser();
    const onConfirm = jest.fn();

    render(
      <AgentDefaultsPromptDialog
        evaluators={evaluators}
        isSaving={false}
        error="Network error"
        onDismiss={jest.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not attach the evaluator",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Network error");
    expect(screen.getByRole("alert")).toHaveTextContent("Your test was saved");

    const retry = screen.getByRole("button", { name: "Try again" });
    await user.click(retry);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows Attach as the primary action when there is no error", () => {
    render(
      <AgentDefaultsPromptDialog
        evaluators={evaluators}
        isSaving={false}
        error={null}
        onDismiss={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Attach" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses plural copy for multiple evaluators", () => {
    render(
      <AgentDefaultsPromptDialog
        evaluators={[
          { uuid: "ev-1", name: "Persona Adherence" },
          { uuid: "ev-2", name: "Tone check" },
        ]}
        isSaving={false}
        error={null}
        onDismiss={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

    expect(
      screen.getByText(/evaluators that are not yet attached to this agent/),
    ).toBeInTheDocument();
    expect(screen.getByText("Persona Adherence")).toBeInTheDocument();
    expect(screen.getByText("Tone check")).toBeInTheDocument();
  });

  it("calls onDismiss from Not now and shows Attaching while saving", async () => {
    const user = setupUser();
    const onDismiss = jest.fn();

    const { rerender } = render(
      <AgentDefaultsPromptDialog
        evaluators={evaluators}
        isSaving={false}
        error={null}
        onDismiss={onDismiss}
        onConfirm={jest.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);

    rerender(
      <AgentDefaultsPromptDialog
        evaluators={evaluators}
        isSaving
        error={null}
        onDismiss={onDismiss}
        onConfirm={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Attaching..." }),
    ).toBeDisabled();
  });
});
