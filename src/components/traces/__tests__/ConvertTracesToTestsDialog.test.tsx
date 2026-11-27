import { render, screen, setupUser, waitFor } from "@/test-utils";
import { ConvertTracesToTestsDialog } from "../ConvertTracesToTestsDialog";
import {
  fetchAgentEvaluators,
  fetchAllEvaluators,
  saveEvaluatorTraceVariables,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import {
  convertTracesToTests,
  fetchTraceVariableValues,
} from "@/lib/tracesApi";

jest.mock("../../../lib/evaluatorApi", () => ({
  __esModule: true,
  // Keep the real helpers: the create flow this dialog opens uses several of
  // them, and listing each one by hand breaks whenever a new one is added.
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchAllEvaluators: jest.fn(),
  fetchAgentEvaluators: jest.fn(),
  saveEvaluatorTraceVariables: jest.fn(),
  addEvaluatorsToAgent: jest.fn(),
  hasEvaluatorVariables: (e: {
    live_version?: { variables?: unknown[] | null } | null;
  }) => (e.live_version?.variables?.length ?? 0) > 0,
  isDefaultEvaluator: (e: { is_default?: boolean | null }) => !!e.is_default,
  isOwnedEvaluator: (e: { is_default?: boolean | null }) => !e.is_default,
}));
jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  // Only the request is faked; reading the failure it comes back with is the
  // real thing, so this covers what the reader is actually shown.
  convertTracesErrorMessage: jest.requireActual("../../../lib/tracesApi")
    .convertTracesErrorMessage,
  convertTracesToTests: jest.fn(),
  convertMissingValues: jest.requireActual("../../../lib/tracesApi")
    .convertMissingValues,
  fetchTraceVariableValues: jest.fn(),
  defaultTestName: jest.requireActual("../../../lib/tracesApi").defaultTestName,
}));
jest.mock("../../evaluators/EvaluatorPromptPreview", () => ({
  __esModule: true,
  EvaluatorPromptPreview: ({
    evaluatorUuid,
    variablesPanel,
  }: {
    evaluatorUuid: string | null;
    variablesPanel?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="prompt-for">{evaluatorUuid ?? "none"}</div>
      {variablesPanel}
    </div>
  ),
}));
jest.mock("../../agent-tabs/TraceVariablesDialog", () => ({
  __esModule: true,
  TraceVariablesDialog: ({
    fromTrace,
    evaluators,
    onSave,
    onClose,
  }: {
    fromTrace?: { uuid: string };
    evaluators: { uuid: string }[];
    onSave: (uuid: string, map: Record<string, string>) => Promise<void>;
    onClose: () => void;
  }) => (
    <button
      type="button"
      onClick={async () => {
        await onSave(evaluators[0].uuid, { topic: "input" });
        onClose();
      }}
    >
      save mapping from {fromTrace?.uuid ?? "nothing"}
    </button>
  ),
}));
jest.mock("../../evaluators/CreateEvaluatorFlow", () => ({
  __esModule: true,
  // The whole making-an-evaluator journey has its own tests; here only the
  // handing back of the created one matters.
  CreateEvaluatorFlow: ({
    open,
    onCreated,
  }: {
    open: boolean;
    onCreated: (evaluator: unknown) => void;
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onCreated({
            uuid: "ev-made",
            name: "Made just now",
            evaluator_type: "llm",
            is_default: false,
          })
        }
      >
        finish creating
      </button>
    ) : null,
}));
jest.mock("../../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchEvals = fetchAllEvaluators as jest.Mock;
const mockFetchAgentEvals = fetchAgentEvaluators as jest.Mock;
const mockConvert = convertTracesToTests as jest.Mock;
const mockReportError = reportError as jest.Mock;
const mockValues = fetchTraceVariableValues as jest.Mock;
const mockSave = saveEvaluatorTraceVariables as jest.Mock;

const EVALUATORS = [
  {
    uuid: "ev-default",
    name: "Correctness",
    evaluator_type: "llm",
    is_default: true,
    source_default_slug: "default-llm-next-reply",
  },
  {
    uuid: "ev-custom",
    name: "My Judge",
    evaluator_type: "llm",
    is_default: false,
  },
  { uuid: "ev-conv", name: "Conversation", evaluator_type: "conversation" },
  {
    uuid: "ev-general-default",
    name: "Output correctness",
    evaluator_type: "llm-general",
    is_default: true,
    source_default_slug: "default-llm-general",
  },
  {
    uuid: "ev-vars",
    name: "Needs Variables",
    evaluator_type: "llm",
    is_default: false,
    live_version: { variables: [{ name: "topic" }] },
  },
];

/** The checkbox for an evaluator row, found by the name shown on the row. */
function evaluatorCheckbox(name: string) {
  return screen.getByRole("checkbox", { name: new RegExp(name) });
}

function setup(
  overrides: Partial<
    React.ComponentProps<typeof ConvertTracesToTestsDialog>
  > = {},
) {
  const onConverted = jest.fn();
  const onClose = jest.fn();
  render(
    <ConvertTracesToTestsDialog
      isOpen
      onClose={onClose}
      accessToken="tok"
      traceUuids={["tr-1", "tr-2"]}
      testType="response"
      agentUuid="ag-1"
      onConverted={onConverted}
      {...overrides}
    />,
  );
  return { onConverted, onClose };
}

beforeEach(() => {
  mockFetchEvals.mockReset();
  mockFetchEvals.mockResolvedValue(EVALUATORS);
  mockFetchAgentEvals.mockReset();
  mockFetchAgentEvals.mockResolvedValue([]);
  mockConvert.mockReset();
  mockReportError.mockReset();
  mockValues.mockReset();
  mockValues.mockResolvedValue([]);
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
});

it("renders nothing when closed and never fetches", () => {
  const { container } = render(
    <ConvertTracesToTestsDialog
      isOpen={false}
      onClose={jest.fn()}
      accessToken="tok"
      traceUuids={["tr-1"]}
      testType="response"
      agentUuid="ag-1"
      onConverted={jest.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(mockFetchEvals).not.toHaveBeenCalled();
});

it("uses Add to tests copy and pluralizes the trace count", async () => {
  setup({ traceUuids: ["tr-1"] });
  expect(
    screen.getByRole("heading", { name: "Add 1 trace to your tests" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled(),
  );
  // The evaluator instruction is said once, in the header.
  expect(screen.getAllByText(/Pick at least one/)).toHaveLength(1);
});

it("lists the llm evaluators, and preselects the default LLM-reply one", async () => {
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  expect(
    screen.getByRole("heading", { name: "Add 2 traces to your tests" }),
  ).toBeInTheDocument();
  expect(screen.getByText("My Judge")).toBeInTheDocument();
  // Conversation evaluator filtered out.
  expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
  // An evaluator with variables is offered, and set up before it is ticked.
  expect(screen.getByText("Needs Variables")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Set up variables" }),
  ).toBeInTheDocument();
  expect(evaluatorCheckbox("Correctness")).toBeChecked();
  // The default is preselected, so adding is enabled without further clicks.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled(),
  );
  expect(mockFetchEvals).toHaveBeenCalledWith("tok");
  expect(mockFetchAgentEvals).toHaveBeenCalledWith("ag-1", "tok");
});

it("preselects the agent's own evaluators, skipping ones still to set up", async () => {
  mockFetchAgentEvals.mockResolvedValue([
    { uuid: "ev-custom" },
    {
      uuid: "ev-vars",
      live_version: { variables: [{ name: "topic" }] },
    },
  ]);
  mockConvert.mockResolvedValue({ created: 1, test_uuids: ["t1"] });
  const user = setupUser();
  setup();
  await waitFor(() => expect(screen.getByText("My Judge")).toBeInTheDocument());

  expect(evaluatorCheckbox("My Judge")).toBeChecked();
  expect(evaluatorCheckbox("Correctness")).not.toBeChecked();
  expect(evaluatorCheckbox("Needs Variables")).not.toBeChecked();

  await user.click(screen.getByRole("button", { name: "Add to tests" }));
  await waitFor(() => expect(mockConvert).toHaveBeenCalled());
  expect(mockConvert.mock.calls[0][1].evaluatorUuids).toEqual(["ev-custom"]);
});

it("falls back to the correctness evaluator when the agent's evaluators fail to load", async () => {
  mockFetchAgentEvals.mockRejectedValue(new Error("nope"));
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  expect(evaluatorCheckbox("Correctness")).toBeChecked();
  expect(
    screen.queryByText("Failed to load evaluators."),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled();
});

it("does not offer an agent picker", async () => {
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  expect(screen.queryByText(/Link to agents/i)).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/^Link to agent /)).not.toBeInTheDocument();
  // Footer keeps exactly the two actions.
  expect(
    screen.getAllByRole("button").filter(
      (b) =>
        !b.getAttribute("aria-label")?.startsWith("Select ") &&
        // Each evaluator row carries the button that opens its prompt.
        !b.className.includes("flex-1 text-left") &&
        // The body carries the button that makes a new evaluator.
        b.textContent !== "Create evaluator" &&
        b.textContent !== "Set up variables",
    ),
  ).toHaveLength(2);
  expect(
    screen.getByRole("button", { name: "Create evaluator" }),
  ).toBeInTheDocument();
});

it("submits a response test with the selected evaluator", async () => {
  mockConvert.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });
  const user = setupUser();
  const { onConverted } = setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );

  await user.click(screen.getByRole("button", { name: "Add to tests" }));

  await waitFor(() => expect(mockConvert).toHaveBeenCalled());
  expect(mockConvert).toHaveBeenCalledWith("tok", {
    selectAll: null,
    traceIds: ["tr-1", "tr-2"],
    type: "response",
    evaluatorUuids: ["ev-default"],
    acceptAnyArguments: false,
    skipMissingValues: false,
  });
  // The evaluators the tests were given come back too, so the tab can offer
  // to attach any the agent does not have yet.
  expect(onConverted).toHaveBeenCalledWith(
    { created: 2, test_uuids: ["t1", "t2"] },
    [{ uuid: "ev-default", name: "Correctness" }],
  );
  // The built-in evaluator has nothing to read from the traces.
  expect(mockValues).not.toHaveBeenCalled();
});

it("leaves the built-in evaluator unticked while it needs setting up, and reads nothing", async () => {
  mockFetchEvals.mockResolvedValue([
    { ...EVALUATORS[0], live_version: { variables: [{ name: "criteria" }] } },
  ]);
  setup();
  await screen.findByText("Correctness");

  expect(evaluatorCheckbox("Correctness")).not.toBeChecked();
  expect(screen.getByRole("button", { name: "Add to tests" })).toBeDisabled();
  expect(mockValues).not.toHaveBeenCalled();
});

it("requires an evaluator for a response test", async () => {
  const user = setupUser();
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  // Deselect the preselected default.
  await user.click(evaluatorCheckbox("Correctness"));
  expect(screen.getByRole("button", { name: "Add to tests" })).toBeDisabled();
});

it("asks only for confirmation for tool-call traces", async () => {
  mockConvert.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });
  const user = setupUser();
  setup({ testType: "tool_call" });

  expect(mockFetchEvals).not.toHaveBeenCalled();
  expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();
  expect(screen.queryByText(/Pick at least one evaluator/)).toBeNull();
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.queryByText("Test type")).not.toBeInTheDocument();
  expect(
    screen.queryByText(/only when every selected trace has tool calls/i),
  ).not.toBeInTheDocument();
  // Nothing to choose: no options at all, just what will happen.
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  expect(screen.queryByText(/Match tool name only/)).toBeNull();
  expect(
    screen.getByText(
      /The resulting tests will consider the tool calls recorded in these traces as the expected output/,
    ),
  ).toBeInTheDocument();

  expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled();
  await user.click(screen.getByRole("button", { name: "Add to tests" }));

  await waitFor(() => expect(mockConvert).toHaveBeenCalled());
  expect(mockConvert).toHaveBeenCalledWith("tok", {
    selectAll: null,
    traceIds: ["tr-1", "tr-2"],
    type: "tool_call",
    evaluatorUuids: undefined,
    acceptAnyArguments: false,
    skipMissingValues: false,
  });
});

it("does not show a test type picker for response tests", async () => {
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  expect(screen.queryByText("Test type")).not.toBeInTheDocument();
  expect(
    screen.queryByText("Match tool name only (ignore arguments)"),
  ).not.toBeInTheDocument();
});

it("shows Adding while adding tests", async () => {
  mockConvert.mockReturnValue(new Promise(() => {}));
  const user = setupUser();
  setup({ testType: "tool_call" });

  await user.click(screen.getByRole("button", { name: "Add to tests" }));

  expect(screen.getByRole("button", { name: "Adding..." })).toBeInTheDocument();
});

it("surfaces an adding error while preserving the technical report", async () => {
  mockConvert.mockRejectedValue(new Error("boom"));
  const user = setupUser();
  const { onConverted } = setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Add to tests" }));
  await waitFor(() =>
    expect(
      screen.getByText(
        "Something went wrong while adding to tests. Please try again.",
      ),
    ).toBeInTheDocument(),
  );
  expect(mockReportError).toHaveBeenCalledWith(
    "Error converting traces to tests:",
    expect.any(Error),
  );
  expect(onConverted).not.toHaveBeenCalled();
});

it("shows what the backend says went wrong, when it says", async () => {
  mockConvert.mockRejectedValue(
    new Error(
      `Request failed: 400 - ${JSON.stringify({
        detail: {
          error: "Some evaluators cannot be used.",
          evaluators: ["Tone needs values for its variables."],
        },
      })}`,
    ),
  );
  const user = setupUser();
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  await user.click(screen.getByRole("button", { name: "Add to tests" }));
  await waitFor(() =>
    expect(
      screen.getByText("Tone needs values for its variables."),
    ).toBeInTheDocument(),
  );
});

it("offers the output evaluators and sends a general conversion", async () => {
  const user = setupUser();
  mockConvert.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });
  const { onConverted } = setup({
    testType: "general",
    agentNature: "general",
  });

  await waitFor(() =>
    expect(evaluatorCheckbox("Output correctness")).toBeChecked(),
  );
  // The reply evaluators cannot judge a general agent's output, so they are
  // not on offer at all.
  expect(screen.queryByText("My Judge")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Add to tests" }));

  await waitFor(() =>
    expect(mockConvert).toHaveBeenCalledWith("tok", {
      selectAll: null,
      traceIds: ["tr-1", "tr-2"],
      type: "general",
      evaluatorUuids: ["ev-general-default"],
      acceptAnyArguments: false,
      skipMissingValues: false,
    }),
  );
  expect(onConverted).toHaveBeenCalledWith(
    { created: 2, test_uuids: ["t1", "t2"] },
    [{ uuid: "ev-general-default", name: "Output correctness" }],
  );
});

it("will not add a general conversion with no evaluator ticked", async () => {
  const user = setupUser();
  setup({ testType: "general", agentNature: "general" });

  await waitFor(() =>
    expect(evaluatorCheckbox("Output correctness")).toBeChecked(),
  );
  await user.click(evaluatorCheckbox("Output correctness"));

  expect(screen.getByRole("button", { name: "Add to tests" })).toBeDisabled();
  expect(mockConvert).not.toHaveBeenCalled();
});

it("offers making an evaluator when none can judge this agent", async () => {
  const user = setupUser();
  mockFetchEvals.mockResolvedValue([]);
  setup({ testType: "general", agentNature: "general" });

  expect(
    await screen.findByText(
      /Your workspace has none that score a single output/,
    ),
  ).toBeInTheDocument();

  // The reader is not sent away to another page to make one.
  expect(screen.queryByText(/Evaluators page/)).not.toBeInTheDocument();
  // The list heading has nothing under it, so it stays away.
  expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Create evaluator" }));

  // The making-an-evaluator journey opens over this dialog.
  expect(
    screen.getByRole("button", { name: "finish creating" }),
  ).toBeInTheDocument();
});

it("says a reply, not an output, for a conversational agent", async () => {
  mockFetchEvals.mockResolvedValue([]);
  setup();

  expect(
    await screen.findByText(
      /Your workspace has none that score a reply in a conversation/,
    ),
  ).toBeInTheDocument();
});

it("ticks an evaluator made here and opens its prompt on the right", async () => {
  const user = setupUser();
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );

  await user.click(screen.getByRole("button", { name: "Create evaluator" }));
  await user.click(screen.getByRole("button", { name: "finish creating" }));

  expect(
    screen.getByRole("checkbox", { name: "Select Made just now" }),
  ).toBeChecked();
  expect(screen.getByTestId("prompt-for")).toHaveTextContent("ev-made");
});

describe("naming one trace's test", () => {
  it("names it first, from the comment, then picks evaluators", async () => {
    mockConvert.mockResolvedValue({ created: 1, test_uuids: ["t1"] });
    const user = setupUser();
    const { onClose } = setup({
      traceUuids: ["tr-1"],
      nameFrom: { comment: " It skipped rotavirus ", userMessage: "Hi" },
    });

    const box = screen.getByLabelText("Name of the test");
    expect(box).toHaveValue("It skipped rotavirus");
    expect(
      screen.getByText(
        "Automatically filled in from the comment given with the feedback",
      ),
    ).toBeInTheDocument();
    // The evaluators wait for the second step.
    expect(screen.queryByText("Correctness")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add to tests" })).toBeNull();

    await user.clear(box);
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.type(box, "Rotavirus left out");
    await user.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(screen.getByText("Correctness")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Evaluators", { selector: "div" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Name of the test")).toHaveValue(
      "Rotavirus left out",
    );
    await user.click(screen.getByRole("button", { name: "2 Evaluators" }));
    await user.click(
      await screen.findByRole("button", { name: "Add to tests" }),
    );

    await waitFor(() => expect(mockConvert).toHaveBeenCalled());
    expect(mockConvert.mock.calls[0][1]).toMatchObject({
      traceIds: ["tr-1"],
      evaluatorUuids: ["ev-default"],
      name: "Rotavirus left out",
    });

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to the user's message, cut to 60 characters", () => {
    const long = "a".repeat(70);
    setup({
      traceUuids: ["tr-1"],
      nameFrom: { comment: "  ", userMessage: long },
    });
    expect(screen.getByLabelText("Name of the test")).toHaveValue(
      `${"a".repeat(60)}…`,
    );
    expect(
      screen.getByText("Automatically filled in from the user's message"),
    ).toBeInTheDocument();
  });

  it("never cuts an emoji in half", () => {
    setup({
      traceUuids: ["tr-1"],
      nameFrom: { userMessage: `${"a".repeat(59)}😀😀` },
    });
    expect(screen.getByLabelText("Name of the test")).toHaveValue(
      `${"a".repeat(59)}😀…`,
    );
  });

  it("stays on the evaluators while adding", async () => {
    mockConvert.mockReturnValue(new Promise(() => {}));
    const user = setupUser();
    setup({ traceUuids: ["tr-1"], nameFrom: { userMessage: "Hi" } });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(
      await screen.findByRole("button", { name: "Add to tests" }),
    );
    await user.click(screen.getByRole("button", { name: "✓ Test name" }));
    expect(screen.queryByLabelText("Name of the test")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Adding..." }),
    ).toBeInTheDocument();
  });

  it("starts empty with nothing to name it from", () => {
    setup({ traceUuids: ["tr-1"], nameFrom: {} });
    expect(screen.getByLabelText("Name of the test")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.queryByText(/Automatically filled in/)).toBeNull();
  });

  it("names a tool-call test on one screen with no steps", async () => {
    mockConvert.mockResolvedValue({ created: 1, test_uuids: ["t1"] });
    const user = setupUser();
    setup({
      traceUuids: ["tr-1"],
      testType: "tool_call",
      nameFrom: { userMessage: "Book a visit" },
    });
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.getByLabelText("Name of the test")).toHaveValue(
      "Book a visit",
    );
    await user.click(screen.getByRole("button", { name: "Add to tests" }));
    await waitFor(() => expect(mockConvert).toHaveBeenCalled());
    expect(mockConvert.mock.calls[0][1]).toMatchObject({
      type: "tool_call",
      name: "Book a visit",
    });
  });

  it("does not ask for a name for several traces", async () => {
    setup({ nameFrom: { userMessage: "Hi" } });
    expect(screen.queryByLabelText("Name of the test")).toBeNull();
    await waitFor(() =>
      expect(screen.getByText("Correctness")).toBeInTheDocument(),
    );
  });
});

describe("evaluators with variables", () => {
  const MAPPED = { uuid: "ev-vars", trace_variables: { topic: "input" } };
  const valuesFor = (topics: (string | null)[]) =>
    topics.map((value, i) => ({
      trace_id: `tr-${i + 1}`,
      evaluator_id: "ev-vars",
      values: [{ variable: "topic", source: "input", value }],
    }));
  const LABELS = { "tr-1": "Where is my order", "tr-2": "Cancel it" };

  it("ticking one to set up opens the set-up on the first trace, then ticks it", async () => {
    const user = setupUser();
    mockValues.mockResolvedValue(valuesFor(["order", "cancel"]));
    setup({ fromTrace: { uuid: "tr-1" } as never, traceLabels: LABELS });
    await screen.findByText("Needs Variables");

    await user.click(evaluatorCheckbox("Needs Variables"));
    await user.click(
      screen.getByRole("button", { name: "save mapping from tr-1" }),
    );

    expect(evaluatorCheckbox("Needs Variables")).toBeChecked();
    expect(await screen.findByText("cancel")).toBeInTheDocument();
    expect(screen.getByText("Cancel it")).toBeInTheDocument();
  });

  it("shows the values of the picked traces beside the prompt", async () => {
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    mockValues.mockResolvedValue(valuesFor(["order"]));
    setup({ traceUuids: ["tr-1"], traceLabels: LABELS });

    // Ticked, so its prompt is what opens on the right.
    expect(await screen.findByText("order")).toBeInTheDocument();
    expect(mockValues).toHaveBeenCalledWith("tok", "ag-1", ["tr-1"], [
      "ev-vars",
    ]);
  });

  it("shows only where each value comes from for every matching trace", async () => {
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    setup({
      selectAll: { agentId: "ag-1" } as never,
      traceCount: 40,
    });

    expect(await screen.findByText("{{topic}}")).toBeInTheDocument();
    expect(screen.queryByText("Loading")).not.toBeInTheDocument();
    expect(mockValues).not.toHaveBeenCalled();
  });

  it("reads the values first and asks before adding without them", async () => {
    const user = setupUser();
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    mockValues.mockResolvedValue(valuesFor(["order", null]));
    mockConvert.mockResolvedValue({ created: 1, test_uuids: ["t1"] });
    const { onConverted } = setup({ traceLabels: LABELS });
    await screen.findByText("order");

    await user.click(screen.getByRole("button", { name: "Add to tests" }));
    expect(
      await screen.findByText("Some traces are missing a value"),
    ).toBeInTheDocument();
    expect(mockConvert).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.queryByText("Some traces are missing a value"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add to tests" }));
    await user.click(
      await screen.findByRole("button", { name: "Add without them" }),
    );
    await waitFor(() => expect(onConverted).toHaveBeenCalled());
    expect(mockConvert.mock.calls[0][1].skipMissingValues).toBe(true);
  });

  it("adds straight away when every trace has its values", async () => {
    const user = setupUser();
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    mockValues.mockResolvedValue(valuesFor(["order", "cancel"]));
    mockConvert.mockResolvedValue({ created: 2, test_uuids: ["t1", "t2"] });
    const { onConverted } = setup();
    await screen.findByText("order");

    await user.click(screen.getByRole("button", { name: "Add to tests" }));

    await waitFor(() => expect(onConverted).toHaveBeenCalled());
    expect(mockConvert.mock.calls[0][1].skipMissingValues).toBe(false);
  });

  it("asks about the traces the backend names when every matching trace was asked for", async () => {
    const user = setupUser();
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    mockConvert
      .mockRejectedValueOnce(
        new Error(
          `Request failed: 400 - ${JSON.stringify({
            detail: {
              message: "Some traces are missing values.",
              missing: [
                {
                  trace_id: "tr-9",
                  evaluator_id: "ev-vars",
                  evaluator_name: "Needs Variables",
                  variable: "topic",
                  source: "input",
                },
              ],
            },
          })}`,
        ),
      )
      .mockResolvedValueOnce({ created: 39, test_uuids: ["t1"] });
    mockValues.mockResolvedValue([
      {
        trace_id: "tr-9",
        evaluator_id: "ev-vars",
        input_preview: "Refund my order",
        values: [{ variable: "topic", source: "input", value: null }],
      },
    ]);
    const { onConverted } = setup({
      selectAll: { agentId: "ag-1" } as never,
      traceCount: 40,
    });
    await screen.findByText("{{topic}}");

    await user.click(screen.getByRole("button", { name: "Add to tests" }));

    expect(await screen.findByText("1 of 40")).toBeInTheDocument();
    // Not on the page, so it is named by what the user said in it.
    expect(screen.getByText("Refund my order")).toBeInTheDocument();
    expect(screen.queryByText("tr-9")).not.toBeInTheDocument();
    expect(mockValues).toHaveBeenCalledWith("tok", "ag-1", ["tr-9"], [
      "ev-vars",
    ]);
    await user.click(screen.getByRole("button", { name: "Add without them" }));
    await waitFor(() => expect(onConverted).toHaveBeenCalled());
    expect(mockConvert.mock.calls[1][1].skipMissingValues).toBe(true);
  });

  it("shows the failure when adding without them fails", async () => {
    const user = setupUser();
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    mockValues.mockResolvedValue(valuesFor(["order", null]));
    mockConvert.mockRejectedValue(new Error("boom"));
    setup();
    await screen.findByText("order");

    await user.click(screen.getByRole("button", { name: "Add to tests" }));
    await user.click(
      await screen.findByRole("button", { name: "Add without them" }),
    );

    expect(
      await screen.findByText(
        "Something went wrong while adding to tests. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Some traces are missing a value"),
    ).not.toBeInTheDocument();
  });

  it("says the values could not be read and stays put", async () => {
    const user = setupUser();
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    mockValues.mockRejectedValue(new Error("boom"));
    setup();
    await screen.findByText("{{topic}}");

    await user.click(screen.getByRole("button", { name: "Add to tests" }));

    expect(
      await screen.findByText(
        "Could not read the values from these traces. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(mockConvert).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Some traces are missing a value"),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled();
  });

  it("shows its own line, not the backend's, when a refusal for missing values cannot be explained", async () => {
    const user = setupUser();
    mockFetchAgentEvals.mockResolvedValue([MAPPED]);
    mockConvert.mockRejectedValue(
      new Error(
        `Request failed: 400 - ${JSON.stringify({
          detail: {
            message: "Pass skip_missing_values to continue.",
            missing: [{ trace_id: "tr-9", evaluator_id: "ev-vars" }],
          },
        })}`,
      ),
    );
    // The re-read finds the value after all.
    mockValues.mockResolvedValue([
      {
        trace_id: "tr-9",
        evaluator_id: "ev-vars",
        values: [{ variable: "topic", source: "input", value: "order" }],
      },
    ]);
    setup({ selectAll: { agentId: "ag-1" } as never, traceCount: 40 });
    await screen.findByText("{{topic}}");

    await user.click(screen.getByRole("button", { name: "Add to tests" }));

    expect(
      await screen.findByText(
        "Something went wrong while adding to tests. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/skip_missing_values/)).not.toBeInTheDocument();
  });

  it("tells the page once one is set up", async () => {
    const user = setupUser();
    const onEvaluatorSetUp = jest.fn();
    setup({ fromTrace: { uuid: "tr-1" } as never, onEvaluatorSetUp });
    await screen.findByText("Needs Variables");

    await user.click(evaluatorCheckbox("Needs Variables"));
    await user.click(
      screen.getByRole("button", { name: "save mapping from tr-1" }),
    );

    await waitFor(() => expect(onEvaluatorSetUp).toHaveBeenCalledTimes(1));
  });
});
