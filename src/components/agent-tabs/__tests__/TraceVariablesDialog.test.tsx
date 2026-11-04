import { render, screen, waitFor, setupUser } from "@/test-utils";
import { TraceVariablesDialog } from "../TraceVariablesDialog";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import { fetchTraces, previewTraceVariables } from "@/lib/tracesApi";

jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  ...jest.requireActual("../../../lib/tracesApi"),
  fetchTraces: jest.fn(),
  previewTraceVariables: jest.fn(),
}));

const evaluator = (
  traceVariables?: Record<string, string> | null,
  over: Partial<EvaluatorData> = {},
): EvaluatorData => ({
  uuid: "ev-1",
  name: "Agrees with the nurse",
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  live_version: { variables: [{ name: "nurse_reply" }, { name: "ai_reply" }] },
  trace_variables: traceVariables,
  ...over,
});

function setup(
  traceVariables?: Record<string, string> | null,
  onSave = jest.fn().mockResolvedValue(undefined),
) {
  const onClose = jest.fn();
  const user = setupUser();
  render(
    <TraceVariablesDialog
      agentUuid="agent-1"
      evaluators={[evaluator(traceVariables)]}
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
  screen
    .getByRole("heading", { name: "Choose trace values" })
    .closest(".fixed") as HTMLElement;
const closeButtons = () => screen.getAllByRole("button", { name: "Close" });
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
    ["Conversation", "input"],
    ["Agent reply", "output.response"],
    ["Tool calls", "output.tool_calls"],
    ["Metadata", "metadata."],
    ["Labels", "labels"],
    ["Conversation ID", "conversation_id"],
    ["Message ID", "message_id"],
  ]);
  expect(
    screen.getByText(
      "Applies to new traces. Traces that already arrived are not scored again. An evaluator with a variable left as Not set does not score traces.",
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

  expect(onSave).toHaveBeenCalledWith("ev-1", {
    nurse_reply: "metadata.expert_answer",
  });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it("sends an empty map when everything is put back to Not set", async () => {
  const { user, onSave } = setup({ nurse_reply: "input" });

  await user.selectOptions(nurse(), "");
  await user.click(save());

  expect(onSave).toHaveBeenCalledWith("ev-1", {});
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
  for (const close of closeButtons()) expect(close).toBeDisabled();
  await user.click(backdrop());
  expect(onClose).not.toHaveBeenCalled();

  finish();
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});

it("closes from both close buttons and outside the dialog", async () => {
  const { user, onClose, onSave } = setup();

  const [header, footer] = closeButtons();
  await user.click(footer);
  await user.click(header);
  await user.click(backdrop());

  expect(onClose).toHaveBeenCalledTimes(3);
  expect(onSave).not.toHaveBeenCalled();
});

it("shows the evaluator's words and each variable's, and leaves out what is absent", () => {
  const onSave = jest.fn();
  render(
    <TraceVariablesDialog
      agentUuid="agent-1"
      evaluators={[
        evaluator(null, {
          description: "Compares the reply with the nurse",
          live_version: {
            variables: [
              { name: "nurse_reply", description: "What the nurse said" },
              { name: "ai_reply" },
            ],
          },
        }),
      ]}
      onClose={jest.fn()}
      onSave={onSave}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Agrees with the nurse" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Compares the reply with the nurse"),
  ).toBeInTheDocument();
  expect(nurse().parentElement?.parentElement).toHaveTextContent(
    "What the nurse said",
  );
  const aiLabel = screen.getByText("{{ai_reply}}");
  expect(aiLabel.nextElementSibling).toBeNull();
});

it("draws no rows for an evaluator with no live version", () => {
  render(
    <TraceVariablesDialog
      agentUuid="agent-1"
      evaluators={[evaluator(null, { live_version: null })]}
      onClose={jest.fn()}
      onSave={jest.fn()}
    />,
  );
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
});

it("has no list of evaluators and no position when there is only one", () => {
  setup();

  expect(save()).toBeInTheDocument();
  expect(screen.queryByText(/^Evaluator \d+ of \d+$/)).not.toBeInTheDocument();
  expect(screen.queryByText(/missing$/)).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /Agrees with the nurse/ }),
  ).not.toBeInTheDocument();
});

describe("the options depend on the agent type", () => {
  const options = () =>
    Array.from((nurse() as HTMLSelectElement).options).map((o) => [
      o.text,
      o.value,
    ]);
  const renderFor = (
    agentNature: "conversation" | "general",
    traceVariables: Record<string, string> | null = null,
  ) =>
    render(
      <TraceVariablesDialog
        agentUuid="agent-1"
        evaluators={[evaluator(traceVariables)]}
        agentNature={agentNature}
        onClose={jest.fn()}
        onSave={jest.fn().mockResolvedValue(undefined)}
      />,
    );
  const GENERAL = [
    ["Not set", ""],
    ["Input", "input"],
    ["Output", "output.response"],
    ["Tool calls", "output.tool_calls"],
    ["Metadata", "metadata."],
    ["Labels", "labels"],
  ];

  it("offers a conversation agent the conversation and its IDs", () => {
    renderFor("conversation");
    expect(options()).toEqual([
      ["Not set", ""],
      ["Conversation", "input"],
      ["Agent reply", "output.response"],
      ["Tool calls", "output.tool_calls"],
      ["Metadata", "metadata."],
      ["Labels", "labels"],
      ["Conversation ID", "conversation_id"],
      ["Message ID", "message_id"],
    ]);
  });

  it("offers a general agent input and output and no IDs", () => {
    renderFor("general");
    expect(options()).toEqual(GENERAL);
  });

  it("still shows a saved value this agent's list does not offer", () => {
    renderFor("general", {
      nurse_reply: "conversation_id",
      ai_reply: "message_id",
    });

    expect(nurse()).toHaveValue("conversation_id");
    expect(options()).toEqual([
      ...GENERAL,
      ["Conversation ID", "conversation_id"],
    ]);
    expect(ai()).toHaveValue("message_id");
    expect(
      Array.from((ai() as HTMLSelectElement).options).at(-1)?.text,
    ).toBe("Message ID");
  });

  it("keeps a saved value in the body when it is left alone", async () => {
    const user = setupUser();
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(
      <TraceVariablesDialog
        agentUuid="agent-1"
        evaluators={[evaluator({ nurse_reply: "message_id" })]}
        agentNature="general"
        onClose={jest.fn()}
        onSave={onSave}
      />,
    );

    await user.click(save());

    expect(onSave).toHaveBeenCalledWith("ev-1", { nurse_reply: "message_id" });
  });

  it("shows a saved value it has no name for as it is", () => {
    renderFor("conversation", { nurse_reply: "somewhere_new" });
    expect(options().at(-1)).toEqual(["somewhere_new", "somewhere_new"]);
    expect(nurse()).toHaveValue("somewhere_new");
  });

  it("adds nothing extra for a saved metadata key on a general agent", () => {
    renderFor("general", { nurse_reply: "metadata.expert_answer" });
    expect(options()).toEqual(GENERAL);
  });
});

describe("several evaluators", () => {
  const first = () => evaluator(null, { uuid: "a", name: "Alpha" });
  const done = () =>
    evaluator(
      { nurse_reply: "input", ai_reply: "labels" },
      { uuid: "b", name: "Bravo" },
    );
  const partial = () =>
    evaluator({ nurse_reply: "input" }, { uuid: "c", name: "Charlie" });

  function setupMany(
    evaluators: EvaluatorData[],
    onSave = jest.fn().mockResolvedValue(undefined),
  ) {
    const onClose = jest.fn();
    const user = setupUser();
    render(
      <TraceVariablesDialog
        agentUuid="agent-1"
        evaluators={evaluators}
        onClose={onClose}
        onSave={onSave}
      />,
    );
    return { user, onClose, onSave };
  }
  const row = (name: string) =>
    screen.getByRole("button", { name: new RegExp(`^${name}`) });

  it("lists every evaluator with what has been saved, and opens on the first missing one", () => {
    setupMany([done(), first(), partial()]);

    expect(row("Bravo")).toHaveTextContent("All set");
    expect(row("Alpha")).toHaveTextContent("2 of 2 missing");
    expect(row("Charlie")).toHaveTextContent("1 of 2 missing");
    expect(row("Alpha")).toHaveAttribute("aria-current", "true");
    expect(row("Bravo")).not.toHaveAttribute("aria-current");
    expect(screen.getByText("Evaluator 2 of 3")).toBeInTheDocument();
  });

  it("opens on the first evaluator when none is missing a value", () => {
    setupMany([done(), evaluator({ nurse_reply: "input", ai_reply: "input" }, { uuid: "z", name: "Zulu" })]);

    expect(row("Bravo")).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("reads an evaluator with no variables as all set", () => {
    setupMany([first(), evaluator(null, { uuid: "n", name: "Nothing", live_version: null })]);

    expect(row("Nothing")).toHaveTextContent("All set");
  });

  it("does not change a status for what is typed, only for what is saved", async () => {
    const { user } = setupMany([first(), partial()]);

    await user.selectOptions(nurse(), "input");
    await user.selectOptions(ai(), "labels");

    expect(row("Alpha")).toHaveTextContent("2 of 2 missing");

    await user.click(screen.getByRole("button", { name: "Save and next" }));

    await waitFor(() => expect(row("Alpha")).toHaveTextContent("All set"));
  });

  it("keeps typed values when moving between evaluators", async () => {
    const { user, onSave } = setupMany([first(), partial()]);

    await user.selectOptions(nurse(), "metadata.");
    await user.type(keyInput(), "expert");
    await user.click(row("Charlie"));
    expect(nurse()).toHaveValue("input");
    await user.click(row("Alpha"));

    expect(nurse()).toHaveValue("metadata.");
    expect(keyInput()).toHaveValue("expert");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("calls onClose with nothing saved when closed, so typed values go with it", async () => {
    const { user, onClose, onSave } = setupMany([first(), partial()]);

    await user.selectOptions(nurse(), "input");
    await user.click(closeButtons()[1]);

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("moves to the next missing evaluator, skipping finished ones, then closes", async () => {
    const { user, onClose, onSave } = setupMany([first(), done(), partial()]);

    await user.selectOptions(nurse(), "input");
    await user.selectOptions(ai(), "labels");
    await user.click(screen.getByRole("button", { name: "Save and next" }));

    await waitFor(() =>
      expect(row("Charlie")).toHaveAttribute("aria-current", "true"),
    );
    expect(onSave).toHaveBeenLastCalledWith("a", {
      nurse_reply: "input",
      ai_reply: "labels",
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Evaluator 3 of 3")).toBeInTheDocument();
    // Alpha is finished now, and stays listed so it can be reopened.
    expect(row("Alpha")).toHaveTextContent("All set");

    await user.selectOptions(ai(), "labels");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("goes back round to an earlier evaluator still missing values", async () => {
    const { user } = setupMany([first(), partial()]);

    await user.click(row("Charlie"));
    await user.selectOptions(ai(), "labels");
    await user.click(screen.getByRole("button", { name: "Save and next" }));

    await waitFor(() =>
      expect(row("Alpha")).toHaveAttribute("aria-current", "true"),
    );
  });

  it("reads Save once no other evaluator is missing values", async () => {
    const { user } = setupMany([first(), done()]);

    expect(
      screen.getByRole("button", { name: "Save" }),
    ).toBeInTheDocument();
    await user.click(row("Bravo"));
    expect(
      screen.getByRole("button", { name: "Save and next" }),
    ).toBeInTheDocument();
  });

  it("stays on the evaluator with the error when a save fails, and clears it on moving", async () => {
    const { user, onClose } = setupMany(
      [first(), partial()],
      jest.fn().mockRejectedValue(new Error("Unknown trace value")),
    );

    await user.click(screen.getByRole("button", { name: "Save and next" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unknown trace value",
    );
    expect(row("Alpha")).toHaveAttribute("aria-current", "true");
    expect(row("Alpha")).toHaveTextContent("2 of 2 missing");
    expect(onClose).not.toHaveBeenCalled();

    await user.click(row("Charlie"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cannot move to another evaluator while saving", async () => {
    let finish = () => {};
    const { user } = setupMany(
      [first(), partial()],
      jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    );

    await user.click(screen.getByRole("button", { name: "Save and next" }));

    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(row("Charlie")).toBeDisabled();
    finish();
    await waitFor(() =>
      expect(row("Charlie")).toHaveAttribute("aria-current", "true"),
    );
  });
});

describe("the column on the right", () => {
  const mockFetchTraces = fetchTraces as jest.Mock;
  const mockPreview = previewTraceVariables as jest.Mock;
  const body = () =>
    JSON.parse(
      screen.getByText("What your traces need to contain").nextElementSibling
        ?.textContent ?? "",
    );

  beforeEach(() => {
    localStorage.setItem("access_token", "tok");
    mockFetchTraces.mockReset();
    mockPreview.mockReset();
    mockFetchTraces.mockResolvedValue({
      items: [
        {
          uuid: "t1",
          created_at: "2026-08-29T12:00:00Z",
          input_preview: "Hello",
        },
      ],
    });
    mockPreview.mockResolvedValue({
      values: [
        { variable: "nurse_reply", source: "metadata.k", value: "From the trace" },
      ],
    });
  });
  afterEach(() => localStorage.removeItem("access_token"));

  it("follows the dropdowns, and leaves a Metadata row with no key out of the request", async () => {
    const { user } = setup();
    await screen.findByLabelText("Test on a trace");

    expect(body().metadata).toBeUndefined();

    await user.selectOptions(nurse(), "metadata.");
    expect(body().metadata).toBeUndefined();
    expect(screen.getAllByText("Not set", { selector: "p" })).toHaveLength(2);

    await user.type(keyInput(), "k");
    expect(body().metadata).toEqual([{ key: "k", value: "<nurse_reply>" }]);

    expect(await screen.findByText("From the trace")).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledTimes(1);
    expect(mockPreview).toHaveBeenCalledWith("tok", "agent-1", "t1", {
      nurse_reply: "metadata.k",
    });
  });

  it("uses the agent's type for the example and the wording", async () => {
    mockPreview.mockResolvedValue({
      values: [{ variable: "nurse_reply", source: "input", value: null }],
    });
    const user = setupUser();
    render(
      <TraceVariablesDialog
        agentUuid="agent-1"
        evaluators={[evaluator({ nurse_reply: "input" })]}
        agentNature="general"
        onClose={jest.fn()}
        onSave={jest.fn()}
      />,
    );

    expect(body().input).toBe("<nurse_reply>");
    expect(await screen.findByText("This trace has no input")).toBeInTheDocument();
    await user.selectOptions(nurse(), "");
    expect(body().input).toBe("The user's message");
  });

  it("is there for several evaluators, showing the selected one, and fetches the traces once", async () => {
    const user = setupUser();
    render(
      <TraceVariablesDialog
        agentUuid="agent-1"
        evaluators={[
          evaluator({ nurse_reply: "labels" }, { uuid: "a", name: "Alpha" }),
          evaluator({ nurse_reply: "message_id" }, { uuid: "b", name: "Bravo" }),
        ]}
        onClose={jest.fn()}
        onSave={jest.fn()}
      />,
    );
    await screen.findByLabelText("Test on a trace");
    expect(body().labels).toEqual(["<nurse_reply>"]);

    await user.click(screen.getByRole("button", { name: /^Bravo/ }));

    expect(body().labels).toBeUndefined();
    expect(body().message_id).toBe("<nurse_reply>");
    expect(mockFetchTraces).toHaveBeenCalledTimes(1);
  });
});
