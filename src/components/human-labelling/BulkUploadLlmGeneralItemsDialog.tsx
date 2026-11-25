"use client";

import { toolCallColumns } from "./bulk-upload-shared";
import {
  BulkUploadItemsDialog,
  type BulkContentColumn,
  type BulkLinkedEvaluator,
  type BulkSampleRow,
} from "./BulkUploadItemsDialog";

export type LlmGeneralLinkedEvaluator = BulkLinkedEvaluator;

// Plain-text input/output renderer shared by both content columns.
function textPreview(value: unknown) {
  return (
    <div className="max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap">
      {(value as string) ?? ""}
    </div>
  );
}

// Content columns specific to non-conversational ("llm-general") items: a
// single input given to the model and the output it produced.
const CONTENT_COLUMNS: BulkContentColumn[] = [
  {
    payloadKey: "input",
    csvColumn: "input",
    headerCandidates: ["input", "prompt", "question", "request"],
    previewLabel: "Input",
    previewWidth: "minmax(120px, 220px)",
    guidelineDescription: "Required. The prompt or input given to the LLM.",
    parse: (raw) => ({ value: raw }),
    renderPreview: textPreview,
  },
  {
    payloadKey: "output",
    csvColumn: "output",
    headerCandidates: ["output", "response", "completion", "answer", "reply"],
    previewLabel: "Output",
    previewWidth: "minmax(120px, 220px)",
    guidelineDescription:
      "Required, unless the row has tool calls. The output the LLM produced for that input.",
    emptyWithToolCalls: true,
    parse: (raw) => ({ value: raw }),
    renderPreview: textPreview,
  },
  ...toolCallColumns("output"),
];

const SAMPLE_ROWS: BulkSampleRow[] = [
  {
    name: "Summary 1",
    description: "Summarisation quality check.",
    content: {
      input: "Summarise: The cat sat on the mat and then went to sleep.",
      output: "A cat sat on a mat and fell asleep.",
    },
    variableValue:
      "The summary should be accurate, concise, and capture the key facts.",
    reasoning: "Accurate and concise.",
  },
  {
    name: "Classification 1",
    description: "",
    content: {
      input: "Classify the sentiment: I absolutely loved this product!",
      output: "positive",
    },
    variableValue:
      "The label should correctly reflect the sentiment of the text.",
    reasoning: "",
  },
  {
    name: "Save plan",
    description: "",
    content: {
      input: "Save my plan for 7 months",
      output: "",
      actual_tool_calls: JSON.stringify([
        { tool: "save", arguments: { months: 7 } },
      ]),
      expected_tool_calls: JSON.stringify([
        { tool: "save", arguments: { months: 7 } },
      ]),
    },
    variableValue:
      "The model should save the plan for the number of months asked.",
    reasoning: "",
  },
];

type BulkUploadLlmGeneralItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators?: LlmGeneralLinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
};

export function BulkUploadLlmGeneralItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators = [],
  onClose,
  onSuccess,
}: BulkUploadLlmGeneralItemsDialogProps) {
  return (
    <BulkUploadItemsDialog
      isOpen={isOpen}
      accessToken={accessToken}
      taskUuid={taskUuid}
      linkedEvaluators={linkedEvaluators}
      contentColumns={CONTENT_COLUMNS}
      sampleRows={SAMPLE_ROWS}
      guidelinesTitle="Bulk upload: labelling items for a basic agent"
      guidelinesIntro="Upload a CSV with the following columns. Each row creates one non-conversational LLM evaluation item."
      sampleFilenameBase="llm_response_items"
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
