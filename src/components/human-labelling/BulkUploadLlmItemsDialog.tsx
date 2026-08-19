"use client";

import { parseJsonLenient } from "@/lib/jsonSanitize";
import { ChatHistoryPreview, type TurnObject } from "./bulk-upload-shared";
import {
  BulkUploadItemsDialog,
  type BulkContentColumn,
  type BulkLinkedEvaluator,
  type BulkSampleRow,
} from "./BulkUploadItemsDialog";

export type LinkedEvaluator = BulkLinkedEvaluator;

// Content columns specific to conversational ("llm") items: a JSON
// conversation history plus the single agent reply being judged.
const CONTENT_COLUMNS: BulkContentColumn[] = [
  {
    payloadKey: "chat_history",
    csvColumn: "conversation_history",
    headerCandidates: [
      "conversation_history",
      "conversation",
      "chat_history",
      "chat_history_json",
    ],
    previewLabel: "Chat history",
    previewWidth: "minmax(120px, 200px)",
    guidelineDescription:
      'A JSON array of chat messages that represents the conversation that has happened so far, before the agent response being judged. Each message is an object with a "role" and "content" field.\n\nrole — either "user" or "assistant"\ncontent — the message said by that role\ncreated_at — (optional) ISO-8601 timestamp for when this turn happened',
    guidelineExample: `[
  {"role": "user", "content": "What is your return policy?", "created_at": "2026-05-18T09:14:02Z"},
  {"role": "assistant", "content": "You can return any item within 30 days."}
]`,
    parse: (raw, rowIndex) => {
      let conversation: unknown;
      try {
        conversation = parseJsonLenient(raw);
      } catch {
        return {
          error: `Row ${rowIndex + 1}: "conversation_history" must be valid JSON. Wrap the JSON in double quotes and escape inner double quotes by doubling them.`,
        };
      }
      if (!Array.isArray(conversation) || conversation.length === 0) {
        return {
          error: `Row ${rowIndex + 1}: "conversation_history" must be a non-empty array of turn objects.`,
        };
      }
      for (let j = 0; j < conversation.length; j++) {
        const t = conversation[j];
        if (
          !t ||
          typeof t !== "object" ||
          typeof (t as TurnObject).role !== "string"
        ) {
          return {
            error: `Row ${rowIndex + 1}, turn ${j + 1}: each turn must be an object with a string "role".`,
          };
        }
      }
      return { value: conversation as TurnObject[] };
    },
    renderPreview: (value) => (
      <ChatHistoryPreview turns={(value as TurnObject[]) ?? []} />
    ),
  },
  {
    payloadKey: "agent_response",
    csvColumn: "agent_response",
    headerCandidates: [
      "agent_response",
      "response",
      "assistant_response",
      "ai_response",
    ],
    previewLabel: "AI reply",
    previewWidth: "minmax(120px, 200px)",
    guidelineDescription: "The agent response being judged.",
    parse: (raw) => ({ value: raw }),
    renderPreview: (value) => (
      <div className="max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap">
        {(value as string) ?? ""}
      </div>
    ),
  },
];

const SAMPLE_ROWS: BulkSampleRow[] = [
  {
    name: "Greeting reply",
    description: "Return policy explanation, friendly tone expected.",
    content: {
      conversation_history: JSON.stringify([
        { role: "user", content: "What is your return policy?" },
      ]),
      agent_response: "You can return any item within 30 days for a full refund.",
    },
    variableValue:
      "The agent should clearly explain the return policy in a helpful and friendly tone.",
    reasoning: "The agent answered the policy clearly and politely.",
  },
  {
    name: "Refund flow",
    description: "",
    content: {
      conversation_history: JSON.stringify([
        { role: "user", content: "I was charged twice" },
      ]),
      agent_response:
        "I'm sorry to hear that. Can you confirm the order ID so I can investigate?",
    },
    variableValue:
      "The agent should apologize for the duplicate charge and offer to investigate the order.",
    reasoning: "",
  },
];

// Sample CSV shows an example variable column even when no evaluators are
// linked yet.
const SAMPLE_FALLBACK_EVALUATORS: BulkLinkedEvaluator[] = [
  {
    uuid: "",
    name: "Correctness",
    slug: null,
    variables: [{ name: "criteria" }],
    output_type: "binary",
    scale_min: null,
    scale_max: null,
  },
];

type BulkUploadLlmItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators: LinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
};

export function BulkUploadLlmItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators,
  onClose,
  onSuccess,
}: BulkUploadLlmItemsDialogProps) {
  return (
    <BulkUploadItemsDialog
      isOpen={isOpen}
      accessToken={accessToken}
      taskUuid={taskUuid}
      linkedEvaluators={linkedEvaluators}
      contentColumns={CONTENT_COLUMNS}
      sampleRows={SAMPLE_ROWS}
      sampleFallbackEvaluators={SAMPLE_FALLBACK_EVALUATORS}
      guidelinesTitle="Bulk upload — LLM labelling items"
      guidelinesIntro="Upload a CSV with the following columns. Each row creates one LLM annotation item."
      sampleFilenameBase="llm_items"
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
