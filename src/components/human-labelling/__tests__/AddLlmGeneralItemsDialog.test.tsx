import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  AddLlmGeneralItemsDialog,
  LlmGeneralEvaluatorDef,
} from "../AddLlmGeneralItemsDialog";

// bulk-upload-shared.tsx pulls in jspdf (ESM, not transformed by Jest) for
// unrelated CSV/PDF export helpers. AddLlmGeneralItemsDialog only needs
// humaniseDetailObject from it, so stub the module with a minimal
// reimplementation to avoid loading jspdf in this test file.
jest.mock("../bulk-upload-shared", () => ({
  humaniseDetailObject: (detail: {
    code?: string;
    conflicting_names?: string[];
  }): string | null => {
    const names = detail.conflicting_names ?? [];
    const fmt =
      names.length === 0
        ? null
        : names.length === 1
          ? `"${names[0]}"`
          : names.map((n) => `"${n}"`).join(", ");
    if (detail.code === "ITEM_NAME_CONFLICT") {
      return fmt
        ? names.length === 1
          ? `An item named ${fmt} already exists in this task`
          : `Items with these names already exist in this task: ${fmt}`
        : "One or more item names already exist in this task";
    }
    return null;
  },
}));

const evaluatorWithVars: LlmGeneralEvaluatorDef = {
  uuid: "ev-1",
  name: "Relevance",
  description: "Checks relevance",
  variables: [
    { name: "topic", description: "The topic", default: "" },
    { name: "tone", default: "neutral" },
  ],
};

const evaluatorNoVars: LlmGeneralEvaluatorDef = {
  uuid: "ev-2",
  name: "Fluency",
  variables: [],
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof AddLlmGeneralItemsDialog>> = {},
) {
  const onClose = jest.fn();
  const onSubmit = jest.fn();
  const utils = render(
    <AddLlmGeneralItemsDialog
      isOpen
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onClose, onSubmit, ...utils };
}

describe("AddLlmGeneralItemsDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <AddLlmGeneralItemsDialog
        isOpen={false}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByText("Add item")).not.toBeInTheDocument();
  });

  it("renders the add-mode header with no evaluators section when none provided", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { name: "Add item" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();
  });

  it("keeps Add disabled until name/input/output are filled", async () => {
    const user = setupUser();
    renderDialog();
    const addButton = screen.getByRole("button", { name: "Add item" });
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("Your item name"),
      "Item 1",
    );
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "input text",
    );
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "output text",
    );
    expect(addButton).not.toBeDisabled();
  });

  it("renders evaluators with variable inputs, seeding defaults", () => {
    renderDialog({ evaluators: [evaluatorWithVars, evaluatorNoVars] });
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    expect(screen.getByText("Relevance")).toBeInTheDocument();
    expect(screen.getByText("Checks relevance")).toBeInTheDocument();
    expect(screen.getByText("Fluency")).toBeInTheDocument();
    // Default-seeded variable value shown as textarea content.
    expect(screen.getByDisplayValue("neutral")).toBeInTheDocument();
  });

  it("requires all evaluator variables to be filled before Add is enabled", async () => {
    const user = setupUser();
    renderDialog({ evaluators: [evaluatorWithVars] });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    const addButton = screen.getByRole("button", { name: "Add item" });
    // tone has a default ("neutral") but topic is blank -> invalid.
    expect(addButton).toBeDisabled();

    const topicInput = screen.getByPlaceholderText("The topic");
    await user.type(topicInput, "sports");
    expect(addButton).not.toBeDisabled();
  });

  it("uses a generated placeholder when a variable has no description or default", () => {
    renderDialog({
      evaluators: [
        {
          uuid: "ev-3",
          name: "Bare",
          variables: [{ name: "custom_var" }],
        },
      ],
    });
    expect(
      screen.getByPlaceholderText("Enter value for {{custom_var}}"),
    ).toBeInTheDocument();
  });

  it("submits trimmed values including evaluator_variables", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({ evaluators: [evaluatorWithVars], onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "  Item 1  ");
    await user.type(
      screen.getByPlaceholderText(
        "Optional — what is this item about? Shown to annotators alongside the evaluators.",
      ),
      "  desc  ",
    );
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "  in  ",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "  out  ",
    );
    await user.type(screen.getByPlaceholderText("The topic"), "  sports  ");

    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        uuid: undefined,
        name: "Item 1",
        description: "desc",
        input: "in",
        output: "out",
        evaluator_variables: { "ev-1": { topic: "sports", tone: "neutral" } },
      },
    ]);
  });

  it("shows a name-conflict error under the Name field", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error(
          'Request failed: 400 - {"detail":{"code":"ITEM_NAME_CONFLICT","conflicting_names":["Item 1"]}}',
        ),
      );
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const msg = await screen.findByText(
      'An item named "Item 1" already exists in this task',
    );
    expect(msg.tagName).toBe("P");
    expect(msg).toHaveClass("text-sm", "text-red-500");
    expect(screen.getByPlaceholderText("Your item name")).toHaveClass(
      "border-red-500",
    );
  });

  it("shows the raw detail string when the error body isn't a structured object", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error('Request failed: 500 - {"detail":"Server exploded"}'),
      );
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText('{"detail":"Server exploded"}'),
    ).toBeInTheDocument();
  });

  it("shows a message for a non-JSON error body", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new Error("Request failed: 500 - Internal Server Error"));
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText("Internal Server Error"),
    ).toBeInTheDocument();
  });

  it("falls back to the message text when the error body isn't valid JSON", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new Error("Request failed: 500 - not-json{{{"));
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("not-json{{{")).toBeInTheDocument();
  });

  it("falls back to the default add error for a non-Error rejection", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockRejectedValue("boom");
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Failed to add item")).toBeInTheDocument();
  });

  it("closes via the header close button and Cancel-equivalent backdrop when clean", async () => {
    const user = setupUser();
    const { onClose, container } = renderDialog();

    const headerCloseButton = container.querySelector(
      ".border-b button",
    ) as Element;
    await user.click(headerCloseButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores backdrop clicks in add mode, even when the form is clean", async () => {
    // Add mode intentionally disables backdrop-click close (see
    // useUnsavedCloseGuard's handleBackdropClick — it's a no-op unless
    // isEdit) so a stray click can't discard in-progress work.
    const user = setupUser();
    const { onClose, container } = renderDialog();
    await user.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when clicking inside the dialog panel", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole("heading", { name: "Add item" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("edit mode", () => {
    const initialRows = [
      {
        uuid: "item-1",
        name: "Item 1",
        description: "desc",
        input: "in",
        output: "out",
        varValues: { "ev-1": { topic: "sports", tone: "excited" } },
      },
    ];

    it("seeds fields from initialRows and shows edit-mode labels", () => {
      renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
      });
      expect(screen.getByText("Edit item")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Item 1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("desc")).toBeInTheDocument();
      expect(screen.getByDisplayValue("in")).toBeInTheDocument();
      expect(screen.getByDisplayValue("out")).toBeInTheDocument();
      expect(screen.getByDisplayValue("sports")).toBeInTheDocument();
      expect(screen.getByDisplayValue("excited")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save item" }),
      ).toBeInTheDocument();
    });

    it("is not dirty until a field is changed from the seed, and submits with the uuid", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const { onClose } = renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
        onSubmit,
      });

      // Clean close via backdrop (edit mode allows backdrop close).
      const dialogRoot = document.querySelector(
        ".fixed.inset-0.z-50",
      ) as Element;
      await user.click(dialogRoot);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("prompts discard confirmation once a field is edited", async () => {
      const user = setupUser();
      const { onClose } = renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
      });
      const nameInput = screen.getByDisplayValue("Item 1");
      await user.type(nameInput, "!");

      const dialogRoot = document.querySelector(
        ".fixed.inset-0.z-50",
      ) as Element;
      await user.click(dialogRoot);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    });

    it("submits the edited item with its uuid, calling Save item and showing Saving state", async () => {
      const user = setupUser();
      let resolveSubmit: (() => void) | undefined;
      const onSubmit = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          }),
      );
      renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
        onSubmit,
      });

      const nameInput = screen.getByDisplayValue("Item 1");
      await user.clear(nameInput);
      await user.type(nameInput, "Item 1 renamed");

      const saveButton = screen.getByRole("button", { name: "Save item" });
      await user.click(saveButton);
      expect(screen.getByText("Saving...")).toBeInTheDocument();

      resolveSubmit?.();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({
          uuid: "item-1",
          name: "Item 1 renamed",
        }),
      ]);
    });

    it("uses the edit-mode default error message on a failed save", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockRejectedValue("boom");
      renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
        onSubmit,
      });

      const nameInput = screen.getByDisplayValue("Item 1");
      await user.type(nameInput, "!");
      await user.click(screen.getByRole("button", { name: "Save item" }));

      expect(
        await screen.findByText("Failed to save item"),
      ).toBeInTheDocument();
    });

    it("resets to a new seed item when reopened", () => {
      const { rerender } = render(
        <AddLlmGeneralItemsDialog
          isOpen={false}
          mode="edit"
          initialRows={initialRows}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );
      rerender(
        <AddLlmGeneralItemsDialog
          isOpen
          mode="edit"
          initialRows={[
            {
              uuid: "item-2",
              name: "Fresh item",
              input: "fresh in",
              output: "fresh out",
            },
          ]}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );
      expect(screen.getByDisplayValue("Fresh item")).toBeInTheDocument();
    });
  });
});
