/**
 * The "send us a trace" snippet, in the languages a backend is likely written
 * in. Each one posts the same body, so whichever a reader picks they see the
 * same field names they will read about beside it.
 */

export type SnippetLanguage = "curl" | "python" | "javascript";

export const SNIPPET_LANGUAGES: { id: SnippetLanguage; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
];

export type SnippetValues = {
  backendUrl: string;
  agentUuid: string;
  apiKey: string;
  /** When false (default), optional ids and metadata are left out of the code. */
  includeOptional?: boolean;
  /** A general agent answers one input at a time, so its input is a single
   * piece of text rather than a conversation history. */
  agentNature?: AgentNature;
  /** Show the input, reply and tool calls as "..." so only the shape is read. */
  placeholders?: boolean;
  /** Metadata entries written after the output. */
  metadata?: { key: string; value: string }[];
};

export type AgentNature = "conversation" | "general";

/** The one input every snippet uses, so all three read the same. */
const EXAMPLE_INPUT = "When is the next vaccination?";

const OPTIONAL_PYTHON = `        # Optional
        "message_id": "your-message-id",
        "conversation_id": "your-conversation-id",
        "labels": ["production", "v2.1"],
        "metadata": [{"key": "env", "value": "production"}],`;

const OPTIONAL_JAVASCRIPT = `    // Optional
    message_id: "your-message-id",
    conversation_id: "your-conversation-id",
    labels: ["production", "v2.1"],
    metadata: [{ key: "env", value: "production" }],`;

const PLACEHOLDER = "...";

/** What every language fills in the same way. */
function fill({ placeholders = false }: SnippetValues) {
  return {
    content: placeholders ? PLACEHOLDER : EXAMPLE_INPUT,
    response: placeholders ? PLACEHOLDER : "At 14 weeks, for OPV and DPT.",
  };
}

/** The metadata array, one `{key, value}` entry per line, or "" for none. */
function metadataBlock(
  metadata: SnippetValues["metadata"],
  open: string,
  entry: (key: string, value: string) => string,
  indent: string,
  step = "  ",
): string {
  if (!metadata?.length) return "";
  const entries = metadata
    .map((m) => `${indent}${step}${entry(JSON.stringify(m.key), JSON.stringify(m.value))}`)
    .join(",\n");
  return `,\n${indent}${open}\n${entries}\n${indent}]`;
}

function curl(values: SnippetValues): string {
  const {
    backendUrl,
    agentUuid,
    apiKey,
    includeOptional = false,
    agentNature = "conversation",
    placeholders = false,
  } = values;
  const { content, response } = fill(values);
  const inputBlock =
    agentNature === "general"
      ? `"input": "${content}"`
      : `"input": [
      {
        "role": "user",
        "content": "${content}"
      }
    ]`;
  const toolCalls = placeholders
    ? "[...]"
    : `[
        {
          "tool": "book_appointment",
          "arguments": {
            "date": "2026-03-14"
          }
        }
      ]`;
  const optionalBlock = includeOptional
    ? `,
    "message_id": "your-message-id",
    "conversation_id": "your-conversation-id",
    "labels": ["production", "v2.1"],
    "metadata": [{"key": "env", "value": "production"}]`
    : "";
  const metadata = metadataBlock(
    values.metadata,
    `"metadata": [`,
    (k, v) => `{"key": ${k}, "value": ${v}}`,
    "    ",
  );
  return `curl -X POST ${backendUrl}/traces \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "${agentUuid}",
    ${inputBlock},
    "output": {
      "response": "${response}",
      "tool_calls": ${toolCalls}
    }${optionalBlock}${metadata}
  }'`;
}

function python(values: SnippetValues): string {
  const {
    backendUrl,
    agentUuid,
    apiKey,
    includeOptional = false,
    agentNature = "conversation",
    placeholders = false,
  } = values;
  const { content, response } = fill(values);
  const inputBlock =
    agentNature === "general"
      ? `"input": "${content}"`
      : `"input": [
            {
                "role": "user",
                "content": "${content}",
            }
        ]`;
  const toolCalls = placeholders
    ? "[...]"
    : `[
                {
                    "tool": "book_appointment",
                    "arguments": {"date": "2026-03-14"},
                }
            ]`;
  const optionalBlock = includeOptional ? `,\n${OPTIONAL_PYTHON}` : "";
  const metadata = metadataBlock(
    values.metadata,
    `"metadata": [`,
    (k, v) => `{"key": ${k}, "value": ${v}}`,
    "        ",
    "    ",
  );
  return `requests.post(
    "${backendUrl}/traces",
    headers={"X-API-Key": "${apiKey}"},
    json={
        "agent_id": "${agentUuid}",
        ${inputBlock},
        "output": {
            "response": "${response}",
            "tool_calls": ${toolCalls},
        }${optionalBlock}${metadata}
    },
)`;
}

function javascript(values: SnippetValues): string {
  const {
    backendUrl,
    agentUuid,
    apiKey,
    includeOptional = false,
    agentNature = "conversation",
    placeholders = false,
  } = values;
  const { content, response } = fill(values);
  const inputBlock =
    agentNature === "general"
      ? `input: "${content}"`
      : `input: [
      {
        role: "user",
        content: "${content}",
      },
    ]`;
  const toolCalls = placeholders
    ? "[...]"
    : `[
        {
          tool: "book_appointment",
          arguments: { date: "2026-03-14" },
        },
      ]`;
  const optionalBlock = includeOptional ? `,\n${OPTIONAL_JAVASCRIPT}` : "";
  const metadata = metadataBlock(
    values.metadata,
    "metadata: [",
    (k, v) => `{ key: ${k}, value: ${v} }`,
    "    ",
  );
  return `await fetch("${backendUrl}/traces", {
  method: "POST",
  headers: {
    "X-API-Key": "${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agent_id: "${agentUuid}",
    ${inputBlock},
    output: {
      response: "${response}",
      tool_calls: ${toolCalls},
    }${optionalBlock}${metadata}
  }),
});`;
}

const BUILDERS: Record<SnippetLanguage, (v: SnippetValues) => string> = {
  curl,
  python,
  javascript,
};

export function buildSnippet(
  language: SnippetLanguage,
  values: SnippetValues,
): string {
  return BUILDERS[language](values);
}

export type SnippetField = {
  name: string;
  meaning: string;
  optional?: boolean;
};

/** What each part of the request means, in the order it appears. */
export function snippetFields(
  agentNature: AgentNature = "conversation",
): SnippetField[] {
  return [
    {
      name: "agent_id",
      meaning: "Identifier for the agent to which this trace belongs",
    },
    {
      name: "input",
      meaning:
        agentNature === "general"
          ? "The input given to the agent, as a single piece of text."
          : "The input given to the agent. If the input is a conversation with many turns, send the entire conversation history as input.",
    },
    {
      name: "output",
      meaning:
        'What the agent produced: the text reply in "response", the tools it called in "tool_calls", or both. Send at least one of them and leave the other out.',
    },
    {
      name: "message_id",
      optional: true,
      meaning:
        "The unique input id that you can use to connect this trace to your internal ID tracking system.",
    },
    {
      name: "conversation_id",
      optional: true,
      meaning:
        "The unique id of the conversation that this trace belongs to. Use the same id for all turns in the same conversation.",
    },
    {
      name: "labels",
      optional: true,
      meaning:
        "Your own tags for this trace, such as the environment it ran in or the release it came from. Send them here, they cannot be changed later. You can filter your traces by them.",
    },
    {
      name: "metadata",
      optional: true,
      meaning: "Additional metadata about the trace as key-value pairs",
    },
  ];
}
