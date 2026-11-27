import { render, screen, setupUser, waitFor } from "@/test-utils";
import { TraceLabellingEvaluatorsDialog } from "../TraceLabellingEvaluatorsDialog";
import {
  addEvaluatorsToAgent,
  fetchAgentEvaluators,
  fetchAllEvaluators,
  saveEvaluatorTraceVariables,
} from "@/lib/evaluatorApi";
import { fetchTraceVariableValues } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

jest.mock("../../../lib/evaluatorApi", () => ({
  __esModule: true,
  // Keep the real helpers: the create flow this dialog opens uses several of
  // them, and listing each one by hand breaks whenever a new one is added.
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchAllEvaluators: jest.fn(),
  fetchAgentEvaluators: jest.fn(),
  addEvaluatorsToAgent: jest.fn(),
  saveEvaluatorTraceVariables: jest.fn(),
  hasEvaluatorVariables: () => false,
  isDefaultEvaluator: (e: { is_default?: boolean | null }) => !!e.is_default,
  isOwnedEvaluator: (e: { is_default?: boolean | null }) => !e.is_default,
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
jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  fetchTraceVariableValues: jest.fn(),
}));
jest.mock("../../agent-tabs/TraceVariablesDialog", () => ({
  __esModule: true,
  // The mapping window has its own tests; here only what it saves matters.
  TraceVariablesDialog: ({
    title,
    evaluators,
    onSave,
    onClose,
  }: {
    title: string;
    evaluators: { uuid: string }[];
    onSave: (uuid: string, map: Record<string, string>) => Promise<void>;
    onClose: () => void;
  }) => (
    <div>
      <p>{title}</p>
      <button
        type="button"
        onClick={async () => {
          await onSave(evaluators[0].uuid, { topic: "input" }).catch(() => {});
          onClose();
        }}
      >
        save mapping
      </button>
    </div>
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
const mockAdd = addEvaluatorsToAgent as jest.Mock;
const mockSave = saveEvaluatorTraceVariables as jest.Mock;
const mockValues = fetchTraceVariableValues as jest.Mock;
const mockReportError = reportError as jest.Mock;

const VARS = {
  uuid: "ev-vars",
  name: "Topic judge",
  evaluator_type: "llm",
  is_default: false,
  live_version: { variables: [{ name: "topic" }] },
};
const TRACES = [
  { uuid: "tr-1", label: "Where is my order" },
  { uuid: "tr-2", label: "Cancel it" },
];
const valuesFor = (topics: (string | null)[]) =>
  topics.map((value, i) => ({
    trace_id: `tr-${i + 1}`,
    evaluator_id: "ev-vars",
    values: [{ variable: "topic", source: "input", value }],
  }));

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
];

function setup(
  overrides: Partial<
    React.ComponentProps<typeof TraceLabellingEvaluatorsDialog>
  > = {},
) {
  const onChosen = jest.fn();
  const onClose = jest.fn();
  render(
    <TraceLabellingEvaluatorsDialog
      isOpen
      onClose={onClose}
      agentUuid="ag-1"
      accessToken="tok"
      traces={[]}
      onChosen={onChosen}
      {...overrides}
    />,
  );
  return { onChosen, onClose };
}

beforeEach(() => {
  mockFetchEvals.mockReset();
  mockFetchEvals.mockResolvedValue(EVALUATORS);
  mockFetchAgentEvals.mockReset();
  mockFetchAgentEvals.mockResolvedValue([]);
  mockAdd.mockReset();
  mockAdd.mockResolvedValue({ linked: ["ev-vars"], already_linked: [] });
  mockSave.mockReset();
  mockSave.mockResolvedValue(undefined);
  mockValues.mockReset();
  mockValues.mockResolvedValue([]);
  mockReportError.mockReset();
});

it("renders nothing when closed and never fetches", () => {
  const { container } = render(
    <TraceLabellingEvaluatorsDialog
      isOpen={false}
      onClose={jest.fn()}
      agentUuid="ag-1"
      accessToken="tok"
      traces={[]}
      onChosen={jest.fn()}
    />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(mockFetchEvals).not.toHaveBeenCalled();
});

it("offers exactly two actions", async () => {
  setup();
  await waitFor(() =>
    expect(screen.getByText("Correctness")).toBeInTheDocument(),
  );
  // Footer keeps exactly the two actions. The body also carries the button
  // that makes a new evaluator, and each row the one that opens its prompt.
  expect(
    screen
      .getAllByRole("button")
      .filter(
        (b) =>
          !b.className.includes("flex-1 text-left") &&
          b.textContent !== "Create evaluator",
      ),
  ).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Create evaluator" }),
  ).toBeInTheDocument();
});

it("hands back the picked evaluators", async () => {
  const user = setupUser();
  const { onChosen } = setup();
  await waitFor(() => expect(screen.getByText("My Judge")).toBeInTheDocument());

  await user.click(screen.getByRole("checkbox", { name: /My Judge/ }));
  await user.click(screen.getByRole("button", { name: "Continue" }));

  expect(onChosen).toHaveBeenCalledWith(
    [
      { uuid: "ev-default", name: "Correctness" },
      { uuid: "ev-custom", name: "My Judge" },
    ],
    {},
  );
  expect(mockValues).not.toHaveBeenCalled();
});

it("cannot continue until an evaluator is picked", async () => {
  const user = setupUser();
  setup();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled(),
  );

  await user.click(screen.getByRole("checkbox", { name: /Correctness/ }));

  expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
});

it("offers making an evaluator when none can judge this agent", async () => {
  const user = setupUser();
  mockFetchEvals.mockResolvedValue([]);
  setup({ agentNature: "general" });

  expect(
    await screen.findByText(
      /Your workspace has none that score a single output/,
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Evaluators page/)).not.toBeInTheDocument();
  // The list heading has nothing under it, so it stays away.
  expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Create evaluator" }));

  // The making-an-evaluator journey opens over this dialog.
  expect(
    screen.getByRole("button", { name: "finish creating" }),
  ).toBeInTheDocument();
});

it("ticks an evaluator made here and opens its prompt on the right", async () => {
  const user = setupUser();
  setup();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled(),
  );

  await user.click(screen.getByRole("button", { name: "Create evaluator" }));
  await user.click(screen.getByRole("button", { name: "finish creating" }));

  const box = screen.getByRole("checkbox", { name: "Select Made just now" });
  expect(box).toBeChecked();
  // Its prompt is what the right-hand column is showing.
  expect(screen.getByTestId("prompt-for")).toHaveTextContent("ev-made");
});

describe("an evaluator with variables", () => {
  it("is set up from its row, linked to the agent, then ticked", async () => {
    const user = setupUser();
    mockFetchEvals.mockResolvedValue([...EVALUATORS, VARS]);
    mockValues.mockResolvedValue(valuesFor(["order", "cancel"]));
    setup({ traces: TRACES });
    await screen.findByText("Topic judge");

    // Ticking it opens the set-up instead.
    await user.click(screen.getByRole("checkbox", { name: /Topic judge/ }));
    expect(screen.getByText("Set up the variables")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "save mapping" }));

    expect(mockAdd).toHaveBeenCalledWith("ag-1", ["ev-vars"], "tok");
    expect(mockSave).toHaveBeenCalledWith(
      "ag-1",
      "ev-vars",
      { topic: "input" },
      "tok",
    );
    expect(
      screen.getByRole("checkbox", { name: /Topic judge/ }),
    ).toBeChecked();
    expect(
      screen.queryByRole("button", { name: "Set up variables" }),
    ).not.toBeInTheDocument();
    // Its values for the picked traces show beside its prompt.
    expect(await screen.findByText("order")).toBeInTheDocument();
    expect(screen.getByText("Where is my order")).toBeInTheDocument();
    expect(mockValues).toHaveBeenCalledWith(
      "tok",
      "ag-1",
      ["tr-1", "tr-2"],
      ["ev-vars"],
    );
  });

  it("opens the set-up from its button, without linking one already linked", async () => {
    const user = setupUser();
    mockFetchEvals.mockResolvedValue([VARS]);
    mockFetchAgentEvals.mockResolvedValue([{ uuid: "ev-vars" }]);
    setup({ traces: TRACES });

    await user.click(
      await screen.findByRole("button", { name: "Set up variables" }),
    );
    await user.click(screen.getByRole("button", { name: "save mapping" }));

    await waitFor(() => expect(mockSave).toHaveBeenCalled());
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("hands back each trace's values", async () => {
    const user = setupUser();
    mockFetchEvals.mockResolvedValue([
      { ...VARS, trace_variables: undefined },
    ]);
    mockFetchAgentEvals.mockResolvedValue([
      { uuid: "ev-vars", trace_variables: { topic: "input" } },
    ]);
    mockValues.mockResolvedValue(valuesFor(["order", "cancel"]));
    const { onChosen } = setup({ traces: TRACES });
    await screen.findByText("order");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(onChosen).toHaveBeenCalledWith(
        [{ uuid: "ev-vars", name: "Topic judge" }],
        {
          "tr-1": { "ev-vars": { topic: "order" } },
          "tr-2": { "ev-vars": { topic: "cancel" } },
        },
      ),
    );
  });

  it("asks first when a trace has no value, then leaves it blank", async () => {
    const user = setupUser();
    mockFetchEvals.mockResolvedValue([VARS]);
    mockFetchAgentEvals.mockResolvedValue([
      { uuid: "ev-vars", trace_variables: { topic: "input" } },
    ]);
    mockValues.mockResolvedValue(valuesFor(["order", null]));
    const { onChosen } = setup({ traces: TRACES });
    await screen.findByText("order");

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Some traces are missing a value"),
    ).toBeInTheDocument();
    expect(onChosen).not.toHaveBeenCalled();

    // Back leaves the window as it was.
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(
      screen.queryByText("Some traces are missing a value"),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    await user.click(
      await screen.findByRole("button", { name: "Add with them blank" }),
    );
    expect(onChosen).toHaveBeenCalledWith(
      [{ uuid: "ev-vars", name: "Topic judge" }],
      {
        "tr-1": { "ev-vars": { topic: "order" } },
        "tr-2": { "ev-vars": { topic: "" } },
      },
    );
  });

  it("says so when the values cannot be read", async () => {
    const user = setupUser();
    mockFetchEvals.mockResolvedValue([VARS]);
    mockFetchAgentEvals.mockResolvedValue([
      { uuid: "ev-vars", trace_variables: { topic: "input" } },
    ]);
    mockValues.mockRejectedValue(new Error("boom"));
    const { onChosen } = setup({ traces: TRACES });
    await screen.findByText("Topic judge");

    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(
      await screen.findByText(
        "Could not read the values from the traces. Please try again.",
      ),
    ).toBeInTheDocument();
    expect(onChosen).not.toHaveBeenCalled();
    expect(mockReportError).toHaveBeenCalled();
  });
});
