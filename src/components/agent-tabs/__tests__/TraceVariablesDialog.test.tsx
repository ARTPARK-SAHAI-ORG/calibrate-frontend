import { render, screen, waitFor, within, setupUser } from "@/test-utils";
import { TraceVariablesDialog } from "../TraceVariablesDialog";
import type { EvaluatorData } from "@/lib/evaluatorApi";
import {
  fetchTrace,
  fetchTraces,
  previewTraceVariables,
  type TraceDetail,
  type TraceSummary,
} from "@/lib/tracesApi";

jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  ...jest.requireActual("../../../lib/tracesApi"),
  fetchTraces: jest.fn(),
  fetchTrace: jest.fn(),
  previewTraceVariables: jest.fn(),
}));

const mockFetchTraces = fetchTraces as jest.Mock;
const mockFetchTrace = fetchTrace as jest.Mock;
const mockPreview = previewTraceVariables as jest.Mock;

const LATEST: TraceDetail = {
  uuid: "t1",
  agent_id: "agent-1",
  message_id: null,
  conversation_id: null,
  input: "My child has loose motions",
  output: { response: "Give fluids and ORS" },
  metadata: [
    { key: "expert_answer", value: "Give ORS after every stool" },
    { key: "language", value: "Hindi" },
  ],
  labels: ["pilot", "hindi"],
  created_at: "2026-11-26T10:00:00Z",
  updated_at: "2026-11-26T10:00:00Z",
};

const evaluator = (
  traceVariables?: Record<string, string> | null,
  over: Partial<EvaluatorData> = {},
): EvaluatorData => ({
  uuid: "ev-1",
  name: "Agrees with the nurse",
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  live_version: { variables: [{ name: "nurse_reply" }, { name: "language" }] },
  trace_variables: traceVariables,
  ...over,
});

function withTraces(latest: TraceDetail | null = LATEST) {
  mockFetchTraces.mockResolvedValue({
    items: latest
      ? [
          {
            uuid: latest.uuid,
            created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
            input_preview: "My child has loose motions",
          },
          {
            uuid: "t2",
            created_at: new Date(Date.now() - 30 * 3600_000).toISOString(),
            input_preview: "Can I give honey?",
          },
        ]
      : [],
  });
  if (latest) mockFetchTrace.mockResolvedValue(latest);
}

beforeEach(() => {
  localStorage.setItem("access_token", "tok");
  mockFetchTraces.mockReset();
  mockFetchTrace.mockReset();
  mockPreview.mockReset();
  withTraces();
});
afterEach(() => localStorage.removeItem("access_token"));

function setup({
  evaluators = [evaluator()],
  agentNature = "general",
  onSave = jest.fn().mockResolvedValue(undefined),
  fromTrace,
}: {
  evaluators?: EvaluatorData[];
  agentNature?: "conversation" | "general";
  onSave?: jest.Mock;
  fromTrace?: TraceSummary;
} = {}) {
  const onClose = jest.fn();
  const user = setupUser();
  render(
    <TraceVariablesDialog
      agentUuid="agent-1"
      agentNature={agentNature}
      evaluators={evaluators}
      fromTrace={fromTrace}
      onClose={onClose}
      onSave={onSave}
    />,
  );
  return { user, onClose, onSave };
}

const source = (name: string) =>
  screen.getByRole("button", { name: `Source for ${name}` });
const keyList = (name: string) =>
  screen.getByRole("button", { name: `Metadata key list for ${name}` });
const keyInput = (name: string) =>
  screen.getByLabelText(`Metadata key for ${name}`);
const button = (name: string) => screen.getByRole("button", { name });
const options = () =>
  screen.getAllByRole("option").map((o) => o.textContent);
const code = () => screen.getByTestId("trace-send-code");
const highlighted = () =>
  Array.from(code().querySelectorAll("[data-highlighted]")).map(
    (l) => l.textContent,
  );
const loaded = () => screen.findByRole("button", { name: "Source for nurse_reply" });

async function pick(
  user: ReturnType<typeof setupUser>,
  control: HTMLElement,
  optionName: string,
) {
  await user.click(control);
  await user.click(
    within(screen.getByRole("listbox")).getByRole("option", {
      name: new RegExp(`^${optionName}`),
    }),
  );
}

it("lists every part of a trace with its value in the latest trace", async () => {
  const { user } = setup();
  await loaded();
  await waitFor(() => expect(mockFetchTrace).toHaveBeenCalledWith("tok", "t1"));

  await user.click(source("nurse_reply"));

  expect(screen.getByText("Values from your latest trace")).toBeInTheDocument();
  expect(options()).toEqual([
    "InputMy child has loose motions",
    "OutputGive fluids and ORS",
    "Tool callsNot in the latest trace",
    "Labelspilot, hindi",
    "Metadataexpert_answer, language",
  ]);
  expect(screen.getByText("Not in the latest trace")).toHaveClass("italic");
});

it("lists a conversation agent's parts by their names for it", async () => {
  const { user } = setup({ agentNature: "conversation" });
  await loaded();
  await user.click(source("nurse_reply"));

  expect(
    screen.getAllByRole("option").map((o) => o.firstChild?.firstChild?.textContent),
  ).toEqual([
    "Conversation",
    "Agent reply",
    "Tool calls",
    "Labels",
    "Conversation ID",
    "Message ID",
    "Metadata",
  ]);
});

it("offers the latest trace's metadata keys, and a typed key under Other key", async () => {
  const { user, onSave } = setup();
  await loaded();
  await waitFor(() => expect(mockFetchTrace).toHaveBeenCalled());

  await pick(user, source("nurse_reply"), "Metadata");
  expect(keyList("nurse_reply")).toHaveTextContent("Choose a key");

  await user.click(keyList("nurse_reply"));
  expect(options()).toEqual([
    "expert_answerGive ORS after every stool",
    "languageHindi",
    "Other key",
  ]);
  await user.click(screen.getByRole("option", { name: /^expert_answer/ }));
  expect(keyList("nurse_reply")).toHaveTextContent("expert_answer");

  await pick(user, source("language"), "Metadata");
  await pick(user, keyList("language"), "Other key");
  expect(keyList("language")).toHaveTextContent("Other key");
  expect(keyInput("language")).toHaveAttribute(
    "placeholder",
    "Type a metadata key",
  );
  expect(button("Next")).toBeDisabled();

  await user.type(keyInput("language"), "lang");
  expect(button("Next")).toBeEnabled();

  mockPreview.mockResolvedValue({ values: [] });
  await user.click(button("Next"));
  await user.click(button("Save"));
  expect(onSave).toHaveBeenCalledWith("ev-1", {
    nurse_reply: "metadata.expert_answer",
    language: "metadata.lang",
  });
});

it("asks for a typed key when the latest trace has no metadata", async () => {
  withTraces({ ...LATEST, metadata: null });
  const { user } = setup();
  await loaded();
  await waitFor(() => expect(mockFetchTrace).toHaveBeenCalled());

  await pick(user, source("nurse_reply"), "Metadata");

  expect(
    screen.queryByRole("button", { name: "Metadata key list for nurse_reply" }),
  ).not.toBeInTheDocument();
  expect(keyInput("nurse_reply")).toBeInTheDocument();
});

it("keeps Next off until every variable has a value, and a key for Metadata", async () => {
  const { user } = setup();
  await loaded();
  expect(button("Next")).toBeDisabled();
  expect(
    screen.getByRole("button", { name: /Test on a trace/ }),
  ).toBeDisabled();

  await pick(user, source("nurse_reply"), "Output");
  expect(button("Next")).toBeDisabled();

  await pick(user, source("language"), "Metadata");
  expect(button("Next")).toBeDisabled();

  await pick(user, keyList("language"), "language");
  expect(button("Next")).toBeEnabled();
});

it("shows the metadata entries the code must send, with the latest trace's values", async () => {
  const { user } = setup();
  await loaded();
  await waitFor(() => expect(mockFetchTrace).toHaveBeenCalled());

  expect(code()).toHaveTextContent('"response": "..."');
  expect(code()).toHaveTextContent('"tool_calls": [...]');
  expect(code()).not.toHaveTextContent("metadata");
  expect(highlighted()).toEqual([]);

  await pick(user, source("nurse_reply"), "Metadata");
  await pick(user, keyList("nurse_reply"), "language");
  await pick(user, source("language"), "Metadata");
  await pick(user, keyList("language"), "Other key");
  await user.type(keyInput("language"), "district");

  expect(highlighted()).toEqual([
    '    "metadata": [',
    '      {"key": "language", "value": "Hindi"},',
    '      {"key": "district", "value": "..."}',
    "    ]",
  ]);

  await user.click(button("JavaScript"));
  expect(highlighted()[1]).toBe('      { key: "language", value: "Hindi" },');
});

it("opens again on the saved choices", async () => {
  setup({
    evaluators: [
      evaluator({
        nurse_reply: "metadata.expert_answer",
        language: "metadata.lang_code",
      }),
    ],
  });
  await loaded();
  await waitFor(() => expect(mockFetchTrace).toHaveBeenCalled());

  expect(source("nurse_reply")).toHaveTextContent("Metadata");
  expect(keyList("nurse_reply")).toHaveTextContent("expert_answer");
  // A saved key the latest trace does not have is typed.
  expect(keyList("language")).toHaveTextContent("Other key");
  expect(keyInput("language")).toHaveValue("lang_code");
  expect(button("Next")).toBeEnabled();
});

it("still shows a saved value this agent's list does not offer", async () => {
  const { user } = setup({
    evaluators: [evaluator({ nurse_reply: "message_id", language: "labels" })],
  });
  await loaded();

  expect(source("nurse_reply")).toHaveTextContent("Message ID");
  await user.click(source("nurse_reply"));
  expect(screen.getAllByRole("option").at(-1)).toHaveTextContent("Message ID");
});

describe("with no traces", () => {
  beforeEach(() => withTraces(null));

  it("is one step, with no callout and no stepper, and saves", async () => {
    const { user, onSave, onClose } = setup();
    await loaded();

    expect(
      screen.queryByText(/Applies to new traces only/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Test on a trace")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(button("Save")).toBeDisabled();

    await user.click(source("nurse_reply"));
    expect(
      screen.queryByText("Values from your latest trace"),
    ).not.toBeInTheDocument();
    expect(options()).toEqual([
      "Input",
      "Output",
      "Tool calls",
      "Labels",
      "Metadata",
    ]);
    await user.click(screen.getByRole("option", { name: "Input" }));
    await pick(user, source("language"), "Metadata");
    await user.type(keyInput("language"), " lang ");
    await user.click(button("Save"));

    expect(onSave).toHaveBeenCalledWith("ev-1", {
      nurse_reply: "input",
      language: "metadata.lang",
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockFetchTrace).not.toHaveBeenCalled();
  });

  it("is one step too when the traces cannot be loaded", async () => {
    mockFetchTraces.mockRejectedValue(new Error("down"));
    setup();
    await loaded();
    expect(button("Save")).toBeInTheDocument();
  });
});

describe("testing on a trace", () => {
  const chosen = { nurse_reply: "metadata.expert_answer", language: "metadata.language" };

  it("shows what the evaluator gets from the chosen trace", async () => {
    mockPreview.mockResolvedValue({
      values: [
        { variable: "nurse_reply", source: chosen.nurse_reply, value: "Give ORS" },
        { variable: "language", source: chosen.language, value: "Hindi" },
      ],
    });
    const { user } = setup({ evaluators: [evaluator(chosen)] });
    await loaded();

    expect(
      screen.getByText("Applies to new traces only. Existing traces are not scored again."),
    ).toBeInTheDocument();
    await user.click(button("Next"));

    // Nothing is chosen until the user picks a trace.
    expect(button("Select a trace")).toHaveTextContent("Choose a trace");
    expect(
      screen.queryByText("What the evaluator will be given from this trace"),
    ).not.toBeInTheDocument();
    expect(mockPreview).not.toHaveBeenCalled();

    await pick(user, button("Select a trace"), "Input My child has loose motions");
    expect(await screen.findByText("Give ORS")).toBeInTheDocument();
    expect(screen.getByText("Hindi")).toBeInTheDocument();
    expect(mockPreview).toHaveBeenCalledWith("tok", "agent-1", "t1", chosen);
    expect(button("Select a trace")).toHaveTextContent(
      "InputMy child has loose motions2 min ago",
    );

    await pick(user, button("Select a trace"), "Input Can I give honey");
    await waitFor(() =>
      expect(mockPreview).toHaveBeenLastCalledWith("tok", "agent-1", "t2", chosen),
    );
    expect(button("Select a trace")).toHaveTextContent("Yesterday");
  });

  it("warns about a value the trace does not have", async () => {
    mockPreview.mockResolvedValue({
      values: [
        { variable: "nurse_reply", source: "labels", value: null },
        { variable: "language", source: chosen.language, value: null },
      ],
    });
    const { user } = setup({
      evaluators: [evaluator({ nurse_reply: "labels", language: chosen.language })],
    });
    await loaded();
    await user.click(button("Next"));
    await pick(user, button("Select a trace"), "Input My child has loose motions");

    expect(
      await screen.findByText("This trace has no labels"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This trace has no metadata entry called/),
    ).toHaveTextContent("This trace has no metadata entry called language");
    expect(
      screen.getByText(/This evaluator will not score traces like this one/),
    ).toHaveTextContent(
      "This evaluator will not score traces like this one. Send the labels in each trace and a language entry in each trace's metadata, or go back to the first step and choose a different value.",
    );

    await user.click(button("Back"));
    expect(source("nurse_reply")).toHaveTextContent("Labels");
  });

  it("shows a failed save at the top and stays open", async () => {
    mockPreview.mockResolvedValue({ values: [] });
    const { user, onClose } = setup({
      evaluators: [evaluator(chosen)],
      onSave: jest.fn().mockRejectedValue(new Error("Unknown trace value")),
    });
    await loaded();
    await user.click(button("Next"));
    await user.click(button("Save"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unknown trace value");
    expect(
      alert.compareDocumentPosition(screen.getByText("Select a trace")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(button("Save")).toBeEnabled();
  });

  it("says a general error when the failure has no message", async () => {
    mockPreview.mockResolvedValue({ values: [] });
    const { user } = setup({
      evaluators: [evaluator(chosen)],
      onSave: jest.fn().mockRejectedValue("nope"),
    });
    await loaded();
    await user.click(button("Next"));
    await user.click(button("Save"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to save trace values",
    );
  });
});

it("cannot be closed while saving, and closes from the header or outside", async () => {
  withTraces(null);
  let finish = () => {};
  const { user, onClose } = setup({
    evaluators: [evaluator({ nurse_reply: "input", language: "labels" })],
    onSave: jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    ),
  });
  await loaded();
  expect(screen.getAllByRole("button", { name: "Close" })).toHaveLength(1);

  await user.click(button("Save"));
  expect(button("Saving...")).toBeDisabled();
  expect(button("Close")).toBeDisabled();

  finish();
  await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));

  const backdrop = screen
    .getByRole("heading", { name: "Configure for traces" })
    .closest(".fixed") as HTMLElement;
  await user.click(backdrop);
  await user.click(button("Close"));
  expect(onClose).toHaveBeenCalledTimes(3);
});

describe("several evaluators", () => {
  const alpha = () => evaluator(null, { uuid: "a", name: "Alpha" });
  const bravo = () =>
    evaluator({ nurse_reply: "input", language: "labels" }, { uuid: "b", name: "Bravo" });
  const charlie = () =>
    evaluator({ nurse_reply: "input" }, { uuid: "c", name: "Charlie" });

  beforeEach(() => withTraces(null));

  it("shows one at a time, moving to the next missing one after each save", async () => {
    const { user, onSave, onClose } = setup({
      evaluators: [bravo(), alpha(), charlie()],
    });
    await loaded();

    expect(screen.getByText("Evaluator 2 of 3: Alpha")).toBeInTheDocument();
    expect(source("nurse_reply")).toHaveTextContent("Not set");

    await pick(user, source("nurse_reply"), "Input");
    await pick(user, source("language"), "Labels");
    await user.click(button("Save and next"));

    expect(
      await screen.findByText("Evaluator 3 of 3: Charlie"),
    ).toBeInTheDocument();
    expect(onSave).toHaveBeenLastCalledWith("a", {
      nurse_reply: "input",
      language: "labels",
    });
    expect(source("nurse_reply")).toHaveTextContent("Input");
    expect(source("language")).toHaveTextContent("Not set");

    await pick(user, source("language"), "Output");
    await user.click(button("Save"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

it("reads from and tests on the trace it was opened from", async () => {
  const opened = {
    uuid: "t2",
    created_at: new Date(Date.now() - 30 * 3600_000).toISOString(),
    input_preview: "Can I give honey?",
  } as TraceSummary;
  mockFetchTrace.mockResolvedValue({ ...LATEST, uuid: "t2" });
  mockPreview.mockResolvedValue({ values: [] });
  const { user } = setup({
    evaluators: [evaluator({ nurse_reply: "input", language: "labels" })],
    fromTrace: opened,
  });
  await loaded();
  await waitFor(() => expect(mockFetchTrace).toHaveBeenCalledWith("tok", "t2"));

  await user.click(source("nurse_reply"));
  expect(await screen.findByText("Values from this trace")).toBeInTheDocument();
  await user.keyboard("{Escape}");

  await user.click(screen.getByRole("button", { name: "Next" }));
  expect(
    screen.getByText(/The trace you opened this from is selected\./),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Select a trace" }),
  ).toHaveTextContent("Can I give honey?");
  await waitFor(() =>
    expect(mockPreview).toHaveBeenCalledWith(
      "tok",
      "agent-1",
      "t2",
      expect.anything(),
    ),
  );
});
