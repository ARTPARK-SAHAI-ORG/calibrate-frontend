"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import Papa from "papaparse";
import { MultiAgentPicker } from "@/components/AgentPicker";
import { MultiSelectPicker } from "@/components/MultiSelectPicker";
import {
  ChatHistoryPreview,
  generateGuidelinesPdf,
  type GuidelineColumn,
  type GuidelineDoc,
  type GuidelineField,
  type TurnObject,
} from "@/components/human-labelling/bulk-upload-shared";
import type { EvaluatorRefPayload } from "@/components/AddTestDialog";
import type { AvailableTool } from "@/components/ToolPicker";
import { INBUILT_TOOLS } from "@/constants/inbuilt-tools";

// Inline link styling for the in-modal helper text. Tuned to read as a link
// inside small muted body copy without shouting — `text-foreground` plus a
// subtle underline that darkens on hover. Kept here so both helper links
// stay visually consistent.
const HELPER_LINK_CLASS =
  "text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground/60 transition-colors";

type TestType = "response" | "tool_call";

type ParsedTest = {
  name: string;
  conversation_history: string;
  evaluators?: EvaluatorRefPayload[];
  tool_calls?: string;
};

type EvaluatorVariableDef = {
  name: string;
  description?: string;
  default?: string;
};

type LLMEvaluatorOption = {
  uuid: string;
  name: string;
  slug: string | null;
  variables: EvaluatorVariableDef[];
};

type BulkUploadTestsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * If set, the modal is locked to this agent: the "Assign tests to agents"
   * picker is hidden and `agent_uuids: [lockedAgentUuid]` is sent with the
   * upload so the new tests auto-attach to the agent the user came from.
   * Used by the agent page's Tests tab.
   */
  lockedAgentUuid?: string;
};

// Column header for an evaluator variable in the response-type CSV. We
// use a flat "EvalName/varName" naming scheme — one column per variable,
// across all selected evaluators — so users can edit values directly
// instead of hand-authoring JSON.
function variableColumnName(evalName: string, varName: string): string {
  return `${evalName}/${varName}`;
}

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// Build the response-type sample CSV against the user's selected
// evaluators. Always produces `name` + `conversation_history` columns,
// then one column per variable across all selected evaluators (in the
// order the user picked them). Evaluators with no variables don't add
// any columns — they still get attached to every test on submit.
function buildResponseSampleCsv(selected: LLMEvaluatorOption[]): string {
  const variableColumns: { evalName: string; varName: string }[] = [];
  for (const e of selected) {
    for (const v of e.variables) {
      variableColumns.push({ evalName: e.name, varName: v.name });
    }
  }

  const rows = [
    {
      name: "Greeting test",
      conversation: [
        { role: "assistant", content: "Hello, how can I help you today?" },
        { role: "user", content: "What is your return policy?" },
      ],
      sampleValue:
        "The agent should clearly explain the return policy in a helpful and friendly tone",
    },
    {
      name: "Billing question",
      conversation: [
        { role: "user", content: "I was charged twice for my order" },
      ],
      sampleValue:
        "The agent should apologize and offer to investigate the duplicate charge",
    },
  ];

  const headerCells = [
    "name",
    "conversation_history",
    ...variableColumns.map((c) =>
      csvEscape(variableColumnName(c.evalName, c.varName)),
    ),
  ];
  const lines = rows.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(JSON.stringify(r.conversation)),
      ...variableColumns.map(() => csvEscape(r.sampleValue)),
    ].join(","),
  );
  return `${headerCells.join(",")}\n${lines.join("\n")}\n`;
}

const SAMPLE_TOOL_CALL_CSV = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""I want to book room 101 for tomorrow""}]","[{""tool"":""book_room"",""arguments"":{""room"":""101""},""accept_any_arguments"":false}]"
"Weather lookup","[{""role"":""assistant"",""content"":""How can I help?""},{""role"":""user"",""content"":""What is the weather in Bangalore?""}]","[{""tool"":""get_weather"",""arguments"":{},""accept_any_arguments"":true}]"`;

const CONVERSATION_HISTORY_DESC =
  'A JSON array of chat messages that represents the conversation that has happened so far, before the agent\'s response is evaluated. Each message is an object with a "role" and "content" field.\n\nrole — either "user" or "assistant"\ncontent — the message said by that role';

const TOOL_CALL_FIELDS: GuidelineField[] = [
  {
    name: "tool",
    meta: "(required, string)",
    description:
      "The name of the tool. Must match the tool name exactly as configured in your agent.",
    example: '"book_room"',
  },
  {
    name: "arguments",
    meta: "(optional, object)",
    description:
      "The expected arguments the agent should pass to the tool. Each key is a parameter name and each value is the expected value. If omitted or empty ({}), arguments are not checked — equivalent to setting accept_any_arguments to true.",
    example: '{"room": "101", "date": "tomorrow"}',
  },
  {
    name: "accept_any_arguments",
    meta: "(optional, boolean, default: false)",
    description:
      'If true, the test passes regardless of what arguments the agent sends to this tool. Useful when you only care that the tool was called, not what was passed. When true, the "arguments" field is ignored.',
  },
];

export function BulkUploadTestsModal({
  isOpen,
  onClose,
  onSuccess,
  lockedAgentUuid,
}: BulkUploadTestsModalProps) {
  const backendAccessToken = useAccessToken();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assignAgentsSectionRef = useRef<HTMLDivElement>(null);
  const dialogBodyRef = useRef<HTMLDivElement>(null);

  const [testType, setTestType] = useState<TestType | null>(null);
  const isResponseType = testType === "response";
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedTests, setParsedTests] = useState<ParsedTest[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  // Holds a CSV that the user dropped before the evaluators fetch landed.
  // Set silently (no user-visible loading state) and consumed by a deferred-
  // parse effect once `evaluatorsFetched` flips to true. Lets us validate
  // the upload as soon as data is available without forcing a re-upload.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [assignToAgents, setAssignToAgents] = useState(false);
  const [selectedAgentUuids, setSelectedAgentUuids] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadWarnings, setUploadWarnings] = useState<string[] | null>(null);

  // LLM evaluators (defaults + user-owned) available to the tenant —
  // populates the picker and gives us the variable definitions we need to
  // build the per-variable CSV columns. Only fetched / used for next-reply
  // tests; tool-call uploads ignore it.
  const [availableLLMEvaluators, setAvailableLLMEvaluators] = useState<
    LLMEvaluatorOption[]
  >([]);
  // Evaluators the user has picked up-front for this batch. `selected…`
  // tracks the live picker state so check-marks update immediately;
  // `committed…` only updates once the picker dropdown closes, so the
  // sections below the picker (sample CSV format, helper text, parsing)
  // don't reflow under the open dropdown while the user is still
  // checking and unchecking items.
  const [selectedEvaluators, setSelectedEvaluators] = useState<
    LLMEvaluatorOption[]
  >([]);
  const [committedEvaluators, setCommittedEvaluators] = useState<
    LLMEvaluatorOption[]
  >([]);
  // Tracks whether the picker dropdown is currently open. When closed,
  // `onSelectionChange` (e.g. clicking the X on a selected pill) should
  // commit immediately, mirroring the close-dropdown commit path.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(false);
  const [evaluatorsFetched, setEvaluatorsFetched] = useState(false);
  const [evaluatorsFetchError, setEvaluatorsFetchError] = useState<
    string | null
  >(null);

  // Custom tools available to the tenant. Used in the tool-call preview to
  // render tool names as links to /tools when they exist on the platform,
  // and — at parse time — to reject CSV rows that reference tools the
  // tenant hasn't created. Only fetched / used for tool-call uploads.
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [toolsFetched, setToolsFetched] = useState(false);
  const [toolsFetchError, setToolsFetchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTestType(null);
      setCsvFile(null);
      setParsedTests([]);
      setParseError(null);
      setPendingFile(null);
      setAssignToAgents(false);
      setSelectedAgentUuids([]);
      setIsUploading(false);
      setUploadError(null);
      setUploadWarnings(null);
      setAvailableLLMEvaluators([]);
      setSelectedEvaluators([]);
      setCommittedEvaluators([]);
      setEvaluatorsLoading(false);
      setEvaluatorsFetched(false);
      setEvaluatorsFetchError(null);
      setAvailableTools([]);
      setToolsLoading(false);
      setToolsFetched(false);
      setToolsFetchError(null);
    }
  }, [isOpen]);

  // Fetch the LLM evaluators list as soon as the user picks "Next Reply" so
  // we can validate the CSV against it. We only need it for response-type
  // uploads, so don't preload it on modal open — keeps the round-trip off
  // the path for users who only ever do tool-call uploads.
  useEffect(() => {
    if (!isOpen || !backendAccessToken) return;
    if (testType !== "response") return;
    if (evaluatorsFetched || evaluatorsLoading) return;

    const fetchEvaluators = async () => {
      try {
        setEvaluatorsLoading(true);
        setEvaluatorsFetchError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/evaluators?include_defaults=true`,
          {
            method: "GET",
            headers: {
              accept: "application/json",
              Authorization: `Bearer ${backendAccessToken}`,
            },
          },
        );

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch evaluators");
        }

        const raw: Array<{
          uuid: string;
          name: string;
          slug: string | null;
          evaluator_type?: string;
          live_version?: { variables?: EvaluatorVariableDef[] | null } | null;
        }> = await response.json();

        const llm: LLMEvaluatorOption[] = raw
          .filter((e) => e.evaluator_type === "llm")
          .map((e) => ({
            uuid: e.uuid,
            name: e.name,
            slug: e.slug,
            variables: Array.isArray(e.live_version?.variables)
              ? (e.live_version!.variables as EvaluatorVariableDef[])
              : [],
          }));
        setAvailableLLMEvaluators(llm);
      } catch (err) {
        console.error("Error fetching evaluators:", err);
        setEvaluatorsFetchError(
          err instanceof Error ? err.message : "Failed to load evaluators",
        );
      } finally {
        setEvaluatorsLoading(false);
        setEvaluatorsFetched(true);
      }
    };

    fetchEvaluators();
  }, [
    isOpen,
    backendAccessToken,
    testType,
    evaluatorsFetched,
    evaluatorsLoading,
  ]);

  // Mirror of the evaluators fetch above for tool-call uploads — fires
  // `GET /tools` once when the user picks the tool-call type so we have a
  // name → tool map ready by the time we parse the CSV. Parsing now
  // depends on this list (rows referencing unknown tools are rejected),
  // so a fetch failure is fatal: surface it to the user via
  // `toolsFetchError` and block parsing until they refresh.
  useEffect(() => {
    if (!isOpen || !backendAccessToken) return;
    if (testType !== "tool_call") return;
    if (toolsFetched || toolsLoading) return;

    const fetchTools = async () => {
      try {
        setToolsLoading(true);
        setToolsFetchError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tools`, {
          method: "GET",
          headers: {
            accept: "application/json",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch tools");
        }

        const data: AvailableTool[] = await response.json();
        setAvailableTools(data);
      } catch (err) {
        console.error("Error fetching tools:", err);
        setToolsFetchError(
          err instanceof Error ? err.message : "Failed to load tools",
        );
      } finally {
        setToolsLoading(false);
        setToolsFetched(true);
      }
    };

    fetchTools();
  }, [isOpen, backendAccessToken, testType, toolsFetched, toolsLoading]);

  // Deferred parse: if the user dropped a CSV before the relevant fetch
  // landed (`/evaluators` for next-reply uploads, `/tools` for tool-call
  // uploads), `handleFileChange` stashes it on `pendingFile` and returns
  // silently. As soon as the gating data is available we re-run the
  // upload through `handleFileChange` so validation kicks in without the
  // user having to re-upload anything.
  useEffect(() => {
    if (!pendingFile) return;
    if (isResponseType) {
      if (!evaluatorsFetched) return;
    } else {
      if (!toolsFetched) return;
    }
    const fileToParse = pendingFile;
    setPendingFile(null);
    handleFileChange(fileToParse);
    // handleFileChange is stable for our purposes — re-running on its
    // identity would just thrash; we only care about the gating signals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFile, evaluatorsFetched, toolsFetched, isResponseType]);

  // Lookup set of every tool name the platform recognises for this tenant:
  // the names of all custom tools (from `GET /tools`) plus the ids of every
  // inbuilt tool (e.g. `end_call`). Tool-call CSV entries whose `tool` value
  // isn't in this set are flagged in the preview. Stabilised via `useMemo`
  // so the preview doesn't recompute on every render.
  const knownToolNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of availableTools) names.add(t.name);
    for (const t of INBUILT_TOOLS) names.add(t.id);
    return names;
  }, [availableTools]);

  // Evaluators to render in the preview's pill row and per-variable
  // column headers. Sourced directly from the user's up-front pick — the
  // CSV doesn't carry an evaluator list anymore.
  // Commit a new evaluator selection: update committed snapshot, drop
  // any uploaded CSV (its columns no longer match), and scroll the
  // dialog so the freshly-revealed/updated helper + dropzone come into
  // view. Called both when the picker dropdown closes and when the user
  // removes a selected pill via its X (which fires while the dropdown
  // is closed).
  const commitEvaluatorSelection = (next: LLMEvaluatorOption[]) => {
    const sameAsCommitted =
      next.length === committedEvaluators.length &&
      next.every((e, i) => e.uuid === committedEvaluators[i]?.uuid);
    if (!sameAsCommitted) {
      setCommittedEvaluators(next);
      setCsvFile(null);
      setParsedTests([]);
      setParseError(null);
      setUploadError(null);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    // Always scroll — even if selection didn't change, the user closed
    // the dropdown and the sections below should come into view.
    requestAnimationFrame(() => {
      const el = dialogBodyRef.current;
      if (el) {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }
    });
  };

  const buildGuidelines = (): GuidelineDoc => {
    if (isResponseType) {
      const columns: GuidelineColumn[] = [
        { name: "name", description: "A unique test name." },
        {
          name: "conversation_history",
          description: CONVERSATION_HISTORY_DESC,
          example: `[
  {"role": "user", "content": "What is your return policy?"},
  {"role": "assistant", "content": "You can return any item within 30 days."}
]`,
        },
      ];
      for (const e of committedEvaluators) {
        for (const v of e.variables) {
          const desc = v.description ? ` — ${v.description}` : "";
          columns.push({
            name: variableColumnName(e.name, v.name),
            description: `Used for the "${e.name}" evaluator${desc}`,
          });
        }
      }
      return {
        title: "Bulk upload — Next reply tests",
        intro:
          "Upload a CSV with the following columns. Each row creates one test.",
        columns,
      };
    }

    return {
      title: "Bulk upload — Tool call tests",
      intro:
        "Upload a CSV with the following columns. Each row creates one test.",
      columns: [
        {
          name: "name",
          description:
            "A unique name for the test. This must be different from every other test in the CSV and from any test you have already created.",
          example: '"Book room test"',
        },
        {
          name: "conversation_history",
          description: `${CONVERSATION_HISTORY_DESC}\n\nThe conversation should end with a user message, since the test evaluates which tools the agent calls after this conversation.`,
          example: `[
  {"role": "user", "content": "I want to book room 101 for tomorrow"}
]`,
        },
        {
          name: "tool_calls",
          description:
            "A JSON array of expected tool call objects. Each object describes a tool the agent is expected to call and what arguments to expect.",
          fields: TOOL_CALL_FIELDS,
          trailingExamples: [
            {
              label: "Tool should be called with specific arguments:",
              example:
                '[{"tool": "book_room", "arguments": {"room": "101"}, "accept_any_arguments": false}]',
            },
            {
              label: "Tool should be called, any arguments accepted:",
              example:
                '[{"tool": "get_weather", "arguments": {}, "accept_any_arguments": true}]',
            },
          ],
        },
      ],
    };
  };

  const downloadGuidelines = () => {
    if (!testType) return;
    const blob = generateGuidelinesPdf(buildGuidelines());
    const filename = isResponseType
      ? "next_reply_tests_csv_guidelines.pdf"
      : "tool_call_tests_csv_guidelines.pdf";
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadSampleCsv = () => {
    if (!testType) return;

    if (isResponseType) {
      // Single-CSV download tailored to the user's selected evaluators.
      const csv = buildResponseSampleCsv(committedEvaluators);
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "sample_next_reply_tests.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const blob = new Blob([SAMPLE_TOOL_CALL_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_tool_call_tests.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setCsvFile(file);
    setParseError(null);
    setParsedTests([]);
    setUploadError(null);
    setUploadWarnings(null);
    setPendingFile(null);

    // Both upload types need a backing list to validate against
    // (evaluators for next-reply, tools for tool-call). Surface a fetch
    // failure straight away, but if the fetch is still in flight just
    // stash the file and let the deferred-parse effect pick it up once
    // the data lands — no user-facing wait state.
    if (isResponseType && evaluatorsFetchError) {
      setParseError(
        `Failed to load evaluators: ${evaluatorsFetchError}. Refresh and try again.`,
      );
      return;
    }
    if (isResponseType && !evaluatorsFetched) {
      setPendingFile(file);
      return;
    }
    if (!isResponseType && toolsFetchError) {
      setParseError(
        `Failed to load tools: ${toolsFetchError}. Refresh and try again.`,
      );
      return;
    }
    if (!isResponseType && !toolsFetched) {
      setPendingFile(file);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];

        if (data.length === 0) {
          setParseError("CSV file is empty");
          return;
        }

        if (data.length > 500) {
          setParseError(
            `CSV contains ${data.length} rows — the maximum is 500 tests per upload`,
          );
          return;
        }

        const headers = Object.keys(data[0]);
        const baseColumns = isResponseType
          ? ["name", "conversation_history"]
          : ["name", "conversation_history", "tool_calls"];
        const variableColumns: {
          evaluator: LLMEvaluatorOption;
          varName: string;
          header: string;
        }[] = [];
        if (isResponseType) {
          for (const e of committedEvaluators) {
            for (const v of e.variables) {
              variableColumns.push({
                evaluator: e,
                varName: v.name,
                header: variableColumnName(e.name, v.name),
              });
            }
          }
        }
        const missingColumns = [
          ...baseColumns.filter((col) => !headers.includes(col)),
          ...variableColumns
            .filter((c) => !headers.includes(c.header))
            .map((c) => c.header),
        ];
        if (missingColumns.length > 0) {
          setParseError(
            `Missing required columns: ${missingColumns.join(", ")}. Download the sample CSV above for the exact format.`,
          );
          return;
        }

        const names = data.map((row) => row.name?.trim());
        const duplicates = names.filter(
          (name, idx) => name && names.indexOf(name) !== idx,
        );
        if (duplicates.length > 0) {
          setParseError(
            `Duplicate test names found: ${[...new Set(duplicates)].join(", ")}`,
          );
          return;
        }

        const errors: string[] = [];
        const tests: ParsedTest[] = [];
        // Collected across all rows for tool-call uploads so we can show
        // a single clear "these tools don't exist on the platform — add
        // them under Tools first" guidance message above the per-row
        // errors. Tool names appear at most once.
        const unknownToolNames = new Set<string>();

        data.forEach((row, idx) => {
          const rowNum = idx + 1;
          if (!row.name?.trim()) {
            errors.push(`Row ${rowNum}: missing test name`);
            return;
          }

          if (!row.conversation_history?.trim()) {
            errors.push(`Row ${rowNum}: missing conversation_history`);
            return;
          }

          try {
            const history = JSON.parse(row.conversation_history);
            if (!Array.isArray(history)) {
              errors.push(
                `Row ${rowNum}: conversation_history must be a JSON array`,
              );
              return;
            }
          } catch {
            errors.push(
              `Row ${rowNum}: conversation_history is not valid JSON`,
            );
            return;
          }

          if (isResponseType) {
            // Build the EvaluatorRefPayload[] from the user's selected
            // evaluators. Variable values come from the per-variable
            // columns; evaluators with no variables get attached without
            // a `variable_values` field.
            const refs: EvaluatorRefPayload[] = [];
            let rowFailed = false;
            for (const e of committedEvaluators) {
              const ref: EvaluatorRefPayload = { evaluator_uuid: e.uuid };
              if (e.variables.length > 0) {
                const variableValues: Record<string, string> = {};
                const missing: string[] = [];
                for (const v of e.variables) {
                  const header = variableColumnName(e.name, v.name);
                  const raw = (row[header] ?? "").trim();
                  if (!raw) {
                    missing.push(header);
                    continue;
                  }
                  variableValues[v.name] = raw;
                }
                if (missing.length > 0) {
                  errors.push(
                    `Row ${rowNum}: missing value(s) for ${missing
                      .map((m) => `"${m}"`)
                      .join(", ")}`,
                  );
                  rowFailed = true;
                  break;
                }
                ref.variable_values = variableValues;
              }
              refs.push(ref);
            }
            if (rowFailed) return;

            tests.push({
              name: row.name.trim(),
              conversation_history: row.conversation_history.trim(),
              evaluators: refs,
            });
          } else {
            if (!row.tool_calls?.trim()) {
              errors.push(`Row ${rowNum}: missing tool_calls`);
              return;
            }
            let toolCalls: Array<{ tool?: unknown }>;
            try {
              const parsed = JSON.parse(row.tool_calls);
              if (!Array.isArray(parsed)) {
                errors.push(`Row ${rowNum}: tool_calls must be a JSON array`);
                return;
              }
              toolCalls = parsed;
            } catch {
              errors.push(`Row ${rowNum}: tool_calls is not valid JSON`);
              return;
            }

            // Validate every referenced tool exists on the platform.
            // Empty / missing `tool` values are left to the backend's
            // payload validation — we only flag concretely-named tools
            // that aren't in the tenant's custom tools list nor in the
            // inbuilt-tool catalogue.
            const rowUnknownTools: string[] = [];
            for (const tc of toolCalls) {
              if (!tc || typeof tc !== "object") continue;
              const raw = (tc as { tool?: unknown }).tool;
              if (typeof raw !== "string") continue;
              const name = raw.trim();
              if (!name) continue;
              if (!knownToolNames.has(name)) {
                rowUnknownTools.push(name);
                unknownToolNames.add(name);
              }
            }
            if (rowUnknownTools.length > 0) {
              const unique = [...new Set(rowUnknownTools)];
              errors.push(
                `Row ${rowNum}: tool${unique.length === 1 ? "" : "s"} ${unique
                  .map((t) => `"${t}"`)
                  .join(", ")} not found in your Tools tab`,
              );
              return;
            }

            tests.push({
              name: row.name.trim(),
              conversation_history: row.conversation_history.trim(),
              tool_calls: row.tool_calls.trim(),
            });
          }
        });

        if (errors.length > 0) {
          const tail =
            errors.slice(0, 5).join("\n") +
            (errors.length > 5
              ? `\n...and ${errors.length - 5} more errors`
              : "");
          // When any unknown tools were referenced, prepend a single
          // clear guidance line so the user immediately knows what to
          // do: add the missing tools under the Tools tab and re-upload.
          if (unknownToolNames.size > 0) {
            const list = [...unknownToolNames].map((t) => `"${t}"`).join(", ");
            const oneTool = unknownToolNames.size === 1;
            setParseError(
              `${oneTool ? "A tool" : "One or more tools"} referenced in your CSV ${
                oneTool ? "doesn't" : "don't"
              } exist in your Tools tab: ${list}. Add ${
                oneTool ? "it" : "them"
              } under Tools before uploading these tests.\n\n${tail}`,
            );
          } else {
            setParseError(tail);
          }
          return;
        }

        setParsedTests(tests);
      },
      error: (error) => {
        setParseError(`Failed to parse CSV: ${error.message}`);
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith(".csv")) {
      handleFileChange(file);
    } else {
      setParseError("Please upload a .csv file");
    }
  };

  const handleSubmit = async () => {
    if (parsedTests.length === 0 || !testType) return;

    try {
      setIsUploading(true);
      setUploadError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const tests = parsedTests.map((test) => {
        const conversation_history = JSON.parse(test.conversation_history);

        if (isResponseType) {
          // Send the resolved EvaluatorRefPayload[] (same shape as the
          // single-test POST /tests `evaluators` field). The legacy
          // `criteria` field is no longer sent — its value lives inside
          // `variable_values.criteria` on the attached default evaluator
          // when the user provided a plain-string evaluators cell.
          return {
            name: test.name,
            conversation_history,
            evaluators: test.evaluators ?? [],
          };
        } else {
          const tool_calls = JSON.parse(test.tool_calls!);
          return {
            name: test.name,
            conversation_history,
            tool_calls,
          };
        }
      });

      const body: {
        type: TestType;
        tests: typeof tests;
        agent_uuids?: string[];
      } = { type: testType, tests };
      if (lockedAgentUuid) {
        body.agent_uuids = [lockedAgentUuid];
      } else if (assignToAgents && selectedAgentUuids.length > 0) {
        body.agent_uuids = selectedAgentUuids;
      }

      const response = await fetch(`${backendUrl}/tests/bulk`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        const fallbackMessages: Record<number, string> = {
          400: "Invalid request — check for duplicate test names or missing fields",
          403: "You don't have permission to access one or more of the selected agents",
          404: "One or more selected agents were not found",
        };
        throw new Error(
          errorData?.detail ||
            errorData?.message ||
            fallbackMessages[response.status] ||
            "Failed to bulk upload tests",
        );
      }

      const result = await response.json();

      onSuccess();

      if (result.warnings && result.warnings.length > 0) {
        setUploadWarnings(result.warnings);
      } else {
        onClose();
      }
    } catch (err) {
      console.error("Error bulk uploading tests:", err);
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload tests",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const toggleAgentSelection = (uuid: string) => {
    setSelectedAgentUuids((prev) =>
      prev.includes(uuid) ? prev.filter((id) => id !== uuid) : [...prev, uuid],
    );
  };

  // ----- Preview-cell renderers (closed over `knownToolNames` etc.) -----

  // Render the parsed `conversation_history` as a stack of tagged messages
  // (role badge + truncated content). The JSON has already passed parser
  // validation, so we should never hit the `invalid` fallback in practice
  // — it's a defensive guard.
  const renderConversationHistory = (historyJson: string) => {
    let messages: { role?: string; content?: string }[] = [];
    try {
      const parsed = JSON.parse(historyJson);
      if (Array.isArray(parsed)) messages = parsed;
    } catch {
      return <span className="italic text-muted-foreground">invalid JSON</span>;
    }
    if (messages.length === 0) {
      return <span className="italic text-muted-foreground">(empty)</span>;
    }
    return (
      <div className="space-y-1">
        {messages.map((msg, i) => {
          const role = String(msg.role ?? "").toLowerCase();
          const isUser = role === "user";
          return (
            <div key={i} className="flex gap-2">
              <span
                className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide leading-tight mt-0.5 ${
                  isUser
                    ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    : "bg-foreground/10 text-foreground"
                }`}
              >
                {role || "?"}
              </span>
              <span className="line-clamp-3 break-words">
                {String(msg.content ?? "")}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  // Render the parsed `tool_calls` JSON for a row. Each entry resolves the
  // `tool` name against `knownToolNames` (custom tools + inbuilt tool ids):
  //   - known    → tool name links to /tools (where users see/edit tools)
  //   - unknown  → red error pill (defensive guard only — parser-level
  //                validation now rejects rows with unknown tools, so a
  //                fully-parsed test should never hit this branch in
  //                practice)
  // For each entry we also surface the `is_called: false` and
  // `accept_any_arguments: true` flags as small badges, plus an inline
  // key=value list of expected arguments when present.
  const renderToolCallsCell = (toolCallsJson?: string) => {
    if (!toolCallsJson) {
      return <span className="italic text-muted-foreground">—</span>;
    }
    let toolCalls: Array<{
      tool?: string;
      arguments?: Record<string, unknown>;
      is_called?: boolean;
      accept_any_arguments?: boolean;
    }> = [];
    try {
      const parsed = JSON.parse(toolCallsJson);
      if (Array.isArray(parsed)) toolCalls = parsed;
    } catch {
      return <span className="italic text-muted-foreground">invalid JSON</span>;
    }
    if (toolCalls.length === 0) {
      return (
        <span className="italic text-red-500">empty tool_calls array</span>
      );
    }

    const renderArgs = (
      args: Record<string, unknown> | undefined,
      acceptAny: boolean,
    ) => {
      if (acceptAny) {
        return (
          <span className="italic text-muted-foreground">
            any arguments accepted
          </span>
        );
      }
      const entries = args ? Object.entries(args) : [];
      if (entries.length === 0) {
        return (
          <span className="italic text-muted-foreground">no arguments</span>
        );
      }
      return (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {entries.map(([k, v]) => (
            <code key={k} className="font-mono text-[11px] text-foreground">
              {k}=
              <span className="text-muted-foreground">
                {typeof v === "string" ? `"${v}"` : JSON.stringify(v)}
              </span>
            </code>
          ))}
        </div>
      );
    };

    return (
      <div className="space-y-2">
        {toolCalls.map((tc, i) => {
          const toolName = String(tc.tool ?? "");
          // While the tools list is still loading we don't have enough
          // info to flag unknowns — render the name as plain monospace
          // text so we don't show a false-positive red error pill that
          // disappears a moment later when the fetch lands.
          const knownStatus: "loading" | "known" | "unknown" = !toolsFetched
            ? "loading"
            : toolName && knownToolNames.has(toolName)
              ? "known"
              : "unknown";
          // `is_called` defaults to true; the user only ever sets `false`
          // to assert the agent should NOT call this tool.
          const isCalled = tc.is_called !== false;
          const acceptAny = tc.accept_any_arguments === true;

          return (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                {knownStatus === "known" ? (
                  <Link
                    href="/tools"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${HELPER_LINK_CLASS} font-mono`}
                  >
                    {toolName}
                  </Link>
                ) : knownStatus === "loading" ? (
                  <code className="font-mono text-foreground">
                    {toolName || "(missing tool name)"}
                  </code>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono bg-red-500/10 text-red-600 border border-red-500/30"
                    title="This tool isn't on the platform — add it under Tools before running this test"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                      />
                    </svg>
                    {toolName || "(missing tool name)"}
                  </span>
                )}
                {!isCalled && (
                  <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-red-500/10 text-red-600 font-medium">
                    should NOT be called
                  </span>
                )}
              </div>
              {isCalled && (
                <div className="text-[11px] text-foreground pl-1">
                  {renderArgs(tc.arguments, acceptAny)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`relative w-full mx-4 bg-background rounded-2xl shadow-2xl border border-border flex flex-col max-h-[85vh] transition-[max-width] duration-300 ease-out ${
          parsedTests.length > 0 ? "md:max-w-[80vw]" : "md:max-w-[50vw]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Bulk upload tests
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div
          ref={dialogBodyRef}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-6"
        >
          {/* Step 1: Test Type — two side-by-side option cards so the
              one-line description sits next to each title, helping the
              user pick before clicking. Selected card uses the same
              filled-foreground look the old segmented toggle had. */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Select the type of test
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
              <button
                type="button"
                onClick={() => {
                  setTestType("response");
                  setCsvFile(null);
                  setParsedTests([]);
                  setParseError(null);
                  setUploadError(null);
                  setPendingFile(null);
                  setSelectedEvaluators([]);
                  setCommittedEvaluators([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className={`text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                  isResponseType
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border hover:bg-muted/50"
                }`}
              >
                <div className="text-sm font-medium mb-0.5">Next Reply</div>
                <div
                  className={`text-xs leading-snug ${
                    isResponseType
                      ? "text-background/80"
                      : "text-muted-foreground"
                  }`}
                >
                  Grade the agent&apos;s text reply to the last user message
                  against your evaluators.
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestType("tool_call");
                  setCsvFile(null);
                  setParsedTests([]);
                  setParseError(null);
                  setUploadError(null);
                  setPendingFile(null);
                  setSelectedEvaluators([]);
                  setCommittedEvaluators([]);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className={`text-left px-4 py-3 rounded-lg border transition-colors cursor-pointer ${
                  testType === "tool_call"
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background border-border hover:bg-muted/50"
                }`}
              >
                <div className="text-sm font-medium mb-0.5">Tool Call</div>
                <div
                  className={`text-xs leading-snug ${
                    testType === "tool_call"
                      ? "text-background/80"
                      : "text-muted-foreground"
                  }`}
                >
                  Check which tool the agent invokes and the arguments it
                  passes.
                </div>
              </button>
            </div>
          </div>

          {/* Step 1.5: Evaluator picker — response uploads only.
              The CSV format depends on which evaluators (and which of
              their variables) the user wants to attach, so we ask for
              that up-front and don't show the upload section until at
              least one evaluator is picked. */}
          {isResponseType && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Select evaluators to attach
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                These evaluators will be attached to every test you upload
              </p>
              {evaluatorsFetchError && (
                <p className="text-xs text-red-500 mb-2">
                  Failed to load evaluators: {evaluatorsFetchError}. Refresh and
                  try again.
                </p>
              )}
              <MultiSelectPicker
                items={availableLLMEvaluators.map((e) => ({
                  uuid: e.uuid,
                  name: e.name,
                }))}
                selectedItems={selectedEvaluators.map((e) => ({
                  uuid: e.uuid,
                  name: e.name,
                }))}
                onSelectionChange={(items) => {
                  const next = items
                    .map((i) =>
                      availableLLMEvaluators.find((e) => e.uuid === i.uuid),
                    )
                    .filter((e): e is LLMEvaluatorOption => e !== undefined);
                  setSelectedEvaluators(next);
                  // While the dropdown is open we defer; selection stays
                  // "live" only in the trigger pills and dropdown checks.
                  // When the dropdown is closed, the only way to change
                  // selection is removing a pill via its X — commit
                  // immediately so the sections below reflect the
                  // change.
                  if (pickerOpen) return;
                  commitEvaluatorSelection(next);
                }}
                onOpenChange={(open) => {
                  setPickerOpen(open);
                  if (open) return;
                  commitEvaluatorSelection(selectedEvaluators);
                }}
                placeholder={
                  evaluatorsLoading
                    ? "Loading evaluators"
                    : "Select one or more evaluators"
                }
                searchPlaceholder="Search evaluators"
                isLoading={evaluatorsLoading}
                disabled={evaluatorsLoading || !!evaluatorsFetchError}
              />
            </div>
          )}

          {/* Step 2: CSV Upload (only after type + (for response) at least
              one evaluator are picked) */}
          {testType && (!isResponseType || committedEvaluators.length > 0) && (
            <div>
              {parsedTests.length === 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadGuidelines}
                    className="h-9 px-3 rounded-md text-xs font-semibold border border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 hover:border-blue-500/60 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                      />
                    </svg>
                    Download CSV format guidelines
                  </button>
                </div>
              )}

              {/* Backing-fetch failures are the only state worth
                  surfacing — loading happens silently in the background,
                  and a CSV dropped while in flight is auto-parsed once
                  the fetch lands (see deferred-parse effect). */}
              {isResponseType && evaluatorsFetchError && (
                <p className="text-xs text-red-500 mb-3">
                  Failed to load evaluators: {evaluatorsFetchError}. Refresh and
                  try again.
                </p>
              )}
              {!isResponseType && toolsFetchError && (
                <p className="text-xs text-red-500 mb-3">
                  Failed to load tools: {toolsFetchError}. Refresh and try
                  again.
                </p>
              )}

              {/* Drop zone */}
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                  csvFile
                    ? "border-foreground/30 bg-muted/30"
                    : "border-border hover:border-muted-foreground"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) =>
                    handleFileChange(e.target.files?.[0] || null)
                  }
                  className="hidden"
                />
                {csvFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-5 h-5 text-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-foreground">
                      {csvFile.name}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCsvFile(null);
                        setParsedTests([]);
                        setParseError(null);
                        setUploadError(null);
                        setPendingFile(null);
                        if (fileInputRef.current)
                          fileInputRef.current.value = "";
                      }}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <svg
                      className="w-8 h-8 text-muted-foreground mx-auto mb-2"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                      />
                    </svg>
                    <p className="text-sm text-muted-foreground">
                      Drag and drop a CSV file here, or click to browse
                    </p>
                  </>
                )}
              </div>

              {/* Parse Error */}
              {parseError && (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-500 whitespace-pre-line">
                    {parseError}
                  </p>
                </div>
              )}

              {/* Sample CSV — placed below the dropzone, with a tip
                  callout pointing at it. Hidden once a CSV has parsed
                  so the preview owns the screen. */}
              {parsedTests.length === 0 && (
                <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">
                  <svg
                    className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                    />
                  </svg>
                  <span>
                    <span className="font-semibold">Tip:</span>{" "}
                    <button
                      type="button"
                      onClick={downloadSampleCsv}
                      className="underline underline-offset-2 font-semibold text-emerald-700 dark:text-emerald-300 hover:opacity-80 transition-opacity cursor-pointer"
                    >
                      download the sample CSV
                    </button>{" "}
                    and edit it as a starting point
                  </span>
                </div>
              )}

              {/* Parsed Preview */}
              {parsedTests.length > 0 &&
                isResponseType &&
                (() => {
                  const variableColumns = committedEvaluators.flatMap((e) =>
                    e.variables.map((v) => ({
                      evaluatorUuid: e.uuid,
                      varName: v.name,
                      header: variableColumnName(e.name, v.name),
                    })),
                  );
                  const gridStyle = {
                    gridTemplateColumns: [
                      "160px",
                      "minmax(220px,1fr)",
                      ...variableColumns.map(() => "minmax(220px,1fr)"),
                    ].join(" "),
                  };
                  return (
                    <div className="mt-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        {parsedTests.length}{" "}
                        {parsedTests.length === 1 ? "test" : "tests"} ready to
                        upload
                      </p>
                      <div className="border border-border rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <div
                            className="grid gap-3 px-4 py-2 border-b border-border bg-muted/30"
                            style={gridStyle}
                          >
                            <div className="text-xs font-medium text-muted-foreground">
                              Name
                            </div>
                            <div className="text-xs font-medium text-muted-foreground">
                              Chat history
                            </div>
                            {variableColumns.map((c) => (
                              <div
                                key={`h-${c.evaluatorUuid}-${c.varName}`}
                                className="text-xs font-medium text-muted-foreground font-mono truncate"
                                title={c.header}
                              >
                                {c.header}
                              </div>
                            ))}
                          </div>
                          <div className="max-h-[15rem] overflow-y-auto divide-y divide-border">
                            {parsedTests.slice(0, 50).map((test, idx) => {
                              let turns: TurnObject[] = [];
                              try {
                                const parsed = JSON.parse(
                                  test.conversation_history,
                                );
                                if (Array.isArray(parsed)) turns = parsed;
                              } catch {
                                // Parsed-tests entries already passed JSON
                                // validation; this is a defensive fallback.
                              }
                              const valuesByKey = new Map<string, string>();
                              for (const ref of test.evaluators ?? []) {
                                if (!ref.variable_values) continue;
                                for (const [varName, value] of Object.entries(
                                  ref.variable_values,
                                )) {
                                  valuesByKey.set(
                                    `${ref.evaluator_uuid}/${varName}`,
                                    value,
                                  );
                                }
                              }
                              return (
                                <div
                                  key={idx}
                                  className="grid gap-3 px-4 py-2 text-xs items-start"
                                  style={gridStyle}
                                >
                                  <div
                                    className="truncate text-foreground"
                                    title={test.name}
                                  >
                                    {test.name}
                                  </div>
                                  <div className="min-w-0">
                                    <ChatHistoryPreview turns={turns} />
                                  </div>
                                  {variableColumns.map((c) => {
                                    const value =
                                      valuesByKey.get(
                                        `${c.evaluatorUuid}/${c.varName}`,
                                      ) ?? "";
                                    return (
                                      <div
                                        key={`${idx}-${c.evaluatorUuid}-${c.varName}`}
                                        className="min-w-0 max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap"
                                      >
                                        {value || (
                                          <span className="text-muted-foreground italic">
                                            (empty)
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })}
                            {parsedTests.length > 50 && (
                              <div className="px-4 py-2 text-xs text-muted-foreground">
                                + {parsedTests.length - 50} more rows
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* Tool-call preview keeps the existing table layout — its
                  per-row `tool_calls` column has its own custom rendering. */}
              {parsedTests.length > 0 && !isResponseType && (
                <div className="mt-3 rounded-lg bg-muted/50 border border-border overflow-hidden">
                  <div className="px-3 py-2.5 flex items-center gap-2 border-b border-border">
                    <svg
                      className="w-4 h-4 text-green-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <span className="text-sm font-medium text-foreground">
                      Found {parsedTests.length} test
                      {parsedTests.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                        <tr className="text-left text-muted-foreground">
                          <th className="px-3 py-2 font-medium w-8">#</th>
                          <th className="px-3 py-2 font-medium min-w-[140px]">
                            Name
                          </th>
                          <th className="px-3 py-2 font-medium min-w-[240px]">
                            Conversation history
                          </th>
                          <th className="px-3 py-2 font-medium min-w-[240px]">
                            Expected tool calls
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedTests.map((test, idx) => (
                          <tr
                            key={idx}
                            className="border-t border-border align-top"
                          >
                            <td className="px-3 py-2 text-muted-foreground tabular-nums">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2 font-medium text-foreground break-words">
                              {test.name}
                            </td>
                            <td className="px-3 py-2 text-foreground">
                              {renderConversationHistory(
                                test.conversation_history,
                              )}
                            </td>
                            <td className="px-3 py-2 text-foreground">
                              {renderToolCallsCell(test.tool_calls)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Assign to Agents (optional, hidden when modal is
              locked to a specific agent — see lockedAgentUuid prop). */}
          {testType && parsedTests.length > 0 && !lockedAgentUuid && (
            <div ref={assignAgentsSectionRef}>
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={() => {
                    const next = !assignToAgents;
                    setAssignToAgents(next);
                    if (!next) {
                      setSelectedAgentUuids([]);
                    } else {
                      setTimeout(() => {
                        assignAgentsSectionRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "end",
                        });
                      }, 50);
                    }
                  }}
                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                    assignToAgents
                      ? "bg-foreground border-foreground"
                      : "bg-background border-muted-foreground hover:border-foreground"
                  }`}
                >
                  {assignToAgents && (
                    <svg
                      className="w-3 h-3 text-background"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  )}
                </button>
                <span className="text-sm font-medium text-foreground">
                  Assign tests to agents
                </span>
              </div>

              {assignToAgents && (
                <MultiAgentPicker
                  selectedAgentUuids={selectedAgentUuids}
                  onToggleAgent={toggleAgentSelection}
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          {uploadError && (
            <p className="text-sm text-red-500 mb-3">{uploadError}</p>
          )}
          {uploadWarnings && uploadWarnings.length > 0 && (
            <div className="mb-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <p className="text-sm font-medium text-yellow-500 mb-1">
                Tests created, but with warnings:
              </p>
              <ul className="text-sm text-yellow-500 list-disc list-inside">
                {uploadWarnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            {uploadWarnings ? (
              <button
                onClick={onClose}
                className="h-10 px-5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Done
              </button>
            ) : (
              <>
                <button
                  onClick={onClose}
                  disabled={isUploading}
                  className="h-10 px-4 rounded-lg text-sm font-medium bg-background text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-border"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={
                    isUploading ||
                    parsedTests.length === 0 ||
                    (!lockedAgentUuid &&
                      assignToAgents &&
                      selectedAgentUuids.length === 0)
                  }
                  className="h-10 px-5 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isUploading ? (
                    <>
                      <svg
                        className="w-4 h-4 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Uploading...
                    </>
                  ) : (
                    `Upload ${parsedTests.length > 0 ? parsedTests.length + " " : ""}test${parsedTests.length !== 1 ? "s" : ""}`
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
