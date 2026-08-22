import { render, screen, setupUser, waitFor } from "@/test-utils";
import { ConvertTracesToTestsDialog } from "../ConvertTracesToTestsDialog";
import { fetchAgentEvaluators, fetchAllEvaluators } from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { convertTracesToTests } from "@/lib/tracesApi";

jest.mock("../../../lib/evaluatorApi", () => ({
  __esModule: true,
  // Keep the real helpers: the create flow this dialog opens uses several of
  // them, and listing each one by hand breaks whenever a new one is added.
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchAllEvaluators: jest.fn(),
  fetchAgentEvaluators: jest.fn(),
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
}));
jest.mock("../../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchEvals = fetchAllEvaluators as jest.Mock;
const mockFetchAgentEvals = fetchAgentEvaluators as jest.Mock;
const mockConvert = convertTracesToTests as jest.Mock;
const mockReportError = reportError as jest.Mock;

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

it("lists only llm evaluators without variables, and preselects the default LLM-reply one", async () => {
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
  // An evaluator whose prompt expects variables is not offered at all.
  expect(screen.queryByText("Needs Variables")).not.toBeInTheDocument();
  expect(evaluatorCheckbox("Correctness")).toBeChecked();
  // The default is preselected, so adding is enabled without further clicks.
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Add to tests" })).toBeEnabled(),
  );
  expect(mockFetchEvals).toHaveBeenCalledWith("tok");
  expect(mockFetchAgentEvals).toHaveBeenCalledWith("ag-1", "tok");
});

it("preselects the agent's own evaluators, skipping ones that need variables", async () => {
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
  expect(screen.queryByText("Needs Variables")).not.toBeInTheDocument();

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
        b.textContent !== "Create evaluator",
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
    traceIds: ["tr-1", "tr-2"],
    type: "response",
    evaluatorUuids: ["ev-default"],
    acceptAnyArguments: false,
  });
  // The evaluators the tests were given come back too, so the tab can offer
  // to attach any the agent does not have yet.
  expect(onConverted).toHaveBeenCalledWith(
    { created: 2, test_uuids: ["t1", "t2"] },
    [{ uuid: "ev-default", name: "Correctness" }],
  );
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
    traceIds: ["tr-1", "tr-2"],
    type: "tool_call",
    evaluatorUuids: undefined,
    acceptAnyArguments: false,
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
      traceIds: ["tr-1", "tr-2"],
      type: "general",
      evaluatorUuids: ["ev-general-default"],
      acceptAnyArguments: false,
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

  expect(
    screen.getByRole("heading", { name: "Add evaluator" }),
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
