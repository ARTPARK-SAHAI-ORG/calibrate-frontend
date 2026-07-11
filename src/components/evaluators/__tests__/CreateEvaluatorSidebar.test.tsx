import React from "react";
import { render, screen, setupUser, fireEvent } from "@/test-utils";
import { CreateEvaluatorSidebar } from "../CreateEvaluatorSidebar";
import type { LLMModel } from "@/components/agent-tabs/constants/providers";

jest.mock("../RatingScaleEditor", () => ({
  RatingScaleEditor: ({ rows, onChange, description }: any) => (
    <div data-testid="rating-scale-editor">
      <span>{description}</span>
      <span>rows:{rows.length}</span>
      <button onClick={() => onChange([...rows, { value: 1, name: "New", description: "" }])}>
        add-rating-row
      </button>
    </div>
  ),
}));

jest.mock("../BinaryScaleEditor", () => ({
  BinaryScaleEditor: ({ rows, onChange }: any) => (
    <div data-testid="binary-scale-editor">
      <span>rows:{rows.length}</span>
      <button
        onClick={() =>
          onChange(rows.map((r: any, i: number) => (i === 0 ? { ...r, name: "Pass" } : r)))
        }
      >
        edit-binary-row
      </button>
    </div>
  ),
}));

const judgeModel: LLMModel = {
  id: "gpt-4",
  name: "GPT-4",
} as LLMModel;

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof CreateEvaluatorSidebar>> = {}
) {
  const onClose = jest.fn();
  const onOpenUseCasePicker = jest.fn();
  const onOpenModelPicker = jest.fn();
  const onCreate = jest.fn();
  const setEvaluatorName = jest.fn();
  const setEvaluatorDescription = jest.fn();
  const setEvaluatorOutputType = jest.fn();
  const setEvaluatorScale = jest.fn();
  const setEvaluatorBinaryScale = jest.fn();
  const setSystemPrompt = jest.fn();
  const setVariableDescriptions = jest.fn();
  const setCreateNameError = jest.fn();
  const isNameDuplicate = jest.fn(() => false);

  const props: React.ComponentProps<typeof CreateEvaluatorSidebar> = {
    isOpen: true,
    evaluatorName: "",
    evaluatorDescription: "",
    evaluatorType: null,
    evaluatorOutputType: "binary",
    evaluatorScale: [],
    evaluatorBinaryScale: [
      { value: true, name: "", description: "" },
      { value: false, name: "", description: "" },
    ],
    judgeModel: null,
    systemPrompt: "",
    detectedPromptVariables: [],
    variableDescriptions: {},
    variablesSupported: true,
    validationAttempted: false,
    createNameError: null,
    createError: null,
    isCreating: false,
    isNameDuplicate,
    onClose,
    onOpenUseCasePicker,
    onOpenModelPicker,
    onCreate,
    setEvaluatorName,
    setEvaluatorDescription,
    setEvaluatorOutputType,
    setEvaluatorScale,
    setEvaluatorBinaryScale,
    setSystemPrompt,
    setVariableDescriptions,
    setCreateNameError,
    ...overrides,
  };

  const utils = render(<CreateEvaluatorSidebar {...props} />);
  return {
    ...utils,
    onClose,
    onOpenUseCasePicker,
    onOpenModelPicker,
    onCreate,
    setEvaluatorName,
    setEvaluatorDescription,
    setEvaluatorOutputType,
    setEvaluatorScale,
    setEvaluatorBinaryScale,
    setSystemPrompt,
    setVariableDescriptions,
    setCreateNameError,
    isNameDuplicate,
    props,
  };
}

describe("CreateEvaluatorSidebar", () => {
  it("renders nothing when closed", () => {
    const { container } = renderComponent({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the header and calls onClose from the X button and the backdrop", async () => {
    const user = setupUser();
    const { container, onClose } = renderComponent();
    expect(screen.getByText("Add evaluator")).toBeInTheDocument();

    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find(
      (b) => b.querySelector("path")?.getAttribute("d") === "M6 18L18 6M6 6l12 12"
    ) as HTMLButtonElement;
    await user.click(xButton);
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector(".backdrop-blur-sm") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("updates the name and clears the create-name error on change", async () => {
    const user = setupUser();
    const { setEvaluatorName, setCreateNameError } = renderComponent({
      createNameError: "taken",
    });
    const nameInput = screen.getByPlaceholderText("e.g., Follows Refund Policy");
    await user.type(nameInput, "X");
    expect(setEvaluatorName).toHaveBeenCalledWith("X");
    expect(setCreateNameError).toHaveBeenCalledWith(null);
  });

  it("shows a duplicate-name error message once validation has been attempted", () => {
    renderComponent({
      validationAttempted: true,
      evaluatorName: "Dup",
      isNameDuplicate: jest.fn(() => true),
    });
    expect(
      screen.getByText("An evaluator with this name already exists")
    ).toBeInTheDocument();
  });

  it("does not show the duplicate-name error before validation is attempted", () => {
    renderComponent({
      validationAttempted: false,
      evaluatorName: "Dup",
      isNameDuplicate: jest.fn(() => true),
    });
    expect(
      screen.queryByText("An evaluator with this name already exists")
    ).not.toBeInTheDocument();
  });

  it("shows the createNameError message", () => {
    renderComponent({ createNameError: "Name is reserved" });
    expect(screen.getByText("Name is reserved")).toBeInTheDocument();
  });

  it("updates the description", async () => {
    const user = setupUser();
    const { setEvaluatorDescription } = renderComponent();
    const descInput = screen.getByPlaceholderText("One-line summary shown in the list");
    await user.type(descInput, "d");
    expect(setEvaluatorDescription).toHaveBeenCalledWith("d");
  });

  it("hides the use-case block when evaluatorType is null and shows it otherwise", () => {
    const { rerender } = renderComponent({ evaluatorType: null });
    expect(screen.queryByText("Use case")).not.toBeInTheDocument();

    rerender(
      <CreateEvaluatorSidebar
        {...({
          isOpen: true,
          evaluatorName: "",
          evaluatorDescription: "",
          evaluatorType: "llm",
          evaluatorOutputType: "binary",
          evaluatorScale: [],
          evaluatorBinaryScale: [],
          judgeModel: null,
          systemPrompt: "",
          detectedPromptVariables: [],
          variableDescriptions: {},
          variablesSupported: true,
          validationAttempted: false,
          createNameError: null,
          createError: null,
          isCreating: false,
          isNameDuplicate: () => false,
          onClose: jest.fn(),
          onOpenUseCasePicker: jest.fn(),
          onOpenModelPicker: jest.fn(),
          onCreate: jest.fn(),
          setEvaluatorName: jest.fn(),
          setEvaluatorDescription: jest.fn(),
          setEvaluatorOutputType: jest.fn(),
          setEvaluatorScale: jest.fn(),
          setEvaluatorBinaryScale: jest.fn(),
          setSystemPrompt: jest.fn(),
          setVariableDescriptions: jest.fn(),
          setCreateNameError: jest.fn(),
        } as React.ComponentProps<typeof CreateEvaluatorSidebar>)}
      />
    );
    expect(screen.getByText("Use case")).toBeInTheDocument();
    expect(screen.getByText("LLM reply")).toBeInTheDocument();
    expect(
      screen.getByText("Evaluate the agent's next reply in a conversation")
    ).toBeInTheDocument();
  });

  it("calls onOpenUseCasePicker when Change is clicked", async () => {
    const user = setupUser();
    const { onOpenUseCasePicker } = renderComponent({ evaluatorType: "tts" });
    await user.click(screen.getByText("Change"));
    expect(onOpenUseCasePicker).toHaveBeenCalled();
  });

  it("switches output type and shows the corresponding editor and copy", async () => {
    const user = setupUser();
    const { setEvaluatorOutputType, rerender } = renderComponent({
      evaluatorOutputType: "binary",
    });
    expect(screen.getByTestId("binary-scale-editor")).toBeInTheDocument();
    expect(
      screen.getByText("Returns a pass/fail judgement for each evaluation.")
    ).toBeInTheDocument();

    await user.click(screen.getByText("rating"));
    expect(setEvaluatorOutputType).toHaveBeenCalledWith("rating");

    rerender(
      <CreateEvaluatorSidebar
        {...({
          isOpen: true,
          evaluatorName: "",
          evaluatorDescription: "",
          evaluatorType: null,
          evaluatorOutputType: "rating",
          evaluatorScale: [{ value: 1, name: "Low", description: "" }],
          evaluatorBinaryScale: [],
          judgeModel: null,
          systemPrompt: "",
          detectedPromptVariables: [],
          variableDescriptions: {},
          variablesSupported: true,
          validationAttempted: false,
          createNameError: null,
          createError: null,
          isCreating: false,
          isNameDuplicate: () => false,
          onClose: jest.fn(),
          onOpenUseCasePicker: jest.fn(),
          onOpenModelPicker: jest.fn(),
          onCreate: jest.fn(),
          setEvaluatorName: jest.fn(),
          setEvaluatorDescription: jest.fn(),
          setEvaluatorOutputType,
          setEvaluatorScale: jest.fn(),
          setEvaluatorBinaryScale: jest.fn(),
          setSystemPrompt: jest.fn(),
          setVariableDescriptions: jest.fn(),
          setCreateNameError: jest.fn(),
        } as React.ComponentProps<typeof CreateEvaluatorSidebar>)}
      />
    );
    expect(screen.getByTestId("rating-scale-editor")).toBeInTheDocument();
    expect(
      screen.getByText("Returns a score on a custom rating scale you define below.")
    ).toBeInTheDocument();
  });

  it("forwards rating scale edits via onChange", async () => {
    const user = setupUser();
    const { setEvaluatorScale } = renderComponent({
      evaluatorOutputType: "rating",
      evaluatorScale: [{ value: 1, name: "Low", description: "" }],
    });
    await user.click(screen.getByText("add-rating-row"));
    expect(setEvaluatorScale).toHaveBeenCalledWith([
      { value: 1, name: "Low", description: "" },
      { value: 1, name: "New", description: "" },
    ]);
  });

  it("forwards binary scale edits via onChange", async () => {
    const user = setupUser();
    const { setEvaluatorBinaryScale } = renderComponent({
      evaluatorOutputType: "binary",
    });
    await user.click(screen.getByText("edit-binary-row"));
    expect(setEvaluatorBinaryScale).toHaveBeenCalledWith([
      { value: true, name: "Pass", description: "" },
      { value: false, name: "", description: "" },
    ]);
  });

  it("shows the placeholder and opens the model picker", async () => {
    const user = setupUser();
    const { onOpenModelPicker } = renderComponent();
    expect(screen.getByText("Select judge model")).toBeInTheDocument();
    await user.click(screen.getByText("Select judge model"));
    expect(onOpenModelPicker).toHaveBeenCalled();
  });

  it("shows the judge model name once selected", () => {
    renderComponent({ judgeModel });
    expect(screen.getByText("GPT-4")).toBeInTheDocument();
  });

  it("shows a red border on the judge model button when validation fails", () => {
    renderComponent({ validationAttempted: true, judgeModel: null });
    const button = screen.getByText("Select judge model").closest("button");
    expect(button?.className).toContain("border-red-500");
  });

  it("updates the system prompt", async () => {
    const user = setupUser();
    const { setSystemPrompt } = renderComponent();
    const textarea = screen.getByPlaceholderText(/Describe how the judge should grade/);
    await user.type(textarea, "g");
    expect(setSystemPrompt).toHaveBeenCalledWith("g");
  });

  it("uses variable-aware placeholder text when variablesSupported is true", () => {
    renderComponent({ variablesSupported: true });
    expect(
      screen.getByPlaceholderText(/Use \{\{variable\}\} to mark values/)
    ).toBeInTheDocument();
  });

  it("uses the plain placeholder when variablesSupported is false", () => {
    renderComponent({ variablesSupported: false });
    expect(
      screen.getByPlaceholderText("Describe how the judge should grade a response")
    ).toBeInTheDocument();
  });

  it("shows detected prompt variables with description inputs when supported", async () => {
    const user = setupUser();
    const { setVariableDescriptions } = renderComponent({
      variablesSupported: true,
      detectedPromptVariables: ["policy", "tone"],
      variableDescriptions: { policy: "Existing" },
    });

    expect(screen.getByText("{{policy}}")).toBeInTheDocument();
    expect(screen.getByText("{{tone}}")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Existing")).toBeInTheDocument();

    const inputs = screen.getAllByPlaceholderText(
      "Short description explaining the purpose of the variable"
    );
    await user.type(inputs[1], "d");

    expect(setVariableDescriptions).toHaveBeenCalled();
    const updater = setVariableDescriptions.mock.calls[0][0];
    expect(typeof updater).toBe("function");
  });

  it("actually types into a variable description field (stateful harness)", async () => {
    const user = setupUser();

    function Harness() {
      const [variableDescriptions, setVariableDescriptions] = React.useState<
        Record<string, string>
      >({});
      return (
        <CreateEvaluatorSidebar
          isOpen
          evaluatorName=""
          evaluatorDescription=""
          evaluatorType={null}
          evaluatorOutputType="binary"
          evaluatorScale={[]}
          evaluatorBinaryScale={[]}
          judgeModel={null}
          systemPrompt=""
          detectedPromptVariables={["tone"]}
          variableDescriptions={variableDescriptions}
          variablesSupported
          validationAttempted={false}
          createNameError={null}
          createError={null}
          isCreating={false}
          isNameDuplicate={() => false}
          onClose={jest.fn()}
          onOpenUseCasePicker={jest.fn()}
          onOpenModelPicker={jest.fn()}
          onCreate={jest.fn()}
          setEvaluatorName={jest.fn()}
          setEvaluatorDescription={jest.fn()}
          setEvaluatorOutputType={jest.fn()}
          setEvaluatorScale={jest.fn()}
          setEvaluatorBinaryScale={jest.fn()}
          setSystemPrompt={jest.fn()}
          setVariableDescriptions={setVariableDescriptions}
          setCreateNameError={jest.fn()}
        />
      );
    }

    render(<Harness />);
    const input = screen.getByPlaceholderText(
      "Short description explaining the purpose of the variable"
    );
    await user.type(input, "hi");
    expect(screen.getByDisplayValue("hi")).toBeInTheDocument();
  });

  it("marks a variable description as missing once validation is attempted", () => {
    renderComponent({
      variablesSupported: true,
      detectedPromptVariables: ["policy"],
      variableDescriptions: {},
      validationAttempted: true,
    });
    const input = screen.getByPlaceholderText(
      "Short description explaining the purpose of the variable"
    );
    expect(input.className).toContain("border-red-500");
  });

  it("does not render the variables block when there are none detected", () => {
    renderComponent({
      variablesSupported: true,
      detectedPromptVariables: [],
    });
    expect(screen.queryByText("Variables")).not.toBeInTheDocument();
  });

  it("shows the unsupported-variables warning when variablesSupported is false and variables were typed", () => {
    renderComponent({
      variablesSupported: false,
      evaluatorType: "stt",
      detectedPromptVariables: ["policy"],
    });
    expect(
      screen.getByText(/Variables are not supported for/)
    ).toBeInTheDocument();
    expect(screen.getByText("Speech to Text")).toBeInTheDocument();
  });

  it("does not show the unsupported-variables warning without an evaluatorType", () => {
    renderComponent({
      variablesSupported: false,
      evaluatorType: null,
      detectedPromptVariables: ["policy"],
    });
    expect(
      screen.queryByText(/Variables are not supported for/)
    ).not.toBeInTheDocument();
  });

  it("shows a red border on the prompt textarea when validation fails and it's empty", () => {
    renderComponent({ validationAttempted: true, systemPrompt: "" });
    const textarea = screen.getByPlaceholderText(/Describe how the judge should grade/);
    expect(textarea.className).toContain("border-red-500");
  });

  it("shows the create error and calls onCreate / onClose from the footer", async () => {
    const user = setupUser();
    const { onCreate, onClose } = renderComponent({ createError: "Something broke" });
    expect(screen.getByText("Something broke")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();

    await user.click(screen.getByText("Create evaluator"));
    expect(onCreate).toHaveBeenCalled();
  });

  it("shows the creating spinner label and disables the footer buttons while isCreating", () => {
    renderComponent({ isCreating: true });
    expect(screen.getByText("Creating...")).toBeInTheDocument();
    expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
    expect(screen.getByText("Creating...").closest("button")).toBeDisabled();
  });
});
