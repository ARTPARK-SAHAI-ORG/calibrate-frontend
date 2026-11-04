import { render, screen, waitFor, setupUser } from "@/test-utils";
import { TraceVariablesDialog } from "../TraceVariablesDialog";
import type { EvaluatorData } from "@/lib/evaluatorApi";

const evaluator = (
  traceVariables?: Record<string, string> | null,
): EvaluatorData => ({
  uuid: "ev-1",
  name: "Agrees with the nurse",
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  live_version: { variables: [{ name: "nurse_reply" }, { name: "ai_reply" }] },
  trace_variables: traceVariables,
});

function setup(
  traceVariables?: Record<string, string> | null,
  onSave = jest.fn().mockResolvedValue(undefined),
) {
  const onClose = jest.fn();
  const user = setupUser();
  render(
    <TraceVariablesDialog
      evaluator={evaluator(traceVariables)}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { user, onClose, onSave };
}

const nurse = () => screen.getByLabelText("{{nurse_reply}}");
const ai = () => screen.getByLabelText("{{ai_reply}}");
const save = () => screen.getByRole("button", { name: "Save" });
const backdrop = () =>
  screen.getByRole("heading").closest(".fixed") as HTMLElement;
const keyInput = () => screen.getByLabelText("Metadata key for nurse_reply");

it("draws one row per variable, with every option named", () => {
  setup();

  expect(nurse()).toHaveValue("");
  expect(ai()).toHaveValue("");
  expect(
    Array.from((nurse() as HTMLSelectElement).options).map((o) => [
      o.text,
      o.value,
    ]),
  ).toEqual([
    ["Not set", ""],
    ["Input", "input"],
    ["Agent reply", "output.response"],
    ["Tool calls", "output.tool_calls"],
    ["Metadata", "metadata."],
    ["Labels", "labels"],
    ["Conversation ID", "conversation_id"],
    ["Message ID", "message_id"],
  ]);
  expect(
    screen.getByText(
      "Applies to new traces. A trace missing one of these values is not scored by this evaluator.",
    ),
  ).toBeInTheDocument();
});

it("starts from the saved values, including a metadata key", () => {
  setup({ nurse_reply: "metadata.expert_answer", ai_reply: "output.response" });

  expect(nurse()).toHaveValue("metadata.");
  expect(keyInput()).toHaveValue("expert_answer");
  expect(ai()).toHaveValue("output.response");
});

it("sends only the rows that are set, with the key trimmed, then closes", async () => {
  const { user, onClose, onSave } = setup();

  await user.selectOptions(nurse(), "metadata.");
  await user.type(keyInput(), " expert_answer ");
  await user.click(save());

  expect(onSave).toHaveBeenCalledWith({
    nurse_reply: "metadata.expert_answer",
  });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it("sends an empty map when everything is put back to Not set", async () => {
  const { user, onSave } = setup({ nurse_reply: "input" });

  await user.selectOptions(nurse(), "");
  await user.click(save());

  expect(onSave).toHaveBeenCalledWith({});
});

it("will not save a Metadata row with no key, or only spaces", async () => {
  const { user } = setup();
  expect(save()).toBeEnabled();

  await user.selectOptions(nurse(), "metadata.");
  expect(
    screen.getByPlaceholderText("Metadata key, for example expert_answer"),
  ).toBeInTheDocument();
  expect(save()).toBeDisabled();

  await user.type(keyInput(), "  ");
  expect(save()).toBeDisabled();

  await user.type(keyInput(), "k");
  expect(save()).toBeEnabled();
});

it("hides the key box when the row moves off Metadata", async () => {
  const { user } = setup({ nurse_reply: "metadata.expert_answer" });

  await user.selectOptions(nurse(), "input");

  expect(
    screen.queryByLabelText("Metadata key for nurse_reply"),
  ).not.toBeInTheDocument();
  expect(save()).toBeEnabled();
});

it("stays open and shows the error when saving fails", async () => {
  const { user, onClose } = setup(
    null,
    jest.fn().mockRejectedValue(new Error("Unknown trace value")),
  );

  await user.click(save());

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Unknown trace value",
  );
  expect(onClose).not.toHaveBeenCalled();
  expect(save()).toBeEnabled();
});

it("shows a general error when the failure has no message", async () => {
  const { user } = setup(null, jest.fn().mockRejectedValue("nope"));

  await user.click(save());

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Failed to save trace values",
  );
});

it("keeps the button on screen while saving and cannot be closed", async () => {
  let finish = () => {};
  const onSave = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { user, onClose } = setup(null, onSave);

  await user.click(save());

  expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
  await user.click(backdrop());
  expect(onClose).not.toHaveBeenCalled();

  finish();
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it("closes from Cancel, the close button and outside the dialog", async () => {
  const { user, onClose, onSave } = setup();

  await user.click(screen.getByRole("button", { name: "Cancel" }));
  await user.click(screen.getByRole("button", { name: "Close" }));
  await user.click(backdrop());

  expect(onClose).toHaveBeenCalledTimes(3);
  expect(onSave).not.toHaveBeenCalled();
});
