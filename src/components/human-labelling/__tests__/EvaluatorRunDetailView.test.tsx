import React from "react";
import { render, screen, setupUser } from "@/test-utils";

// AnnotationJobView pulls in canvas-confetti and backend API helpers that
// are irrelevant to this presentational view; stub ItemPane with a simple
// marker so ItemDetailPane/EvaluatorRunDetailView tests stay focused on
// their own logic (pagination, filtering, evaluator card rendering).
jest.mock("../AnnotationJobView", () => ({
  __esModule: true,
  ItemPane: ({ item }: { item: { uuid: string } }) => (
    <div data-testid="item-pane">{item.uuid}</div>
  ),
}));

import {
  EvaluatorRunDetailView,
  EvaluatorResultsPane,
  ItemDetailPane,
  evaluatorDisplayName,
  snapshotToItem,
  orderedSnapshotsForRun,
  statusPillClass,
  statusLabel,
  formatAgreement,
  runOutputType,
  valuesComparable,
  valuesMatchOutput,
  computeInterAnnotatorAgreement,
  computeEvaluatorHumanAgreement,
  isBelowFullEvaluatorAgreement,
  agreementExportCell,
  extractEvaluatorVariables,
  exportInputCols,
  serializeMessages,
  extractPayloadInputValues,
  annotatorDisplayName,
  type EvaluatorRunJob,
  type LabellingTaskFull,
  type EvaluatorRunRow,
  type JobEvaluator,
  type HumanAgreementItemEvaluator,
  type HumanAnnotation,
} from "../EvaluatorRunDetailView";

// ---------------------------------------------------------------------------
// Pure helper functions
// ---------------------------------------------------------------------------

describe("evaluatorDisplayName", () => {
  it("prefers the run's own name", () => {
    expect(
      evaluatorDisplayName({ evaluator_id: "abc12345", name: "Own Name" }, {}),
    ).toBe("Own Name");
  });
  it("falls back to the lookup map", () => {
    expect(
      evaluatorDisplayName(
        { evaluator_id: "abc12345" },
        { abc12345: "Looked Up" },
      ),
    ).toBe("Looked Up");
  });
  it("falls back to a truncated uuid when nothing else is available", () => {
    expect(
      evaluatorDisplayName({ evaluator_id: "abcdefghij" }, {}),
    ).toBe("abcdefgh");
  });
  it("ignores blank names", () => {
    expect(
      evaluatorDisplayName(
        { evaluator_id: "abcdefghij", name: "   " },
        { abcdefghij: "Real" },
      ),
    ).toBe("Real");
  });
});

describe("snapshotToItem", () => {
  it("maps a snapshot to an Item shape", () => {
    const item = snapshotToItem({ uuid: "u1", payload: { a: 1 } }, "task-1");
    expect(item).toEqual({
      id: 0,
      uuid: "u1",
      task_id: "task-1",
      payload: { a: 1 },
      created_at: "",
      deleted_at: null,
    });
  });
});

describe("orderedSnapshotsForRun", () => {
  const baseJob = (overrides: Partial<EvaluatorRunJob>): EvaluatorRunJob => ({
    uuid: "job1",
    task_id: "task1",
    status: "completed",
    details: null,
    error: null,
    created_at: "",
    updated_at: "",
    completed_at: null,
    runs: [],
    ...overrides,
  });

  it("returns empty array when there are no items", () => {
    expect(orderedSnapshotsForRun(baseJob({ items: [] }))).toEqual([]);
  });

  it("orders by details.item_ids when present", () => {
    const job = baseJob({
      items: [
        { uuid: "b", payload: {} },
        { uuid: "a", payload: {} },
      ],
      details: { item_ids: ["a", "b"] },
    });
    const out = orderedSnapshotsForRun(job);
    expect(out.map((s) => s.uuid)).toEqual(["a", "b"]);
  });

  it("synthesizes a placeholder snapshot for an id missing from items", () => {
    const job = baseJob({
      items: [{ uuid: "a", payload: { x: 1 } }],
      details: { item_ids: ["a", "missing"] },
    });
    const out = orderedSnapshotsForRun(job);
    expect(out).toEqual([
      { uuid: "a", payload: { x: 1 } },
      { uuid: "missing", payload: {} },
    ]);
  });

  it("falls back to run item_id order when no details.item_ids", () => {
    const job = baseJob({
      items: [
        { uuid: "b", payload: {} },
        { uuid: "a", payload: {} },
      ],
      runs: [
        { uuid: "r1", job_id: "job1", item_id: "a", evaluator_id: "e1", evaluator_version_id: "v1", value: null, status: "completed", created_at: "", completed_at: null },
        { uuid: "r2", job_id: "job1", item_id: "b", evaluator_id: "e1", evaluator_version_id: "v1", value: null, status: "completed", created_at: "", completed_at: null },
        { uuid: "r3", job_id: "job1", item_id: "a", evaluator_id: "e2", evaluator_version_id: "v1", value: null, status: "completed", created_at: "", completed_at: null },
      ],
    });
    const out = orderedSnapshotsForRun(job);
    expect(out.map((s) => s.uuid)).toEqual(["a", "b"]);
  });

  it("appends any remaining snapshots not seen via ids/runs", () => {
    const job = baseJob({
      items: [
        { uuid: "a", payload: {} },
        { uuid: "leftover", payload: {} },
      ],
      details: { item_ids: ["a"] },
    });
    const out = orderedSnapshotsForRun(job);
    expect(out.map((s) => s.uuid)).toEqual(["a", "leftover"]);
  });

  it("caps the result at details.item_count", () => {
    const job = baseJob({
      items: [
        { uuid: "a", payload: {} },
        { uuid: "b", payload: {} },
        { uuid: "c", payload: {} },
      ],
      details: { item_count: 2 },
    });
    const out = orderedSnapshotsForRun(job);
    expect(out.map((s) => s.uuid)).toEqual(["a", "b"]);
  });
});

describe("statusPillClass / statusLabel", () => {
  it.each([
    ["completed", "Completed"],
    ["failed", "Failed"],
    ["in_progress", "In progress"],
    ["queued", "Queued"],
  ] as const)("%s maps to a class and label", (status, label) => {
    expect(statusPillClass(status)).toEqual(expect.any(String));
    expect(statusLabel(status)).toBe(label);
  });

  it("statusLabel returns the raw value for an unknown status", () => {
    expect(statusLabel("weird" as never)).toBe("weird");
  });

  it("statusPillClass returns the default class for an unknown status", () => {
    expect(statusPillClass("weird" as never)).toContain("gray");
  });
});

describe("formatAgreement", () => {
  it("renders an em dash for null/undefined", () => {
    expect(formatAgreement(null)).toBe("—");
    expect(formatAgreement(undefined)).toBe("—");
  });
  it("renders a percentage with one decimal", () => {
    expect(formatAgreement(0.856)).toBe("85.6%");
  });
});

describe("runOutputType", () => {
  it("returns binary when run value is boolean", () => {
    const run = { value: { value: true } } as EvaluatorRunRow;
    expect(runOutputType(run)).toBe("binary");
  });
  it("returns rating when run value is a number", () => {
    const run = { value: { value: 3 } } as EvaluatorRunRow;
    expect(runOutputType(run)).toBe("rating");
  });
  it("falls back to evaluator.output_type=rating when run has no value", () => {
    const evaluator = { output_type: "rating" } as JobEvaluator;
    expect(runOutputType(undefined, evaluator)).toBe("rating");
  });
  it("defaults to binary when nothing else applies", () => {
    expect(runOutputType(undefined, null)).toBe("binary");
  });
});

describe("valuesComparable / valuesMatchOutput", () => {
  it("binary: both booleans are comparable", () => {
    expect(valuesComparable(true, false, "binary")).toBe(true);
    expect(valuesComparable(true, 1, "binary")).toBe(false);
  });
  it("rating: both finite numbers are comparable", () => {
    expect(valuesComparable(1, 2, "rating")).toBe(true);
    expect(valuesComparable(1, NaN, "rating")).toBe(false);
    expect(valuesComparable("1", 2, "rating")).toBe(false);
  });
  it("valuesMatchOutput returns false when not comparable", () => {
    expect(valuesMatchOutput(true, 1, "binary")).toBe(false);
  });
  it("valuesMatchOutput returns true only on equality", () => {
    expect(valuesMatchOutput(true, true, "binary")).toBe(true);
    expect(valuesMatchOutput(3, 4, "rating")).toBe(false);
  });
});

describe("computeInterAnnotatorAgreement", () => {
  const mkAnn = (v: unknown): HumanAnnotation => ({
    annotation_id: Math.random().toString(),
    annotator_id: Math.random().toString(),
    annotator_name: null,
    job_id: "j",
    value: { value: v },
    updated_at: "",
  });

  it("returns null with fewer than 2 comparable values", () => {
    expect(computeInterAnnotatorAgreement([mkAnn(true)], "binary")).toBeNull();
  });
  it("computes agreement fraction across pairs", () => {
    const anns = [mkAnn(true), mkAnn(true), mkAnn(false)];
    // pairs: (T,T) agree, (T,F) disagree, (T,F) disagree => 1/3
    expect(computeInterAnnotatorAgreement(anns, "binary")).toBeCloseTo(1 / 3);
  });
  it("filters out non-comparable values before pairing", () => {
    const anns = [mkAnn(true), mkAnn("weird"), mkAnn(false)];
    // only true/false remain comparable -> disagree -> 0
    expect(computeInterAnnotatorAgreement(anns, "binary")).toBe(0);
  });
  it("returns null when no comparable pairs exist", () => {
    const anns = [mkAnn(1), mkAnn(true)];
    expect(computeInterAnnotatorAgreement(anns, "binary")).toBeNull();
  });
});

describe("computeEvaluatorHumanAgreement", () => {
  const mkAnn = (v: unknown): HumanAnnotation => ({
    annotation_id: "a",
    annotator_id: "ann1",
    annotator_name: null,
    job_id: "j",
    value: { value: v },
    updated_at: "",
  });

  it("returns null when nothing is comparable", () => {
    expect(computeEvaluatorHumanAgreement([mkAnn("x")], true, "binary")).toBeNull();
  });
  it("computes fraction aligned with the machine value", () => {
    const anns = [mkAnn(true), mkAnn(false), mkAnn(true)];
    expect(computeEvaluatorHumanAgreement(anns, true, "binary")).toBeCloseTo(2 / 3);
  });
});

describe("isBelowFullEvaluatorAgreement", () => {
  it("false when no data", () => {
    expect(isBelowFullEvaluatorAgreement(undefined)).toBe(false);
  });
  it("false when there are no human annotations", () => {
    expect(
      isBelowFullEvaluatorAgreement({
        evaluator_id: "e",
        agreement: 0.5,
        pair_count: 0,
        human_annotations: [],
      }),
    ).toBe(false);
  });
  it("true when agreement is below 1 with annotations present", () => {
    const data: HumanAgreementItemEvaluator = {
      evaluator_id: "e",
      agreement: 0.5,
      pair_count: 1,
      human_annotations: [
        {
          annotation_id: "a",
          annotator_id: "ann",
          annotator_name: null,
          job_id: "j",
          value: { value: true },
          updated_at: "",
        },
      ],
    };
    expect(isBelowFullEvaluatorAgreement(data)).toBe(true);
  });
});

describe("agreementExportCell", () => {
  it("prefers the API value when defined (even null)", () => {
    expect(agreementExportCell(null, 0.5)).toBe("—");
    expect(agreementExportCell(0.75, null)).toBe("75.0%");
  });
  it("falls back to the computed value when API value is undefined", () => {
    expect(agreementExportCell(undefined, 0.25)).toBe("25.0%");
  });
});

describe("extractEvaluatorVariables", () => {
  it("returns {} for non-object payload", () => {
    expect(extractEvaluatorVariables(null)).toEqual({});
    expect(extractEvaluatorVariables("x")).toEqual({});
  });
  it("returns {} when evaluator_variables missing or not an object", () => {
    expect(extractEvaluatorVariables({})).toEqual({});
    expect(extractEvaluatorVariables({ evaluator_variables: "x" })).toEqual({});
  });
  it("flattens string and non-string values, skipping non-object entries", () => {
    const out = extractEvaluatorVariables({
      evaluator_variables: {
        ev1: { a: "hello", b: 5, c: null },
        ev2: "not-an-object",
        ev3: {},
      },
    });
    expect(out).toEqual({ ev1: { a: "hello", b: "5" } });
  });
});

describe("exportInputCols", () => {
  it("returns stt cols", () => {
    expect(exportInputCols("stt")).toEqual([
      "reference_transcript",
      "predicted_transcript",
    ]);
  });
  it("returns tts cols", () => {
    expect(exportInputCols("tts")).toEqual(["text", "audio_path"]);
  });
  it("returns llm cols", () => {
    expect(exportInputCols("llm")).toEqual([
      "conversation_history",
      "agent_response",
    ]);
  });
  it("returns transcript col for other types", () => {
    expect(exportInputCols("conversation")).toEqual(["transcript"]);
    expect(exportInputCols("llm-general")).toEqual(["transcript"]);
  });
});

describe("serializeMessages", () => {
  it("serializes plain content messages", () => {
    expect(
      serializeMessages([{ role: "user", content: "hi" }]),
    ).toBe("user: hi");
  });
  it("serializes tool_calls messages", () => {
    const out = serializeMessages([
      {
        role: "assistant",
        tool_calls: [
          { function: { name: "lookup", arguments: '{"q":"x"}' } },
        ],
      },
    ]);
    expect(out).toBe('assistant (tool_call): lookup({"q":"x"})');
  });
  it("skips falsy / non-object messages", () => {
    expect(serializeMessages([null, undefined, "str", { role: "user", content: "ok" }])).toBe(
      "user: ok",
    );
  });
  it("defaults role to 'unknown' and content to empty string", () => {
    expect(serializeMessages([{}])).toBe("unknown: ");
  });
});

describe("extractPayloadInputValues", () => {
  it("extracts stt transcripts", () => {
    expect(
      extractPayloadInputValues(
        { reference_transcript: "ref", predicted_transcript: "pred" },
        "stt",
      ),
    ).toEqual(["ref", "pred"]);
  });
  it("defaults missing stt fields to empty strings", () => {
    expect(extractPayloadInputValues({}, "stt")).toEqual(["", ""]);
  });
  it("extracts tts text + audio path", () => {
    expect(
      extractPayloadInputValues(
        { text: "say hi", audio_path: "https://x/a.wav" },
        "tts",
      ),
    ).toEqual(["say hi", "https://x/a.wav"]);
  });
  it("defaults missing tts fields to empty strings", () => {
    expect(extractPayloadInputValues({}, "tts")).toEqual(["", ""]);
  });
  it("extracts llm history + response", () => {
    const out = extractPayloadInputValues(
      {
        chat_history: [{ role: "user", content: "hi" }],
        agent_response: "hello",
      },
      "llm",
    );
    expect(out).toEqual(["user: hi", "hello"]);
  });
  it("defaults llm fields when missing/malformed", () => {
    expect(extractPayloadInputValues({ chat_history: "not-array" }, "llm")).toEqual([
      "",
      "",
    ]);
  });
  it("extracts a serialized transcript for conversation/other types", () => {
    const out = extractPayloadInputValues(
      { transcript: [{ role: "user", content: "hey" }] },
      "conversation",
    );
    expect(out).toEqual(["user: hey"]);
  });
  it("handles a non-object payload gracefully", () => {
    expect(extractPayloadInputValues(null, "stt")).toEqual(["", ""]);
  });
});

describe("annotatorDisplayName", () => {
  it("uses annotator_name when present", () => {
    expect(
      annotatorDisplayName({ annotator_name: "Jane", annotator_id: "abcdefgh12" }),
    ).toBe("Jane");
  });
  it("falls back to a truncated id", () => {
    expect(
      annotatorDisplayName({ annotator_name: null, annotator_id: "abcdefgh12" }),
    ).toBe("abcdefgh");
  });
  it("falls back to id when name is blank", () => {
    expect(
      annotatorDisplayName({ annotator_name: "   ", annotator_id: "abcdefgh12" }),
    ).toBe("abcdefgh");
  });
});

// ---------------------------------------------------------------------------
// Fixtures for component tests
// ---------------------------------------------------------------------------

const evaluatorBinary: JobEvaluator = {
  uuid: "ev-bin",
  name: "Binary Evaluator",
  description: "Checks correctness",
  output_type: "binary",
  evaluator_version_id: "v-bin-1",
  version_number: 1,
  scale_min: null,
  scale_max: null,
  output_config: null,
  variables: null,
};

const evaluatorRating: JobEvaluator = {
  uuid: "ev-rate",
  name: "Rating Evaluator",
  description: "Rates quality",
  output_type: "rating",
  evaluator_version_id: "v-rate-1",
  version_number: 1,
  scale_min: 1,
  scale_max: 5,
  output_config: null,
  variables: null,
};

function makeJob(overrides: Partial<EvaluatorRunJob> = {}): EvaluatorRunJob {
  return {
    uuid: "job-1",
    task_id: "task-1",
    status: "completed",
    details: null,
    error: null,
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
    completed_at: "2024-01-01",
    evaluators: [evaluatorBinary],
    runs: [],
    items: [
      { uuid: "item-1", payload: { name: "Item One" } },
      { uuid: "item-2", payload: { name: "Item Two" } },
    ],
    ...overrides,
  };
}

function makeTask(overrides: Partial<LabellingTaskFull> = {}): LabellingTaskFull {
  return {
    uuid: "task-1",
    name: "Task",
    type: "llm",
    description: null,
    evaluators: [{ uuid: "ev-bin", name: "Binary Evaluator" }],
    items: [],
    ...overrides,
  };
}

function makeRun(overrides: Partial<EvaluatorRunRow> = {}): EvaluatorRunRow {
  return {
    uuid: "run-1",
    job_id: "job-1",
    item_id: "item-1",
    evaluator_id: "ev-bin",
    evaluator_version_id: "v-bin-1",
    value: { value: true, reasoning: "Looked correct" },
    status: "completed",
    created_at: "",
    completed_at: "",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// EvaluatorRunDetailView
// ---------------------------------------------------------------------------

describe("EvaluatorRunDetailView", () => {
  it("returns null for an unsupported task type", () => {
    const { container } = render(
      <EvaluatorRunDetailView
        job={makeJob()}
        task={makeTask({ type: "mystery" as never })}
        versionLabels={{}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the status pill and item counter, no items case", () => {
    render(
      <EvaluatorRunDetailView
        job={makeJob({ items: [], runs: [] })}
        task={makeTask()}
        versionLabels={{}}
      />,
    );
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("No items in this run.")).toBeInTheDocument();
  });

  it("hides the status pill when hideStatusPill is set and no slots given", () => {
    render(
      <EvaluatorRunDetailView
        job={makeJob({ items: [], runs: [] })}
        task={makeTask()}
        versionLabels={{}}
        hideStatusPill
      />,
    );
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("still renders the header row when hideStatusPill is set but a slot is given", () => {
    render(
      <EvaluatorRunDetailView
        job={makeJob({ items: [], runs: [] })}
        task={makeTask()}
        versionLabels={{}}
        hideStatusPill
        shareSlot={<span>Share!</span>}
      />,
    );
    expect(screen.getByText("Share!")).toBeInTheDocument();
    expect(screen.queryByText("Completed")).not.toBeInTheDocument();
  });

  it("renders topError banner", () => {
    render(
      <EvaluatorRunDetailView
        job={makeJob({ items: [], runs: [] })}
        task={makeTask()}
        versionLabels={{}}
        topError="Export failed"
      />,
    );
    expect(screen.getByText("Export failed")).toBeInTheDocument();
  });

  it("renders actionsSlot on the header row", () => {
    render(
      <EvaluatorRunDetailView
        job={makeJob({ items: [], runs: [] })}
        task={makeTask()}
        versionLabels={{}}
        actionsSlot={<button>Export</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
  });

  it("renders the failed banner with the job error when status is failed", () => {
    render(
      <EvaluatorRunDetailView
        job={makeJob({ status: "failed", error: "boom", items: [], runs: [] })}
        task={makeTask()}
        versionLabels={{}}
      />,
    );
    expect(screen.getByText("Run failed")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("navigates between items with Previous/Next and shows item name", () => {
    const job = makeJob({
      runs: [makeRun({ item_id: "item-1" }), makeRun({ uuid: "run-2", item_id: "item-2" })],
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    expect(screen.getByText("Item One")).toBeInTheDocument();
    expect(screen.getByText("Item 1 of 2")).toBeInTheDocument();
    const prev = screen.getByRole("button", { name: "Previous" });
    const next = screen.getByRole("button", { name: "Next" });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it("Next/Previous buttons move currentIndex and disable at bounds", async () => {
    const user = setupUser();
    const job = makeJob({
      runs: [makeRun({ item_id: "item-1" }), makeRun({ uuid: "run-2", item_id: "item-2" })],
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Item Two")).toBeInTheDocument();
    expect(screen.getByText("Item 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Item One")).toBeInTheDocument();
  });

  it("selecting an item from the desktop sidebar grid updates the current item", async () => {
    const user = setupUser();
    const job = makeJob();
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    // Two "2" buttons exist (mobile grid + desktop grid); click the last one.
    const buttons = screen.getAllByRole("button", { name: "2" });
    await user.click(buttons[buttons.length - 1]);
    expect(screen.getByText("Item Two")).toBeInTheDocument();
  });

  it("marks an item as done (blue) only when every evaluator run for it is completed and job is completed", () => {
    const job = makeJob({
      evaluators: [evaluatorBinary],
      runs: [makeRun({ item_id: "item-1", status: "completed" })],
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    const doneButtons = screen.getAllByTitle("Item 1 (completed)");
    expect(doneButtons.length).toBeGreaterThan(0);
    expect(screen.queryByTitle("Item 2 (completed)")).not.toBeInTheDocument();
  });

  it("shows the disagreement filter toggle only when disagreements exist, and filters items", async () => {
    const user = setupUser();
    const job = makeJob({
      runs: [makeRun({ item_id: "item-1" }), makeRun({ uuid: "run-2", item_id: "item-2" })],
      human_agreement: {
        evaluators: [
          { evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1", agreement: 0.5, pair_count: 1, item_count: 1 },
        ],
        items: [
          {
            item_id: "item-1",
            annotator_count: 1,
            evaluators: [
              {
                evaluator_id: "ev-bin",
                agreement: 0,
                pair_count: 1,
                human_annotations: [
                  {
                    annotation_id: "a1",
                    annotator_id: "ann1",
                    annotator_name: "Annotator One",
                    job_id: "job-1",
                    value: { value: false },
                    updated_at: "",
                  },
                ],
              },
            ],
          },
          { item_id: "item-2", annotator_count: 0, evaluators: [] },
        ],
      },
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    const toggle = screen.getByRole("button", { name: "Show disagreements only" });
    expect(screen.getByText("Item 1 of 2")).toBeInTheDocument();
    await user.click(toggle);
    expect(screen.getByText("Showing disagreements only")).toBeInTheDocument();
    expect(screen.getByText("Item 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Item One")).toBeInTheDocument();
  });

  it("does not show the disagreement toggle when there are no disagreements", () => {
    const job = makeJob({
      runs: [makeRun({ item_id: "item-1" })],
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    expect(
      screen.queryByRole("button", { name: "Show disagreements only" }),
    ).not.toBeInTheDocument();
  });

  it("renders the top-level evaluator pill row (linked) when no agreement cards will render", () => {
    const job = makeJob({ runs: [], items: [] });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{ "v-bin-1": "v1" }} linkEvaluators />,
    );
    const link = screen.getByRole("link", { name: /Binary Evaluator/i });
    expect(link).toHaveAttribute("href", "/evaluators/ev-bin");
    expect(screen.getByText("v1")).toBeInTheDocument();
  });

  it("renders the top-level evaluator pill row as plain text when linkEvaluators=false", () => {
    const job = makeJob({ runs: [], items: [] });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} linkEvaluators={false} />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Binary Evaluator")).toBeInTheDocument();
  });

  it("shows an em dash placeholder when there are no evaluators at all", () => {
    const job = makeJob({ evaluators: [], runs: [] });
    render(
      <EvaluatorRunDetailView
        job={job}
        task={makeTask({ evaluators: [] })}
        versionLabels={{}}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the 'no human labels yet' banner when agreement data exists but is empty", () => {
    const job = makeJob({
      runs: [makeRun()],
      human_agreement: {
        evaluators: [
          { evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1", agreement: null, pair_count: 0, item_count: 0 },
        ],
        items: [],
      },
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    expect(
      screen.getByText(/No human labels found on the items in this run yet/),
    ).toBeInTheDocument();
  });

  it("renders human agreement stat cards when agreement data is present", () => {
    const job = makeJob({
      runs: [makeRun()],
      human_agreement: {
        evaluators: [
          { evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1", agreement: 0.8, pair_count: 2, item_count: 1 },
        ],
        items: [
          {
            item_id: "item-1",
            annotator_count: 1,
            evaluators: [
              {
                evaluator_id: "ev-bin",
                agreement: 0.8,
                pair_count: 2,
                human_annotations: [
                  {
                    annotation_id: "a1",
                    annotator_id: "ann1",
                    annotator_name: "Ann",
                    job_id: "job-1",
                    value: { value: true },
                    updated_at: "",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{ "v-bin-1": "v1" }} />,
    );
    expect(screen.getByText("Human agreement")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("does not render the human agreement summary while the job is still in progress", () => {
    const job = makeJob({
      status: "in_progress",
      human_agreement: {
        evaluators: [
          { evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1", agreement: 0.8, pair_count: 2, item_count: 1 },
        ],
        items: [],
      },
    });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    expect(screen.queryByText("Human agreement")).not.toBeInTheDocument();
  });

  it("shows a spinner for evaluators that haven't produced a run yet while job is running", () => {
    const job = makeJob({ status: "in_progress", runs: [] });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    expect(screen.getByText("Running evaluator")).toBeInTheDocument();
  });

  it("shows a 'no result recorded' error when the job is completed but an evaluator has no run for the item", () => {
    const job = makeJob({ status: "completed", runs: [] });
    render(
      <EvaluatorRunDetailView job={job} task={makeTask()} versionLabels={{}} />,
    );
    expect(screen.getByText("No result recorded for this item.")).toBeInTheDocument();
  });

  it("falls back to task.items via job.details.item_ids when job.items is absent", () => {
    const job = makeJob({
      items: undefined,
      details: { item_ids: ["t-2"] },
      runs: [],
    });
    const task = makeTask({
      items: [
        { id: 1, uuid: "t-1", task_id: "task-1", payload: { name: "Task Item 1" }, created_at: "", deleted_at: null },
        { id: 2, uuid: "t-2", task_id: "task-1", payload: { name: "Task Item 2" }, created_at: "", deleted_at: null },
      ],
    });
    render(<EvaluatorRunDetailView job={job} task={task} versionLabels={{}} />);
    expect(screen.getByText("Task Item 2")).toBeInTheDocument();
  });

  it("falls back to task.items filtered by run item_ids when no details.item_ids", () => {
    const job = makeJob({
      items: undefined,
      details: null,
      runs: [makeRun({ item_id: "t-1" })],
    });
    const task = makeTask({
      items: [
        { id: 1, uuid: "t-1", task_id: "task-1", payload: { name: "Task Item 1" }, created_at: "", deleted_at: null },
        { id: 2, uuid: "t-2", task_id: "task-1", payload: { name: "Task Item 2" }, created_at: "", deleted_at: null },
      ],
    });
    render(<EvaluatorRunDetailView job={job} task={task} versionLabels={{}} />);
    expect(screen.getByText("Task Item 1")).toBeInTheDocument();
    expect(screen.getByText("Item 1 of 1")).toBeInTheDocument();
  });

  it("falls back to all of task.items capped by item_count when nothing else narrows it", () => {
    const job = makeJob({ items: undefined, details: { item_count: 1 }, runs: [] });
    const task = makeTask({
      items: [
        { id: 1, uuid: "t-1", task_id: "task-1", payload: { name: "Only Item" }, created_at: "", deleted_at: null },
        { id: 2, uuid: "t-2", task_id: "task-1", payload: { name: "Second Item" }, created_at: "", deleted_at: null },
      ],
    });
    render(<EvaluatorRunDetailView job={job} task={task} versionLabels={{}} />);
    expect(screen.getByText("Item 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Only Item")).toBeInTheDocument();
  });

  it("renders human agreement stat cards as plain (unlinked) pills when linkEvaluators is false", () => {
    const job = makeJob({
      runs: [makeRun()],
      human_agreement: {
        evaluators: [
          { evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1", agreement: 0.8, pair_count: 2, item_count: 1 },
        ],
        items: [
          {
            item_id: "item-1",
            annotator_count: 1,
            evaluators: [
              {
                evaluator_id: "ev-bin",
                agreement: 0.8,
                pair_count: 2,
                human_annotations: [
                  {
                    annotation_id: "a1",
                    annotator_id: "ann1",
                    annotator_name: "Ann",
                    job_id: "job-1",
                    value: { value: true },
                    updated_at: "",
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    render(
      <EvaluatorRunDetailView
        job={job}
        task={makeTask()}
        versionLabels={{ "v-bin-1": "v1" }}
        linkEvaluators={false}
      />,
    );
    expect(screen.getByText("Binary Evaluator v1")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// EvaluatorResultsPane (direct)
// ---------------------------------------------------------------------------

describe("EvaluatorResultsPane", () => {
  const baseProps = {
    evaluatorNamesById: { "ev-bin": "Binary Evaluator" },
    getJobEvaluator: () => evaluatorBinary,
    versionLabels: {},
    jobStatus: "completed" as const,
    humanAgreementForItem: null,
    evaluatorVariablesByEvaluatorId: {},
    filterDisagreements: false,
    linkEvaluators: true,
  };

  it("shows an empty state when there are no evaluators", () => {
    render(
      <EvaluatorResultsPane {...baseProps} evaluators={[]} runs={[]} />,
    );
    expect(screen.getByText("No evaluators in this run.")).toBeInTheDocument();
  });

  it("renders the item description when provided", () => {
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[]}
        runs={[]}
        itemDescription="  Some description  "
      />,
    );
    expect(screen.getByText("Some description")).toBeInTheDocument();
  });

  it("renders a comments block with pills that switch the active comment", async () => {
    const user = setupUser();
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[]}
        runs={[]}
        itemComments={[
          { annotator_id: "a1", annotator_name: "Alice", comment: "Great job" },
          { annotator_id: "a2", annotator_name: "Bob", comment: "Needs work" },
        ]}
      />,
    );
    expect(screen.getByText("Comments")).toBeInTheDocument();
    expect(screen.getByText("Great job")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bob" }));
    expect(screen.getByText("Needs work")).toBeInTheDocument();
  });

  it("hides comment pills when singleAnnotatorFiltered is true", () => {
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[]}
        runs={[]}
        singleAnnotatorFiltered
        itemComments={[
          { annotator_id: "a1", annotator_name: "Alice", comment: "Great job" },
        ]}
      />,
    );
    expect(screen.queryByRole("button", { name: "Alice" })).not.toBeInTheDocument();
    expect(screen.getByText("Great job")).toBeInTheDocument();
  });

  it("renders a rating evaluator's score/max pill in read mode", () => {
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-rate", evaluator_version_id: "v-rate-1" }]}
        evaluatorNamesById={{ "ev-rate": "Rating Evaluator" }}
        getJobEvaluator={() => evaluatorRating}
        runs={[
          makeRun({
            evaluator_id: "ev-rate",
            evaluator_version_id: "v-rate-1",
            value: { value: 4 },
          }),
        ]}
      />,
    );
    expect(screen.getByText("Rating Evaluator")).toBeInTheDocument();
    expect(screen.getByText("4 / 5")).toBeInTheDocument();
  });

  it("renders a card in read mode for a completed run", () => {
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
      />,
    );
    expect(screen.getByText("Binary Evaluator")).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("shows disagreements-only empty state", () => {
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
        filterDisagreements
        humanAgreementForItem={null}
      />,
    );
    expect(
      screen.getByText("All evaluators agree with human annotations on this item."),
    ).toBeInTheDocument();
  });

  it("renders source pills for evaluator vs annotator and switches selection + shows agreement glyph", async () => {
    const user = setupUser();
    const humanAgreementForItem = {
      item_id: "item-1",
      annotator_count: 1,
      evaluators: [
        {
          evaluator_id: "ev-bin",
          agreement: 0,
          pair_count: 1,
          human_annotations: [
            {
              annotation_id: "ann-a1",
              annotator_id: "a1",
              annotator_name: "Alice",
              job_id: "job-1",
              value: { value: false },
              reasoning: "Alice's reasoning",
              updated_at: "",
            },
          ],
        },
      ],
    };
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
        humanAgreementForItem={humanAgreementForItem}
      />,
    );
    // Evaluator pill selected by default -> shows "Correct".
    expect(screen.getByText("Correct")).toBeInTheDocument();
    const alicePill = screen.getByRole("button", { name: "Alice" });
    await user.click(alicePill);
    expect(screen.getByText("Wrong")).toBeInTheDocument();
  });

  it("hides the agreement glyph when hideAgreementGlyph is set", () => {
    const humanAgreementForItem = {
      item_id: "item-1",
      annotator_count: 1,
      evaluators: [
        {
          evaluator_id: "ev-bin",
          agreement: 1,
          pair_count: 1,
          human_annotations: [
            {
              annotation_id: "ann-a1",
              annotator_id: "a1",
              annotator_name: "Alice",
              job_id: "job-1",
              value: { value: true },
              updated_at: "",
            },
          ],
        },
      ],
    };
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
        humanAgreementForItem={humanAgreementForItem}
        hideAgreementGlyph
      />,
    );
    expect(
      screen.queryByLabelText("Annotators agree with evaluator"),
    ).not.toBeInTheDocument();
  });

  it("defaults selection to the first annotator when the evaluator produced no value", () => {
    const humanAgreementForItem = {
      item_id: "item-1",
      annotator_count: 1,
      evaluators: [
        {
          evaluator_id: "ev-bin",
          agreement: null,
          pair_count: 0,
          human_annotations: [
            {
              annotation_id: "ann-a1",
              annotator_id: "a1",
              annotator_name: "Alice",
              job_id: "job-1",
              value: { value: true },
              updated_at: "",
            },
          ],
        },
      ],
    };
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun({ value: { value: null } })]}
        humanAgreementForItem={humanAgreementForItem}
        alwaysShowSourcePills
      />,
    );
    expect(screen.queryByRole("button", { name: "Evaluator" })).not.toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("always shows source pills when alwaysShowSourcePills is set, even with no humans", () => {
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
        alwaysShowSourcePills
      />,
    );
    expect(screen.getByRole("button", { name: "Evaluator" })).toBeInTheDocument();
  });

  it("shows version label in the source pill when showVersionInSourcePill is set", () => {
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
        alwaysShowSourcePills
        showVersionInSourcePill
        versionLabels={{ "v-bin-1": "v9" }}
      />,
    );
    expect(screen.getByText("v9")).toBeInTheDocument();
  });

  it("renders grouped evaluator cards with version pills when groupVersionsByEvaluator is set", async () => {
    const user = setupUser();
    const getJobEvaluator = (key: { evaluator_id: string; evaluator_version_id?: string }) =>
      key.evaluator_version_id === "v-bin-2"
        ? { ...evaluatorBinary, evaluator_version_id: "v-bin-2" }
        : evaluatorBinary;
    render(
      <EvaluatorResultsPane
        {...baseProps}
        getJobEvaluator={getJobEvaluator}
        evaluators={[
          { evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" },
          { evaluator_id: "ev-bin", evaluator_version_id: "v-bin-2" },
        ]}
        runs={[
          makeRun({ value: { value: true } }),
          makeRun({ uuid: "run-2", evaluator_version_id: "v-bin-2", value: { value: false } }),
        ]}
        versionLabels={{ "v-bin-1": "v1", "v-bin-2": "v2" }}
        groupVersionsByEvaluator
      />,
    );
    expect(screen.getByText("Correct")).toBeInTheDocument();
    const v2Pill = screen.getByText("v2").closest("button")!;
    await user.click(v2Pill);
    expect(screen.getByText("Wrong")).toBeInTheDocument();
  });

  it("shows the perfect agreement glyph when the evaluator matches all human annotators", () => {
    const humanAgreementForItem = {
      item_id: "item-1",
      annotator_count: 1,
      evaluators: [
        {
          evaluator_id: "ev-bin",
          agreement: 1,
          pair_count: 1,
          human_annotations: [
            {
              annotation_id: "ann-a1",
              annotator_id: "a1",
              annotator_name: "Alice",
              job_id: "job-1",
              value: { value: true },
              updated_at: "",
            },
          ],
        },
      ],
    };
    render(
      <EvaluatorResultsPane
        {...baseProps}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
        humanAgreementForItem={humanAgreementForItem}
      />,
    );
    expect(
      screen.getByLabelText("Annotators agree with evaluator"),
    ).toBeInTheDocument();
  });

  it("grouped cards hide the solitary annotator pill when the parent filter has narrowed to one annotator", () => {
    const getJobEvaluator = () => evaluatorBinary;
    const humanAgreementForItem = {
      item_id: "item-1",
      annotator_count: 1,
      evaluators: [
        {
          evaluator_id: "ev-bin",
          agreement: 1,
          pair_count: 1,
          human_annotations: [
            {
              annotation_id: "ann-a1",
              annotator_id: "a1",
              annotator_name: "Alice",
              job_id: "job-1",
              value: { value: true },
              updated_at: "",
            },
          ],
        },
      ],
    };
    render(
      <EvaluatorResultsPane
        {...baseProps}
        getJobEvaluator={getJobEvaluator}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun()]}
        humanAgreementForItem={humanAgreementForItem}
        groupVersionsByEvaluator
        annotatorFilterActive
      />,
    );
    expect(screen.queryByRole("button", { name: "Alice" })).not.toBeInTheDocument();
    // The evaluator version pill still shows since it has a value.
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("grouped cards fall back to an annotator when no version has a value", () => {
    const getJobEvaluator = () => evaluatorBinary;
    const humanAgreementForItem = {
      item_id: "item-1",
      annotator_count: 1,
      evaluators: [
        {
          evaluator_id: "ev-bin",
          agreement: null,
          pair_count: 0,
          human_annotations: [
            {
              annotation_id: "ann-a1",
              annotator_id: "a1",
              annotator_name: "Alice",
              job_id: "job-1",
              value: { value: true },
              updated_at: "",
            },
          ],
        },
      ],
    };
    render(
      <EvaluatorResultsPane
        {...baseProps}
        getJobEvaluator={getJobEvaluator}
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        runs={[makeRun({ value: { value: null } })]}
        humanAgreementForItem={humanAgreementForItem}
        groupVersionsByEvaluator
      />,
    );
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// ItemDetailPane (direct)
// ---------------------------------------------------------------------------

describe("ItemDetailPane", () => {
  it("renders ItemPane and EvaluatorResultsPane side by side", () => {
    render(
      <ItemDetailPane
        item={{ id: 0, uuid: "item-1", task_id: "task-1", payload: { description: "Desc here" }, created_at: "", deleted_at: null }}
        taskType="llm"
        evaluators={[{ evaluator_id: "ev-bin", evaluator_version_id: "v-bin-1" }]}
        evaluatorNamesById={{ "ev-bin": "Binary Evaluator" }}
        getJobEvaluator={() => evaluatorBinary}
        runs={[makeRun()]}
        versionLabels={{}}
        jobStatus="completed"
        humanAgreementForItem={null}
        evaluatorVariablesByEvaluatorId={{}}
      />,
    );
    expect(screen.getByTestId("item-pane")).toHaveTextContent("item-1");
    expect(screen.getByText("Desc here")).toBeInTheDocument();
    expect(screen.getByText("Binary Evaluator")).toBeInTheDocument();
  });
});
