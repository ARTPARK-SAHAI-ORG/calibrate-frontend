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
};

const OPTIONAL_PYTHON = `        # Optional
        "message_id": "your-message-id",
        "conversation_id": "your-conversation-id",
        "metadata": [{"key": "env", "value": "production"}],`;

const OPTIONAL_JAVASCRIPT = `    // Optional
    message_id: "your-message-id",
    conversation_id: "your-conversation-id",
    metadata: [{ key: "env", value: "production" }],`;

function curl({
  backendUrl,
  agentUuid,
  apiKey,
  includeOptional = false,
}: SnippetValues): string {
  const optionalBlock = includeOptional
    ? `,
    "message_id": "your-message-id",
    "conversation_id": "your-conversation-id",
    "metadata": [{"key": "env", "value": "production"}]`
    : "";
  return `curl -X POST ${backendUrl}/traces \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "${agentUuid}",
    "input": [
      {
        "role": "user",
        "content": "When is the next vaccination?"
      }
    ],
    "output": {
      "response": "At 14 weeks, for OPV and DPT.",
      "tool_calls": [
        {
          "tool": "book_appointment",
          "arguments": {
            "date": "2026-03-14"
          }
        }
      ]
    }${optionalBlock}
  }'`;
}

function python({
  backendUrl,
  agentUuid,
  apiKey,
  includeOptional = false,
}: SnippetValues): string {
  const optionalBlock = includeOptional ? `,\n${OPTIONAL_PYTHON}` : "";
  return `requests.post(
    "${backendUrl}/traces",
    headers={"X-API-Key": "${apiKey}"},
    json={
        "agent_id": "${agentUuid}",
        "input": [
            {
                "role": "user",
                "content": "When is the next vaccination?",
            }
        ],
        "output": {
            "response": "At 14 weeks, for OPV and DPT.",
            "tool_calls": [
                {
                    "tool": "book_appointment",
                    "arguments": {"date": "2026-03-14"},
                }
            ],
        }${optionalBlock}
    },
)`;
}

function javascript({
  backendUrl,
  agentUuid,
  apiKey,
  includeOptional = false,
}: SnippetValues): string {
  const optionalBlock = includeOptional ? `,\n${OPTIONAL_JAVASCRIPT}` : "";
  return `await fetch("${backendUrl}/traces", {
  method: "POST",
  headers: {
    "X-API-Key": "${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    agent_id: "${agentUuid}",
    input: [
      {
        role: "user",
        content: "When is the next vaccination?",
      },
    ],
    output: {
      response: "At 14 weeks, for OPV and DPT.",
      tool_calls: [
        {
          tool: "book_appointment",
          arguments: { date: "2026-03-14" },
        },
      ],
    }${optionalBlock}
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

/** What each part of the request means, in the order it appears. */
export const SNIPPET_FIELDS: {
  name: string;
  meaning: string;
  optional?: boolean;
}[] = [
  {
    name: "agent_id",
    meaning: "Identifier for the agent to which this trace belongs",
  },
  {
    name: "input",
    meaning:
      "The input given to the agent. If the input is a conversation with many turns, send the entire conversation history as input.",
  },
  {
    name: "output",
    meaning:
      "What the agent produced: the text reply in \"response\", the tools it called in \"tool_calls\", or both. Send at least one of them and leave the other out.",
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
    name: "metadata",
    optional: true,
    meaning:
      "Additional metadata about the trace as key-value pairs",
  },
];
