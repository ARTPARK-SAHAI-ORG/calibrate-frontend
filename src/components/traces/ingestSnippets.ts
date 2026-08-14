/**
 * The "send us a trace" snippet, in the languages a backend is likely written
 * in. Each one posts the same body, so whichever a reader picks they see the
 * same field names they will read about beside it.
 */

export type SnippetLanguage = "curl" | "python" | "javascript" | "go";

export const SNIPPET_LANGUAGES: { id: SnippetLanguage; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "go", label: "Go" },
];

export type SnippetValues = {
  backendUrl: string;
  agentUuid: string;
  apiKey: string;
};

function curl({ backendUrl, agentUuid, apiKey }: SnippetValues): string {
  return `# One request per turn, sent right after your agent replies.
curl -X POST ${backendUrl}/traces \\
  -H "X-API-Key: ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "agent_id": "${agentUuid}",
    "message_id": "msg-001",
    "conversation_id": "conv-001",
    "input": [{"role": "user", "content": "When is the next vaccination?"}],
    "output": {"response": "At 14 weeks, for OPV and DPT."}
  }'`;
}

function python({ backendUrl, agentUuid, apiKey }: SnippetValues): string {
  return `import requests

# Call this once per turn, right after your agent replies.
requests.post(
    "${backendUrl}/traces",
    headers={"X-API-Key": "${apiKey}"},
    json={
        # Which agent this turn belongs to. Already filled in for you.
        "agent_id": "${agentUuid}",
        # Your own id for the last user message. Send it twice and you
        # still get one trace, not two.
        "message_id": "msg-001",
        # Groups the turns of one conversation together.
        "conversation_id": "conv-001",
        # The conversation so far, oldest message first.
        "input": [{"role": "user", "content": "When is the next vaccination?"}],
        # What your agent replied for this turn.
        "output": {"response": "At 14 weeks, for OPV and DPT."},
    },
    timeout=10,
)`;
}

function javascript({ backendUrl, agentUuid, apiKey }: SnippetValues): string {
  return `// Call this once per turn, right after your agent replies.
await fetch("${backendUrl}/traces", {
  method: "POST",
  headers: {
    "X-API-Key": "${apiKey}",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    // Which agent this turn belongs to. Already filled in for you.
    agent_id: "${agentUuid}",
    // Your own id for the last user message. Send it twice and you
    // still get one trace, not two.
    message_id: "msg-001",
    // Groups the turns of one conversation together.
    conversation_id: "conv-001",
    // The conversation so far, oldest message first.
    input: [{ role: "user", content: "When is the next vaccination?" }],
    // What your agent replied for this turn.
    output: { response: "At 14 weeks, for OPV and DPT." },
  }),
});`;
}

function go({ backendUrl, agentUuid, apiKey }: SnippetValues): string {
  return `// Call this once per turn, right after your agent replies.
body, _ := json.Marshal(map[string]any{
    "agent_id":        "${agentUuid}",
    "message_id":      "msg-001",
    "conversation_id": "conv-001",
    "input": []map[string]string{
        {"role": "user", "content": "When is the next vaccination?"},
    },
    "output": map[string]string{"response": "At 14 weeks, for OPV and DPT."},
})

req, _ := http.NewRequest("POST", "${backendUrl}/traces", bytes.NewReader(body))
req.Header.Set("X-API-Key", "${apiKey}")
req.Header.Set("Content-Type", "application/json")
http.DefaultClient.Do(req)`;
}

const BUILDERS: Record<SnippetLanguage, (v: SnippetValues) => string> = {
  curl,
  python,
  javascript,
  go,
};

export function buildSnippet(
  language: SnippetLanguage,
  values: SnippetValues,
): string {
  return BUILDERS[language](values);
}

/** What each part of the request means, in the order it appears. */
export const SNIPPET_FIELDS: { name: string; meaning: string }[] = [
  {
    name: "The address",
    meaning:
      "Where Calibrate receives traces. It is the same address this app talks to.",
  },
  {
    name: "X-API-Key",
    meaning: "The workspace key from step 1. It is what identifies you.",
  },
  {
    name: "agent_id",
    meaning:
      "Which agent this turn belongs to. Filled in with the agent you are looking at.",
  },
  {
    name: "message_id",
    meaning:
      "Your own id for the last user message. Sending the same one again returns the stored trace instead of making a second one, so a retry is safe.",
  },
  {
    name: "conversation_id",
    meaning:
      "Your own id for the conversation, so the turns of one conversation stay grouped. Reuse the message id if you have nothing to group by.",
  },
  {
    name: "input",
    meaning:
      "The conversation up to this turn, oldest message first, in the usual role and content form.",
  },
  {
    name: "output",
    meaning:
      "What your agent produced for this turn: the reply text, the tools it called, or both.",
  },
];
