import { render, screen, setupUser } from "@/test-utils";
import { UseCasePickerDialog } from "../UseCasePickerDialog";
import { EVALUATOR_USE_CASE_OPTIONS } from "../evaluatorUseCases";

describe("UseCasePickerDialog", () => {
  function setup(initialValue: "llm" | "stt" | null = null) {
    const onCancel = jest.fn();
    const onSelect = jest.fn();
    render(
      <UseCasePickerDialog
        initialValue={initialValue}
        options={EVALUATOR_USE_CASE_OPTIONS}
        onCancel={onCancel}
        onSelect={onSelect}
      />,
    );
    return { onCancel, onSelect };
  }

  it("renders the dialog heading and helper copy", () => {
    setup();
    expect(screen.getByText("What is this evaluator for?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pick the use case so we can set a good default LLM judge model and prompt for you",
      ),
    ).toBeInTheDocument();
  });

  it("renders all use case options", () => {
    setup();
    for (const opt of EVALUATOR_USE_CASE_OPTIONS) {
      expect(screen.getByText(opt.title)).toBeInTheDocument();
    }
  });

  it("hides category headers when only one group is shown", () => {
    const conversationOnly = EVALUATOR_USE_CASE_OPTIONS.filter(
      (option) => option.group === "conversation",
    );
    render(
      <UseCasePickerDialog
        initialValue={null}
        options={conversationOnly}
        onCancel={jest.fn()}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
    expect(screen.getByText("LLM reply")).toBeInTheDocument();
    expect(screen.getByText("Full conversation")).toBeInTheDocument();
  });

  it("shows category headers when multiple groups are shown", () => {
    setup();
    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
  });

  it("Continue button is disabled when nothing is selected", () => {
    setup();
    expect(screen.getByText("Continue")).toBeDisabled();
  });

  it("Continue button is enabled when initialValue is provided", () => {
    setup("llm");
    expect(screen.getByText("Continue")).not.toBeDisabled();
  });

  it("selecting a card enables Continue and calls onSelect with that value on click", async () => {
    const user = setupUser();
    const { onSelect } = setup();
    await user.click(screen.getByText("Speech to Text"));
    expect(screen.getByText("Continue")).not.toBeDisabled();
    await user.click(screen.getByText("Continue"));
    expect(onSelect).toHaveBeenCalledWith("stt");
  });

  it("clicking Continue while nothing is selected does not call onSelect", async () => {
    const user = setupUser();
    const { onSelect } = setup();
    // Force-click via fireEvent won't help since disabled buttons swallow clicks;
    // verify the guard branch by checking onSelect stays uncalled.
    const continueBtn = screen.getByText("Continue");
    await user.click(continueBtn);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking the close (X) button calls onCancel", async () => {
    const user = setupUser();
    const { onCancel } = setup();
    const closeButtons = document.querySelectorAll("button");
    // The X button is the first button rendered (no accessible name), find via svg path
    const xButton = Array.from(closeButtons).find((b) =>
      b.querySelector('path[d="M6 18L18 6M6 6l12 12"]'),
    );
    expect(xButton).toBeTruthy();
    await user.click(xButton as HTMLElement);
    expect(onCancel).toHaveBeenCalled();
  });

  it("clicking Cancel button calls onCancel", async () => {
    const user = setupUser();
    const { onCancel } = setup();
    await user.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });

  it("clicking the backdrop calls onCancel", async () => {
    const user = setupUser();
    const { onCancel } = setup();
    const backdrop = document.querySelector(".fixed.inset-0") as HTMLElement;
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalled();
  });

  it("clicking inside the dialog panel does not call onCancel (stopPropagation)", async () => {
    const user = setupUser();
    const { onCancel } = setup();
    await user.click(screen.getByText("What is this evaluator for?"));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
