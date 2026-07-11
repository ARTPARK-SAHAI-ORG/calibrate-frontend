import * as React from "react";
import {
  render,
  screen,
  setupUser,
  waitFor,
  renderHook,
  fireEvent,
  act,
} from "@/test-utils";
import {
  AnnotationOptIn,
  BulkUploadDialogShell,
  BulkUploadItemsPreviewShell,
  ChatHistoryPreview,
  ConversationFormatDetails,
  CsvDropzone,
  EvaluatorAnnotationColumnsHelp,
  FormatHelpToggle,
  bulkUploadAnnotatedRowBgClass,
  buildItemAnnotationsPayload,
  downloadCsvBlob,
  duplicateEvaluatorNames,
  evaluatorReasoningColumn,
  evaluatorValueColumn,
  findHeaderKey,
  generateGuidelinesPdf,
  humaniseDetailObject,
  parseAnnotationCell,
  parseApiError,
  roleLabel,
  rolePillClass,
  sampleEvaluatorValue,
  turnContentString,
  useAnnotatedItemsCheck,
  useAnnotators,
  type AnnotatedCheckResult,
  type Annotator,
  type EvaluatorMeta,
  type GuidelineDoc,
} from "../bulk-upload-shared";

// jspdf ships as ESM-only and Jest's transform can't parse it. We only need
// `generateGuidelinesPdf`'s own branching logic exercised (page breaks, code
// blocks, nested fields) — not real PDF rendering — so replace it with a
// minimal fake that records enough to assert against.
jest.mock("jspdf", () => {
  const addPageCalls: number[] = [];
  const textCalls: string[] = [];
  class FakeJsPDF {
    internal = {
      pageSize: {
        getWidth: () => 300,
        getHeight: () => 140, // small on purpose to force page breaks
      },
    };
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setFillColor() {}
    line() {}
    roundedRect() {}
    addPage() {
      addPageCalls.push(1);
    }
    text(t: string) {
      textCalls.push(t);
    }
    // Ignore the requested width and just chunk into short lines so long
    // text reliably produces several lines (exercises the per-line loop and
    // the `ensure()` page-break path). An empty input yields an empty array
    // (mirrors real jsPDF), exercising the `wrapped.length === 0` fallback
    // in `writeCodeBlock`.
    splitTextToSize(text: string) {
      const words = String(text).split(/\s+/).filter(Boolean);
      const lines: string[] = [];
      for (let i = 0; i < words.length; i += 3) {
        lines.push(words.slice(i, i + 3).join(" "));
      }
      return lines;
    }
    output(type: string) {
      return { __fakePdfOutput: type };
    }
  }
  return { jsPDF: FakeJsPDF, __addPageCalls: addPageCalls, __textCalls: textCalls };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const jspdfMock = require("jspdf") as {
  __addPageCalls: number[];
  __textCalls: string[];
};

jest.mock("../../../lib/api", () => ({
  apiClient: jest.fn(),
}));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { apiClient } = require("../../../lib/api") as { apiClient: jest.Mock };

beforeEach(() => {
  jspdfMock.__addPageCalls.length = 0;
  jspdfMock.__textCalls.length = 0;
  apiClient.mockReset();
});

// ─── Pure helpers ───────────────────────────────────────────────────────

describe("evaluatorValueColumn / evaluatorReasoningColumn", () => {
  it("namespaces under <name>/value and <name>/reasoning", () => {
    expect(evaluatorValueColumn("Correctness")).toBe("Correctness/value");
    expect(evaluatorReasoningColumn("Correctness")).toBe(
      "Correctness/reasoning",
    );
  });
});

describe("buildItemAnnotationsPayload", () => {
  it("returns undefined for an empty list", () => {
    expect(buildItemAnnotationsPayload([])).toBeUndefined();
  });

  it("builds a map keyed by evaluator_uuid", () => {
    const out = buildItemAnnotationsPayload([
      {
        evaluator_uuid: "ev-1",
        output_type: "binary",
        value: true,
        reasoning: "looks right",
      },
      {
        evaluator_uuid: "ev-2",
        output_type: "rating",
        value: 4,
        reasoning: "",
      },
    ]);
    expect(out).toEqual({
      "ev-1": { value: true, reasoning: "looks right" },
      "ev-2": { value: 4, reasoning: "" },
    });
  });
});

describe("duplicateEvaluatorNames", () => {
  it("returns an empty list when all names are unique", () => {
    expect(duplicateEvaluatorNames([{ name: "A" }, { name: "B" }])).toEqual(
      [],
    );
  });

  it("returns names that appear more than once", () => {
    expect(
      duplicateEvaluatorNames([
        { name: "A" },
        { name: "B" },
        { name: "A" },
        { name: "C" },
        { name: "C" },
      ]),
    ).toEqual(["A", "C"]);
  });
});

describe("sampleEvaluatorValue", () => {
  it("returns 'true' for binary evaluators", () => {
    expect(
      sampleEvaluatorValue({
        uuid: "1",
        name: "e",
        output_type: "binary",
        scale_min: null,
        scale_max: null,
      }),
    ).toBe("true");
  });

  it("returns the rounded midpoint for rating evaluators with a scale", () => {
    expect(
      sampleEvaluatorValue({
        uuid: "1",
        name: "e",
        output_type: "rating",
        scale_min: 1,
        scale_max: 4,
      }),
    ).toBe("3"); // round(2.5) => 3 (banker's-free JS rounding)
  });

  it("returns an empty string for rating without a scale", () => {
    expect(
      sampleEvaluatorValue({
        uuid: "1",
        name: "e",
        output_type: "rating",
        scale_min: null,
        scale_max: null,
      }),
    ).toBe("");
  });

  it("returns an empty string when output_type is null", () => {
    expect(
      sampleEvaluatorValue({
        uuid: "1",
        name: "e",
        output_type: null,
        scale_min: null,
        scale_max: null,
      }),
    ).toBe("");
  });
});

describe("parseAnnotationCell", () => {
  const binaryEval: EvaluatorMeta = {
    uuid: "1",
    name: "Passes",
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  };
  const ratingEval: EvaluatorMeta = {
    uuid: "2",
    name: "Score",
    output_type: "rating",
    scale_min: 1,
    scale_max: 5,
  };
  const ratingEvalNoScale: EvaluatorMeta = {
    uuid: "3",
    name: "ScoreNoRange",
    output_type: "rating",
    scale_min: null,
    scale_max: null,
  };
  const unsupportedEval: EvaluatorMeta = {
    uuid: "4",
    name: "Weird",
    output_type: null,
    scale_min: null,
    scale_max: null,
  };

  it.each(["true", "pass", "1", "yes", "TRUE", " Yes "])(
    "parses %s as true for binary",
    (raw) => {
      expect(parseAnnotationCell(raw, binaryEval)).toEqual({ value: true });
    },
  );

  it.each(["false", "fail", "0", "no"])(
    "parses %s as false for binary",
    (raw) => {
      expect(parseAnnotationCell(raw, binaryEval)).toEqual({ value: false });
    },
  );

  it("errors on an unrecognized binary value", () => {
    const result = parseAnnotationCell("maybe", binaryEval);
    expect("error" in result && result.error).toMatch(
      /expected "true"\/"pass" or "false"\/"fail"/,
    );
  });

  it("parses a numeric value within range for rating", () => {
    expect(parseAnnotationCell("3", ratingEval)).toEqual({ value: 3 });
  });

  it("errors on a non-numeric rating value", () => {
    const result = parseAnnotationCell("abc", ratingEval);
    expect("error" in result && result.error).toMatch(/expected a number/);
  });

  it("errors when the rating value is outside the scale", () => {
    const result = parseAnnotationCell("10", ratingEval);
    expect("error" in result && result.error).toMatch(
      /outside the 1–5 range/,
    );
  });

  it("accepts any finite number when no scale is configured", () => {
    expect(parseAnnotationCell("999", ratingEvalNoScale)).toEqual({
      value: 999,
    });
  });

  it("errors for an unsupported evaluator output type", () => {
    const result = parseAnnotationCell("x", unsupportedEval);
    expect("error" in result && result.error).toMatch(
      /unsupported evaluator type/,
    );
  });
});

describe("bulkUploadAnnotatedRowBgClass", () => {
  const check: AnnotatedCheckResult = {
    all_new: false,
    existing_with_annotations: [{ index: 1, name: "a" }],
    existing_without_annotations: [{ index: 2, name: "b" }],
  };

  it("returns '' when check is null", () => {
    expect(bulkUploadAnnotatedRowBgClass(0, null)).toBe("");
  });

  it("returns the red class for existing_with_annotations rows", () => {
    expect(bulkUploadAnnotatedRowBgClass(1, check)).toBe("bg-red-500/10");
  });

  it("returns the amber class for existing_without_annotations rows", () => {
    expect(bulkUploadAnnotatedRowBgClass(2, check)).toBe("bg-amber-500/10");
  });

  it("returns '' for rows not present in either list", () => {
    expect(bulkUploadAnnotatedRowBgClass(3, check)).toBe("");
  });
});

describe("humaniseDetailObject", () => {
  it("returns a generic ITEM_NAME_CONFLICT message with no names", () => {
    expect(humaniseDetailObject({ code: "ITEM_NAME_CONFLICT" })).toBe(
      "One or more item names already exist in this task.",
    );
  });

  it("returns a singular ITEM_NAME_CONFLICT message for one name", () => {
    expect(
      humaniseDetailObject({
        code: "ITEM_NAME_CONFLICT",
        conflicting_names: ["Foo"],
      }),
    ).toBe('An item named "Foo" already exists in this task.');
  });

  it("returns a plural ITEM_NAME_CONFLICT message for multiple names", () => {
    expect(
      humaniseDetailObject({
        code: "ITEM_NAME_CONFLICT",
        conflicting_names: ["Foo", "Bar"],
      }),
    ).toBe(
      'Items with these names already exist in this task: "Foo", "Bar".',
    );
  });

  it("returns a generic ITEM_NAME_DUPLICATE_IN_REQUEST message with no names", () => {
    expect(
      humaniseDetailObject({ code: "ITEM_NAME_DUPLICATE_IN_REQUEST" }),
    ).toBe("Your request contains duplicate item names.");
  });

  it("returns a singular ITEM_NAME_DUPLICATE_IN_REQUEST message", () => {
    expect(
      humaniseDetailObject({
        code: "ITEM_NAME_DUPLICATE_IN_REQUEST",
        conflicting_names: ["Foo"],
      }),
    ).toBe('Duplicate name in your request: "Foo".');
  });

  it("returns a plural ITEM_NAME_DUPLICATE_IN_REQUEST message", () => {
    expect(
      humaniseDetailObject({
        code: "ITEM_NAME_DUPLICATE_IN_REQUEST",
        conflicting_names: ["Foo", "Bar"],
      }),
    ).toBe('Duplicate names in your request: "Foo", "Bar".');
  });

  it("returns null for an unknown code", () => {
    expect(humaniseDetailObject({ code: "SOMETHING_ELSE" })).toBeNull();
  });

  it("returns null when no code is present", () => {
    expect(humaniseDetailObject({})).toBeNull();
  });
});

describe("parseApiError", () => {
  it("returns the fallback when err is not an Error", () => {
    expect(parseApiError("nope", "fallback")).toBe("fallback");
  });

  it("returns the raw message when it doesn't match the Request-failed pattern", () => {
    expect(parseApiError(new Error("network down"), "fallback")).toBe(
      "network down",
    );
  });

  it("returns the fallback for an empty Error message", () => {
    expect(parseApiError(new Error(""), "fallback")).toBe("fallback");
  });

  it("returns the raw captured text when it isn't JSON", () => {
    expect(
      parseApiError(new Error("Request failed: 500 - Server exploded"), "fb"),
    ).toBe("Server exploded");
  });

  it("returns detail when it's a plain string", () => {
    const err = new Error(
      `Request failed: 400 - ${JSON.stringify({ detail: "Bad name" })}`,
    );
    expect(parseApiError(err, "fb")).toBe("Bad name");
  });

  it("humanises a recognized detail object", () => {
    const err = new Error(
      `Request failed: 409 - ${JSON.stringify({
        detail: { code: "ITEM_NAME_CONFLICT", conflicting_names: ["X"] },
      })}`,
    );
    expect(parseApiError(err, "fb")).toBe(
      'An item named "X" already exists in this task.',
    );
  });

  it("falls back to the raw JSON when the detail object isn't recognized", () => {
    const payload = { detail: { code: "UNKNOWN" } };
    const err = new Error(`Request failed: 409 - ${JSON.stringify(payload)}`);
    expect(parseApiError(err, "fb")).toBe(JSON.stringify(payload));
  });
});

describe("findHeaderKey", () => {
  it("matches case-insensitively and ignoring whitespace", () => {
    expect(
      findHeaderKey(["Conversation History", "Name"], [
        "conversation_history",
      ]),
    ).toBe("Conversation History");
  });

  it("returns the first candidate that matches", () => {
    expect(findHeaderKey(["title"], ["name", "title"])).toBe("title");
  });

  it("returns null when nothing matches", () => {
    expect(findHeaderKey(["foo"], ["name"])).toBeNull();
  });
});

describe("turnContentString", () => {
  it("returns string content unchanged", () => {
    expect(turnContentString({ role: "user", content: "hi" })).toBe("hi");
  });

  it("returns '' for undefined content", () => {
    expect(turnContentString({ role: "user" })).toBe("");
  });

  it("returns '' for null content", () => {
    expect(turnContentString({ role: "user", content: null })).toBe("");
  });

  it("JSON.stringifies object content", () => {
    expect(
      turnContentString({ role: "tool", content: { a: 1 } }),
    ).toBe('{"a":1}');
  });

  it("falls back to String() when JSON.stringify throws", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(turnContentString({ role: "tool", content: circular })).toBe(
      String(circular),
    );
  });
});

describe("roleLabel", () => {
  it.each([
    ["user", "User"],
    ["assistant", "Agent"],
    ["system", "System"],
    ["tool", "Tool"],
    ["mystery", "mystery"],
  ])("maps %s to %s", (role, label) => {
    expect(roleLabel(role)).toBe(label);
  });
});

describe("rolePillClass", () => {
  it("returns distinct classes per known role and a default for unknown roles", () => {
    const classes = [
      rolePillClass("user"),
      rolePillClass("assistant"),
      rolePillClass("system"),
      rolePillClass("tool"),
      rolePillClass("other"),
    ];
    expect(new Set(classes).size).toBe(5);
    expect(rolePillClass("user")).toContain("blue");
    expect(rolePillClass("assistant")).toContain("purple");
    expect(rolePillClass("system")).toContain("amber");
    expect(rolePillClass("tool")).toContain("emerald");
    expect(rolePillClass("other")).toContain("bg-muted");
  });
});

// ─── Hooks ──────────────────────────────────────────────────────────────

describe("useAnnotatedItemsCheck", () => {
  it("does not call the API when disabled", () => {
    renderHook(() =>
      useAnnotatedItemsCheck({
        enabled: false,
        taskUuid: "t1",
        accessToken: "tok",
        annotatorId: "a1",
        namedItems: [{ name: "x" }],
      }),
    );
    expect(apiClient).not.toHaveBeenCalled();
  });

  it("does not call the API when annotatorId is null", () => {
    renderHook(() =>
      useAnnotatedItemsCheck({
        enabled: true,
        taskUuid: "t1",
        accessToken: "tok",
        annotatorId: null,
        namedItems: [{ name: "x" }],
      }),
    );
    expect(apiClient).not.toHaveBeenCalled();
  });

  it("does not call the API when namedItems is empty", () => {
    renderHook(() =>
      useAnnotatedItemsCheck({
        enabled: true,
        taskUuid: "t1",
        accessToken: "tok",
        annotatorId: "a1",
        namedItems: [],
      }),
    );
    expect(apiClient).not.toHaveBeenCalled();
  });

  it("fetches and populates the result when all conditions are met", async () => {
    const result: AnnotatedCheckResult = {
      all_new: true,
      existing_with_annotations: [],
      existing_without_annotations: [],
    };
    apiClient.mockResolvedValueOnce(result);
    // Hoisted so the array reference stays stable across re-renders that
    // the hook's own setState calls trigger — otherwise a fresh literal on
    // every render would look like a changed dependency and re-fire the
    // effect (and the API mock) more than once.
    const namedItems = [{ name: "x" }, { name: "y" }];
    const { result: hookResult } = renderHook(() =>
      useAnnotatedItemsCheck({
        enabled: true,
        taskUuid: "t1",
        accessToken: "tok",
        annotatorId: "a1",
        namedItems,
      }),
    );
    expect(hookResult.current.annotatedCheckLoading).toBe(true);
    await waitFor(() =>
      expect(hookResult.current.annotatedCheckLoading).toBe(false),
    );
    expect(hookResult.current.annotatedCheck).toEqual(result);
    expect(apiClient).toHaveBeenCalledWith(
      "/annotation-tasks/t1/items/annotated-check",
      "tok",
      {
        method: "POST",
        body: { annotator_id: "a1", names: ["x", "y"] },
      },
    );
  });

  it("swallows errors and clears the result", async () => {
    apiClient.mockRejectedValueOnce(new Error("boom"));
    const namedItems = [{ name: "x" }];
    const { result: hookResult } = renderHook(() =>
      useAnnotatedItemsCheck({
        enabled: true,
        taskUuid: "t1",
        accessToken: "tok",
        annotatorId: "a1",
        namedItems,
      }),
    );
    await waitFor(() =>
      expect(hookResult.current.annotatedCheckLoading).toBe(false),
    );
    expect(hookResult.current.annotatedCheck).toBeNull();
  });
});

describe("useAnnotators", () => {
  it("does not fetch when isOpen is false", () => {
    renderHook(() => useAnnotators(false, "tok"));
    expect(apiClient).not.toHaveBeenCalled();
  });

  it("does not fetch when accessToken is empty", () => {
    renderHook(() => useAnnotators(true, ""));
    expect(apiClient).not.toHaveBeenCalled();
  });

  it("loads annotators on open", async () => {
    const annotators: Annotator[] = [{ uuid: "a1", name: "Alice" }];
    apiClient.mockResolvedValueOnce(annotators);
    const { result } = renderHook(() => useAnnotators(true, "tok"));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.annotators).toEqual(annotators);
    expect(result.current.error).toBeNull();
  });

  it("defaults to an empty list when the response isn't an array", async () => {
    apiClient.mockResolvedValueOnce({ not: "an array" });
    const { result } = renderHook(() => useAnnotators(true, "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.annotators).toEqual([]);
  });

  it("surfaces a parsed error message on failure", async () => {
    apiClient.mockRejectedValueOnce(new Error("Request failed: 500 - oops"));
    const { result } = renderHook(() => useAnnotators(true, "tok"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("oops");
  });
});

// ─── Components ─────────────────────────────────────────────────────────

describe("BulkUploadItemsPreviewShell", () => {
  it("shows singular 'item' for a count of 1", () => {
    render(
      <BulkUploadItemsPreviewShell
        itemCount={1}
        annotatedCheckLoading={false}
        annotatedCheck={null}
      >
        <div>rows</div>
      </BulkUploadItemsPreviewShell>,
    );
    expect(screen.getByText("1 item ready to upload")).toBeInTheDocument();
  });

  it("shows plural 'items' for other counts", () => {
    render(
      <BulkUploadItemsPreviewShell
        itemCount={3}
        annotatedCheckLoading={false}
        annotatedCheck={null}
      >
        <div>rows</div>
      </BulkUploadItemsPreviewShell>,
    );
    expect(screen.getByText("3 items ready to upload")).toBeInTheDocument();
  });

  it("shows the checking spinner text when loading", () => {
    render(
      <BulkUploadItemsPreviewShell
        itemCount={2}
        annotatedCheckLoading={true}
        annotatedCheck={null}
      >
        <div>rows</div>
      </BulkUploadItemsPreviewShell>,
    );
    expect(
      screen.getByText("Checking for existing items…"),
    ).toBeInTheDocument();
  });

  it("shows both banners when the check has both kinds of matches", () => {
    render(
      <BulkUploadItemsPreviewShell
        itemCount={2}
        annotatedCheckLoading={false}
        annotatedCheck={{
          all_new: false,
          existing_with_annotations: [{ index: 0, name: "a" }],
          existing_without_annotations: [{ index: 1, name: "b" }],
        }}
      >
        <div>rows</div>
      </BulkUploadItemsPreviewShell>,
    );
    expect(screen.getByText("amber")).toBeInTheDocument();
    expect(screen.getByText("red")).toBeInTheDocument();
  });

  it("shows no banners when the check has no matches", () => {
    render(
      <BulkUploadItemsPreviewShell
        itemCount={2}
        annotatedCheckLoading={false}
        annotatedCheck={{
          all_new: true,
          existing_with_annotations: [],
          existing_without_annotations: [],
        }}
      >
        <div>rows</div>
      </BulkUploadItemsPreviewShell>,
    );
    expect(screen.queryByText("amber")).not.toBeInTheDocument();
    expect(screen.queryByText("red")).not.toBeInTheDocument();
  });
});

describe("AnnotationOptIn", () => {
  it("toggles Yes/No via onToggle", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    render(
      <AnnotationOptIn
        annotators={[]}
        loading={false}
        error={null}
        uploadAnnotations={false}
        onToggle={onToggle}
        selectedAnnotatorId={null}
        onSelectAnnotator={jest.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(onToggle).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "No" }));
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  it("hides the annotator selection UI when uploadAnnotations is false", () => {
    render(
      <AnnotationOptIn
        annotators={[]}
        loading={false}
        error={null}
        uploadAnnotations={false}
        onToggle={jest.fn()}
        selectedAnnotatorId={null}
        onSelectAnnotator={jest.fn()}
      />,
    );
    expect(screen.queryByText("Select annotator")).not.toBeInTheDocument();
  });

  it("shows a loading state", () => {
    render(
      <AnnotationOptIn
        annotators={[]}
        loading={true}
        error={null}
        uploadAnnotations={true}
        onToggle={jest.fn()}
        selectedAnnotatorId={null}
        onSelectAnnotator={jest.fn()}
      />,
    );
    expect(screen.getByText("Loading annotators…")).toBeInTheDocument();
  });

  it("shows an error state", () => {
    render(
      <AnnotationOptIn
        annotators={[]}
        loading={false}
        error="Failed to load annotators"
        uploadAnnotations={true}
        onToggle={jest.fn()}
        selectedAnnotatorId={null}
        onSelectAnnotator={jest.fn()}
      />,
    );
    expect(
      screen.getByText("Failed to load annotators"),
    ).toBeInTheDocument();
  });

  it("shows an empty state with a link to add annotators", () => {
    render(
      <AnnotationOptIn
        annotators={[]}
        loading={false}
        error={null}
        uploadAnnotations={true}
        onToggle={jest.fn()}
        selectedAnnotatorId={null}
        onSelectAnnotator={jest.fn()}
      />,
    );
    const link = screen.getByRole("link", { name: "Add an annotator" });
    expect(link).toHaveAttribute("href", "/human-alignment?tab=annotators");
  });

  it("renders a picker and reports the selected annotator", async () => {
    const user = setupUser();
    const onSelectAnnotator = jest.fn();
    render(
      <AnnotationOptIn
        annotators={[
          { uuid: "a1", name: "Alice" },
          { uuid: "a2", name: "Bob" },
        ]}
        loading={false}
        error={null}
        uploadAnnotations={true}
        onToggle={jest.fn()}
        selectedAnnotatorId={null}
        onSelectAnnotator={onSelectAnnotator}
      />,
    );
    await user.click(screen.getByLabelText("Select annotator"));
    await user.click(screen.getByRole("option", { name: "Bob" }));
    expect(onSelectAnnotator).toHaveBeenCalledWith("a2");
  });

  it("filters the picker options via the search box (matchesSearch)", async () => {
    const user = setupUser();
    render(
      <AnnotationOptIn
        annotators={[
          { uuid: "a1", name: "Alice" },
          { uuid: "a2", name: "Bob" },
        ]}
        loading={false}
        error={null}
        uploadAnnotations={true}
        onToggle={jest.fn()}
        selectedAnnotatorId={null}
        onSelectAnnotator={jest.fn()}
      />,
    );
    await user.click(screen.getByLabelText("Select annotator"));
    await user.type(
      screen.getByPlaceholderText("Search annotators"),
      "bo",
    );
    expect(screen.getByRole("option", { name: "Bob" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Alice" }),
    ).not.toBeInTheDocument();
  });
});

describe("EvaluatorAnnotationColumnsHelp", () => {
  it("renders value/reasoning bullets for binary, rating-with-scale, and rating-without-scale evaluators", () => {
    render(
      <ul>
        <EvaluatorAnnotationColumnsHelp
          evaluators={[
            {
              uuid: "1",
              name: "Correctness",
              output_type: "binary",
              scale_min: null,
              scale_max: null,
            },
            {
              uuid: "2",
              name: "Score",
              output_type: "rating",
              scale_min: 1,
              scale_max: 5,
            },
            {
              uuid: "3",
              name: "Vague",
              output_type: "rating",
              scale_min: null,
              scale_max: null,
            },
          ]}
        />
      </ul>,
    );
    expect(screen.getByText("Correctness/value")).toBeInTheDocument();
    expect(screen.getByText("Correctness/reasoning")).toBeInTheDocument();
    expect(screen.getByText(/true\/false/)).toBeInTheDocument();
    expect(screen.getByText(/any value between 1-5/)).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links.some((l) => l.getAttribute("href") === "/evaluators/1")).toBe(
      true,
    );
  });
});

describe("CsvDropzone", () => {
  it("shows the default prompt and helper text when no file is selected", () => {
    render(<CsvDropzone csvFile={null} onFile={jest.fn()} onClear={jest.fn()} />);
    expect(
      screen.getByText("Drop a CSV here or click to browse"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Up to a few thousand rows is fine"),
    ).toBeInTheDocument();
  });

  it("shows custom helper text", () => {
    render(
      <CsvDropzone
        csvFile={null}
        onFile={jest.fn()}
        onClear={jest.fn()}
        helperText="Custom help"
      />,
    );
    expect(screen.getByText("Custom help")).toBeInTheDocument();
  });

  it("calls onFile via the hidden input's change event", () => {
    const onFile = jest.fn();
    const { container } = render(
      <CsvDropzone csvFile={null} onFile={onFile} onClear={jest.fn()} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["a,b"], "data.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("calls onFile(null) when the input change has no files", () => {
    const onFile = jest.fn();
    const { container } = render(
      <CsvDropzone csvFile={null} onFile={onFile} onClear={jest.fn()} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onFile).toHaveBeenCalledWith(null);
  });

  it("calls onFile via drag-and-drop", () => {
    const onFile = jest.fn();
    const { container } = render(
      <CsvDropzone csvFile={null} onFile={onFile} onClear={jest.fn()} />,
    );
    const dropzone = container.firstChild as HTMLElement;
    const file = new File(["a,b"], "dropped.csv", { type: "text/csv" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("does not call onFile when dropping with no files", () => {
    const onFile = jest.fn();
    const { container } = render(
      <CsvDropzone csvFile={null} onFile={onFile} onClear={jest.fn()} />,
    );
    const dropzone = container.firstChild as HTMLElement;
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } });
    expect(onFile).not.toHaveBeenCalled();
  });

  it("shows the selected file name and a Remove button that calls onClear", async () => {
    const user = setupUser();
    const onClear = jest.fn();
    const file = new File(["a,b"], "chosen.csv", { type: "text/csv" });
    render(
      <CsvDropzone csvFile={file} onFile={jest.fn()} onClear={onClear} />,
    );
    expect(screen.getByText("chosen.csv")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Remove file"));
    expect(onClear).toHaveBeenCalled();
  });
});

describe("ChatHistoryPreview", () => {
  it("renders each turn's role label and content", () => {
    render(
      <ChatHistoryPreview
        turns={[
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello there" },
        ]}
      />,
    );
    expect(screen.getByText("User")).toBeInTheDocument();
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
  });

  it("renders '(no content)' for a turn with empty content", () => {
    render(<ChatHistoryPreview turns={[{ role: "system" }]} />);
    expect(screen.getByText("(no content)")).toBeInTheDocument();
  });

  it("renders '?' for a turn with a non-string role", () => {
    render(
      <ChatHistoryPreview
        turns={[{ role: 123 as unknown as string, content: "x" }]}
      />,
    );
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("ConversationFormatDetails", () => {
  it("toggles the details open and closed", async () => {
    const user = setupUser();
    render(<ConversationFormatDetails example='[{"role": "user"}]' />);
    const toggle = screen.getByRole("button", { name: "View more" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Each turn must have:")).not.toBeInTheDocument();

    await user.click(toggle);
    expect(
      screen.getByRole("button", { name: "View less" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Each turn must have:")).toBeInTheDocument();
    expect(screen.getByText('[{"role": "user"}]')).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "View less" }));
    expect(screen.queryByText("Each turn must have:")).not.toBeInTheDocument();
  });
});

describe("FormatHelpToggle", () => {
  it("renders the closed label and calls onToggle when clicked", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    render(<FormatHelpToggle open={false} onToggle={onToggle} />);
    expect(
      screen.getByRole("button", { name: "Show CSV format details" }),
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders the open label", () => {
    render(<FormatHelpToggle open={true} onToggle={jest.fn()} />);
    expect(
      screen.getByRole("button", { name: "Hide CSV format details" }),
    ).toHaveAttribute("aria-expanded", "true");
  });
});

// ─── Download helpers ───────────────────────────────────────────────────

describe("downloadCsvBlob", () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let clickSpy: jest.SpyInstance;
  let capturedAnchor: HTMLAnchorElement | null;
  let createElementSpy: jest.SpyInstance;

  beforeEach(() => {
    createObjectURL = jest.fn(() => "blob:mock-url");
    revokeObjectURL = jest.fn();
    // jsdom doesn't implement these.
    (global.URL as unknown as { createObjectURL: unknown }).createObjectURL =
      createObjectURL;
    (global.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL =
      revokeObjectURL;
    clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    capturedAnchor = null;
    const realCreateElement = document.createElement.bind(document);
    createElementSpy = jest
      .spyOn(document, "createElement")
      .mockImplementation((tag: string) => {
        const el = realCreateElement(tag);
        if (tag === "a") capturedAnchor = el as HTMLAnchorElement;
        return el;
      });
  });

  afterEach(() => {
    clickSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it("creates an object URL, clicks a download link, and revokes the URL", () => {
    downloadCsvBlob("name,age\nAda,30\n", "sample.csv");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(capturedAnchor?.download).toBe("sample.csv");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

describe("generateGuidelinesPdf", () => {
  it("renders a title, intro, columns, fields, subFields, and trailing examples without throwing, forcing at least one page break", () => {
    const doc: GuidelineDoc = {
      title: "Bulk upload guidelines",
      intro:
        "Upload a CSV with the following columns to add several items at once to this task.",
      columns: [
        {
          name: "transcript",
          description: "A JSON array of chat turns describing the conversation.",
          // A blank line between two non-blank ones exercises the
          // `wrapped.length === 0` fallback in `writeCodeBlock`, which
          // pushes an explicit blank line for empty split segments.
          example:
            '[{"role": "user", "content": "hi there, I need help"}]\n\n[{"role": "assistant"}]',
          fields: [
            {
              name: "tool_calls",
              meta: "(optional)",
              description: "Structured tool call information for this turn.",
              example: '{"name": "lookup", "arguments": {"id": "123"}}',
              subFields: [
                {
                  name: "arguments",
                  meta: "(object)",
                  description: "Per-leaf matcher for the call arguments.",
                  example: '{"id": {"equals": "123"}}',
                },
                {
                  // No `meta` — exercises the falsy branch of the
                  // sub-field header ternary.
                  name: "raw_arguments",
                  description: "Unparsed arguments string, if any.",
                },
              ],
            },
            {
              // No `meta` and no `example`/`subFields` — exercises the
              // falsy branch of the field header ternary and the
              // omitted-example/omitted-subFields paths.
              name: "created_at",
              description: "Optional ISO-8601 timestamp for this turn.",
            },
          ],
          trailingExamples: [
            {
              label: "Minimal example:",
              example: '[{"role": "user", "content": "hi"}]',
            },
          ],
        },
        {
          // No example/fields/trailingExamples — exercises the branches
          // where those are omitted.
          name: "name",
          description: "A unique name for the item.",
        },
      ],
    };

    const blob = generateGuidelinesPdf(doc);
    expect(blob).toEqual({ __fakePdfOutput: "blob" });
    // The tiny fake page height (140) combined with the long intro/columns
    // guarantees at least one page break through `ensure()`.
    expect(jspdfMock.__addPageCalls.length).toBeGreaterThan(0);
    expect(jspdfMock.__textCalls.length).toBeGreaterThan(0);
  });

  it("renders without an intro", () => {
    const doc: GuidelineDoc = {
      title: "No intro",
      columns: [{ name: "name", description: "desc" }],
    };
    expect(() => generateGuidelinesPdf(doc)).not.toThrow();
  });
});

// ─── BulkUploadDialogShell ──────────────────────────────────────────────

describe("BulkUploadDialogShell", () => {
  const baseProps = {
    isOpen: true,
    title: "Bulk upload items",
    buildSampleCsv: jest.fn(() => "name\nfoo\n"),
    sampleFilename: "sample.csv",
    buildGuidelines: jest.fn(
      (): GuidelineDoc => ({
        title: "Guidelines",
        columns: [{ name: "name", description: "desc" }],
      }),
    ),
    csvFile: null,
    onFile: jest.fn(),
    onClear: jest.fn(),
    parseError: null,
    uploadError: null,
    isUploading: false,
    itemCount: 0,
    itemsPreview: <div data-testid="items-preview">preview</div>,
    onUpload: jest.fn(),
    onClose: jest.fn(),
  };

  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    createObjectURL = jest.fn(() => "blob:mock-url");
    revokeObjectURL = jest.fn();
    (global.URL as unknown as { createObjectURL: unknown }).createObjectURL =
      createObjectURL;
    (global.URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL =
      revokeObjectURL;
    clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BulkUploadDialogShell {...baseProps} isOpen={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the title and the narrow width class when there are no items", () => {
    render(<BulkUploadDialogShell {...baseProps} />);
    expect(screen.getByText("Bulk upload items")).toBeInTheDocument();
    const panel = screen.getByText("Bulk upload items").closest(
      "div.bg-background",
    ) as HTMLElement;
    expect(panel.className).toContain("md:max-w-[37.5vw]");
  });

  it("uses the wide width class and shows the items preview when itemCount > 0", () => {
    render(<BulkUploadDialogShell {...baseProps} itemCount={5} />);
    const panel = screen.getByText("Bulk upload items").closest(
      "div.bg-background",
    ) as HTMLElement;
    expect(panel.className).toContain("md:max-w-[70vw]");
    expect(screen.getByTestId("items-preview")).toBeInTheDocument();
  });

  it("shows 'Upload item' for 0 or 1 items, and 'Upload N items' otherwise", () => {
    const { rerender } = render(<BulkUploadDialogShell {...baseProps} />);
    expect(
      screen.getByRole("button", { name: "Upload item" }),
    ).toBeInTheDocument();

    rerender(<BulkUploadDialogShell {...baseProps} itemCount={1} />);
    expect(
      screen.getByRole("button", { name: "Upload item" }),
    ).toBeInTheDocument();

    rerender(<BulkUploadDialogShell {...baseProps} itemCount={5} />);
    expect(
      screen.getByRole("button", { name: "Upload 5 items" }),
    ).toBeInTheDocument();
  });

  it("shows 'Uploading' and disables the footer buttons while uploading", () => {
    render(
      <BulkUploadDialogShell {...baseProps} itemCount={2} isUploading />,
    );
    expect(
      screen.getByRole("button", { name: "Uploading" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByLabelText("Close")).toBeDisabled();
  });

  it("calls onUpload when the Upload button is clicked", async () => {
    const user = setupUser();
    const onUpload = jest.fn();
    render(
      <BulkUploadDialogShell {...baseProps} itemCount={2} onUpload={onUpload} />,
    );
    await user.click(screen.getByRole("button", { name: "Upload 2 items" }));
    expect(onUpload).toHaveBeenCalled();
  });

  it("disables Upload when parseError is set", () => {
    render(
      <BulkUploadDialogShell
        {...baseProps}
        itemCount={2}
        parseError="bad csv"
      />,
    );
    expect(screen.getByRole("button", { name: "Upload 2 items" })).toBeDisabled();
    expect(screen.getByText("bad csv")).toBeInTheDocument();
  });

  it("disables Upload when uploadBlocked is set", () => {
    render(
      <BulkUploadDialogShell {...baseProps} itemCount={2} uploadBlocked />,
    );
    expect(screen.getByRole("button", { name: "Upload 2 items" })).toBeDisabled();
  });

  it("shows the upload error banner regardless of item count", () => {
    render(
      <BulkUploadDialogShell {...baseProps} uploadError="Server rejected it" />,
    );
    expect(screen.getByText("Server rejected it")).toBeInTheDocument();
  });

  it("closes via the backdrop click when not uploading, but not via clicks inside the panel", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <BulkUploadDialogShell {...baseProps} onClose={onClose} />,
    );
    await user.click(screen.getByText("Bulk upload items"));
    expect(onClose).not.toHaveBeenCalled();
    await user.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close via the backdrop while uploading", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <BulkUploadDialogShell
        {...baseProps}
        itemCount={1}
        isUploading
        onClose={onClose}
      />,
    );
    await user.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes via the Close button and the Cancel button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<BulkUploadDialogShell {...baseProps} onClose={onClose} />);
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("downloads the sample CSV via the tip link", async () => {
    const user = setupUser();
    const buildSampleCsv = jest.fn(() => "name\nfoo\n");
    render(
      <BulkUploadDialogShell {...baseProps} buildSampleCsv={buildSampleCsv} />,
    );
    await user.click(
      screen.getByRole("button", { name: "download the sample CSV" }),
    );
    expect(buildSampleCsv).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it("supports a function sampleFilename", async () => {
    const user = setupUser();
    const sampleFilename = jest.fn(() => "dynamic.csv");
    render(
      <BulkUploadDialogShell {...baseProps} sampleFilename={sampleFilename} />,
    );
    await user.click(
      screen.getByRole("button", { name: "download the sample CSV" }),
    );
    expect(sampleFilename).toHaveBeenCalled();
  });

  it("downloads guidelines via the header button (string and function filename)", async () => {
    const user = setupUser();
    const buildGuidelines = jest.fn(
      (): GuidelineDoc => ({
        title: "G",
        columns: [{ name: "name", description: "d" }],
      }),
    );
    const { rerender } = render(
      <BulkUploadDialogShell
        {...baseProps}
        buildGuidelines={buildGuidelines}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Download CSV format guidelines/ }),
    );
    expect(buildGuidelines).toHaveBeenCalled();
    expect(createObjectURL).toHaveBeenCalled();

    const guidelinesFilename = jest.fn(() => "dynamic-guidelines.pdf");
    rerender(
      <BulkUploadDialogShell
        {...baseProps}
        buildGuidelines={buildGuidelines}
        guidelinesFilename={guidelinesFilename}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Download CSV format guidelines/ }),
    );
    expect(guidelinesFilename).toHaveBeenCalled();
  });

  it("renders topContent above the upload section", () => {
    render(
      <BulkUploadDialogShell
        {...baseProps}
        topContent={<div data-testid="top-content">top</div>}
      />,
    );
    expect(screen.getByTestId("top-content")).toBeInTheDocument();
  });

  it("hides the entire upload section when hideUploadSection is set, but still renders topContent and Cancel", () => {
    render(
      <BulkUploadDialogShell
        {...baseProps}
        itemCount={3}
        uploadError="should be hidden"
        topContent={<div data-testid="top-content">top</div>}
        hideUploadSection
      />,
    );
    expect(screen.getByTestId("top-content")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Upload/ }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("items-preview")).not.toBeInTheDocument();
    expect(screen.queryByText("should be hidden")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("calls onFile / onClear through the dropzone", () => {
    const onFile = jest.fn();
    const { container } = render(
      <BulkUploadDialogShell {...baseProps} onFile={onFile} />,
    );
    const input = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    const file = new File(["a"], "a.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFile).toHaveBeenCalledWith(file);
  });
});
