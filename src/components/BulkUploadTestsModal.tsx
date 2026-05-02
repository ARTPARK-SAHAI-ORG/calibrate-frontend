"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import Papa from "papaparse";
import JSZip from "jszip";
import { MultiAgentPicker } from "@/components/AgentPicker";
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
};

// The default LLM next-reply evaluator (the one that exposes a single
// `criteria` variable). Resolved by stable backend slug so it survives
// rename. Used as the implicit target when the CSV's `evaluators` cell is a
// plain string instead of a JSON array.
const DEFAULT_NEXT_REPLY_EVALUATOR_SLUG = "default-llm-next-reply";

const SAMPLE_NEXT_REPLY_BASIC_CSV = `name,conversation_history,evaluators
"Greeting test","[{""role"":""assistant"",""content"":""Hello, how can I help you today?""},{""role"":""user"",""content"":""What is your return policy?""}]","The agent should clearly explain the return policy in a helpful and friendly tone"
"Billing question","[{""role"":""user"",""content"":""I was charged twice for my order""}]","The agent should apologize and offer to investigate the duplicate charge"`;

const SAMPLE_NEXT_REPLY_ADVANCED_CSV = `name,conversation_history,evaluators
"Greeting test","[{""role"":""assistant"",""content"":""Hello, how can I help you today?""},{""role"":""user"",""content"":""What is your return policy?""}]","[{""name"":""Correctness"",""variables"":{""criteria"":""The agent should clearly explain the return policy in a helpful and friendly tone""}},{""name"":""Helpfulness""}]"
"Billing question","[{""role"":""user"",""content"":""I was charged twice for my order""}]","[{""name"":""Correctness"",""variables"":{""criteria"":""The agent should apologize and offer to investigate the duplicate charge""}},{""name"":""Helpfulness""}]"`;

const SAMPLE_TOOL_CALL_CSV = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""I want to book room 101 for tomorrow""}]","[{""tool"":""book_room"",""arguments"":{""room"":""101""},""accept_any_arguments"":false}]"
"Weather lookup","[{""role"":""assistant"",""content"":""How can I help?""},{""role"":""user"",""content"":""What is the weather in Bangalore?""}]","[{""tool"":""get_weather"",""arguments"":{},""accept_any_arguments"":true}]"`;

const NEXT_REPLY_README = `BULK UPLOAD - NEXT REPLY TESTS
================================

This ZIP contains two sample CSV files for bulk uploading "Next Reply" tests:

  - sample_next_reply_tests_basic.csv
      Use a plain-text criteria string in the "evaluators" column. This is
      the simplest format and is equivalent to attaching the default LLM
      next-reply evaluator (the one with a single "criteria" variable) to
      every test, with that string filled in as the criteria.

  - sample_next_reply_tests_advanced.csv
      Use a JSON array in the "evaluators" column to attach one or more
      evaluators to each test. Use this format when you want to attach
      evaluators other than the default one, attach multiple evaluators to
      every test, or fill in custom variable values.

Each row in either CSV creates one test. The CSV must have the following
columns:


COLUMNS
-------

1. name
   A unique name for the test. This must be different from every other test
   in the CSV and from any test you have already created.
   Example: "Greeting test"

2. conversation_history
   A JSON array of chat messages in OpenAI's chat format. This represents
   the conversation that has happened so far, before the agent's next reply
   is evaluated. Each message is an object with a "role" and "content" field.

   Supported roles:
     - "user"       — A message from the end user
     - "assistant"  — A message from the agent

   The conversation should end with a user message, since the test evaluates
   the agent's next reply after this conversation.

   Example:
     [
       {"role": "assistant", "content": "Hello, how can I help you today?"},
       {"role": "user", "content": "What is your return policy?"}
     ]

   In CSV, JSON must be enclosed in double quotes, and any double quotes
   inside the JSON must be escaped by doubling them (""). See the sample
   CSVs for the correct format.

3. evaluators
   The evaluator(s) to attach to this test. The cell accepts EITHER a
   plain-text criteria string OR a JSON array of evaluator objects.

   FORMAT A — plain-text criteria (basic CSV):
     A plain-text description of what the agent's response should contain
     or how it should behave in order to pass the test. The default LLM
     next-reply evaluator will be attached to every test, and this string
     will be used as the value of its "criteria" variable.
     Example: "The agent should clearly explain the return policy in a
     helpful and friendly tone"

   FORMAT B — JSON array of evaluators (advanced CSV):
     A JSON array of objects, where each object describes one evaluator to
     attach to the test. Each object has the following fields:

       - "name" (required, string)
         The exact name of an evaluator that already exists in the
         Evaluators tab (either a default evaluator or one you created).
         If the name does not match an existing evaluator, the upload is
         rejected with an error.

       - "variables" (required if the evaluator declares variables, object)
         An object mapping each of the evaluator's variable names to the
         value to use for this test. EVERY variable declared by the
         evaluator must be present and have a non-empty value. For
         evaluators with no variables, pass an empty object ({}) or omit
         the field.

     Example (one evaluator with a "criteria" variable plus another with
     no variables):
       [
         {
           "name": "Correctness",
           "variables": {
             "criteria": "The agent should clearly explain the return policy"
           }
         },
         {"name": "Helpfulness"}
       ]

   IMPORTANT — all rows must use the same set of evaluators. The variable
   VALUES can vary per row, but the list of evaluator names attached to
   each test must be identical across the entire CSV. If the rows attach
   different evaluators, the upload is rejected with an error.

   In CSV, JSON must be enclosed in double quotes, and any double quotes
   inside the JSON must be escaped by doubling them (""). See the advanced
   sample CSV for the correct format.
`;

const TOOL_CALL_README = `BULK UPLOAD - TOOL CALL TESTS
==============================

This ZIP contains a sample CSV file for bulk uploading "Tool Call" tests.
Each row in the CSV creates one test. The CSV must have the following columns:


COLUMNS
-------

1. name
   A unique name for the test. This must be different from every other test
   in the CSV and from any test you have already created.
   Example: "Book room test"

2. conversation_history
   A JSON array of chat messages in OpenAI's chat format. This represents
   the conversation that has happened so far, before the agent's tool call
   behavior is evaluated. Each message is an object with a "role" and
   "content" field.

   Supported roles:
     - "user"       — A message from the end user
     - "assistant"  — A message from the agent

   The conversation should end with a user message, since the test evaluates
   which tools the agent calls after this conversation.

   Example:
     [
       {"role": "user", "content": "I want to book room 101 for tomorrow"}
     ]

   In CSV, JSON must be enclosed in double quotes, and any double quotes
   inside the JSON must be escaped by doubling them (""). See the sample
   CSV for the correct format.

3. tool_calls
   A JSON array of expected tool call objects. Each object describes a tool
   the agent is expected to call (or not call) and what arguments to expect.

   Fields for each tool call object:

     - "tool" (required, string)
       The name of the tool. Must match the tool name exactly as configured
       in your agent.
       Example: "book_room"

     - "arguments" (optional, object)
       The expected arguments the agent should pass to the tool. Each key is
       a parameter name and each value is the expected value. If omitted or
       empty ({}), arguments are not checked — equivalent to setting
       accept_any_arguments to true.
       Example: {"room": "101", "date": "tomorrow"}

     - "accept_any_arguments" (optional, boolean, default: false)
       If true, the test passes regardless of what arguments the agent sends
       to this tool. Useful when you only care that the tool was called, not
       what was passed. When true, the "arguments" field is ignored.

   Examples:
     Tool should be called with specific arguments:
       [{"tool": "book_room", "arguments": {"room": "101"}, "accept_any_arguments": false}]

     Tool should be called, any arguments accepted:
       [{"tool": "get_weather", "arguments": {}, "accept_any_arguments": true}]
`;

export function BulkUploadTestsModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkUploadTestsModalProps) {
  const backendAccessToken = useAccessToken();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const assignAgentsSectionRef = useRef<HTMLDivElement>(null);

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
  // Whether the CSV-format helper block above the dropzone is expanded.
  // Starts open so first-time uploaders see the format spec, auto-collapses
  // as soon as a CSV parses successfully (managed by the effect below) so
  // the help doesn't compete with the parsed-tests preview for screen real
  // estate, and the user can re-open it manually via the toggle.
  const [formatHelpOpen, setFormatHelpOpen] = useState(true);

  // LLM evaluators (defaults + user-owned) available to the tenant — needed
  // to resolve names from the CSV's `evaluators` column to UUIDs and to
  // validate that every variable declared by the evaluator is filled in.
  // Only fetched / used for next-reply tests; tool-call uploads ignore it.
  const [availableLLMEvaluators, setAvailableLLMEvaluators] = useState<
    LLMEvaluatorOption[]
  >([]);
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
      setFormatHelpOpen(true);
      setAssignToAgents(false);
      setSelectedAgentUuids([]);
      setIsUploading(false);
      setUploadError(null);
      setUploadWarnings(null);
      setAvailableLLMEvaluators([]);
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
              "ngrok-skip-browser-warning": "true",
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
            "ngrok-skip-browser-warning": "true",
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

  // Auto-collapse the CSV-format helper as soon as a CSV parses
  // successfully (so the preview owns the screen), and re-expand it once
  // the user clears the parsed tests (back to a "first upload" state).
  // The user can still flip it manually via the toggle either way.
  useEffect(() => {
    setFormatHelpOpen(parsedTests.length === 0);
  }, [parsedTests.length]);

  // UUID of the default LLM next-reply evaluator (a.k.a. "Correctness"),
  // resolved from the fetched evaluators list by stable slug. Undefined
  // until the response-type fetch lands, or if the tenant has removed the
  // evaluator — the helper text falls back to plain styling in that case
  // rather than rendering a broken link.
  const correctnessEvaluatorUuid = availableLLMEvaluators.find(
    (e) => e.slug === DEFAULT_NEXT_REPLY_EVALUATOR_SLUG,
  )?.uuid;

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

  // The set of evaluators attached to every parsed next-reply test.
  // Parser validation guarantees these are identical across rows, so we
  // read from the first row and use it as the canonical list for the
  // preview's pill chips and per-evaluator-with-variables column headers.
  // We hydrate `name` + `variables` by looking up each ref's UUID in the
  // already-fetched LLM evaluators list (the lookup is what was used for
  // CSV-side validation in the first place, so it's guaranteed to hit).
  const previewEvaluators = useMemo(() => {
    if (!isResponseType || parsedTests.length === 0) return [];
    const refs = parsedTests[0].evaluators ?? [];
    return refs
      .map((ref) => {
        const ev = availableLLMEvaluators.find(
          (e) => e.uuid === ref.evaluator_uuid,
        );
        if (!ev) return null;
        return { uuid: ev.uuid, name: ev.name, variables: ev.variables };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [isResponseType, parsedTests, availableLLMEvaluators]);

  const downloadSampleCsv = async () => {
    if (!testType) return;

    const zip = new JSZip();
    if (isResponseType) {
      // Next-reply uploads ship two sample CSVs side-by-side: a "basic"
      // file using a plain-string `evaluators` cell (the default LLM
      // next-reply evaluator with a `criteria` variable) and an "advanced"
      // file demonstrating the JSON-array form for attaching multiple
      // evaluators / custom variables. README explains both.
      zip.file(
        "sample_next_reply_tests_basic.csv",
        SAMPLE_NEXT_REPLY_BASIC_CSV,
      );
      zip.file(
        "sample_next_reply_tests_advanced.csv",
        SAMPLE_NEXT_REPLY_ADVANCED_CSV,
      );
      zip.file("README.txt", NEXT_REPLY_README);
    } else {
      zip.file("sample_tool_call_tests.csv", SAMPLE_TOOL_CALL_CSV);
      zip.file("README.txt", TOOL_CALL_README);
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = isResponseType
      ? "sample_next_reply_tests.zip"
      : "sample_tool_call_tests.zip";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Resolve a single row's `evaluators` cell into the API-shaped
  // EvaluatorRefPayload[] that the backend expects per test. Accepts either:
  //   - a plain-text string  → attaches the default LLM next-reply evaluator
  //                            with that string as the `criteria` variable
  //   - a JSON array of {name, variables?} → looks each entry up by name in
  //                            the tenant's evaluator list and validates that
  //                            every declared variable is filled in
  // Returns either the resolved refs or a list of human-readable errors
  // (prefixed by the caller with the row number).
  const resolveEvaluatorsCell = (
    cell: string,
    evaluators: LLMEvaluatorOption[],
  ): { refs: EvaluatorRefPayload[]; errors: string[] } => {
    const trimmed = cell.trim();
    const errors: string[] = [];

    // JSON-array form is detected by leading `[`. Anything else is treated as
    // a plain criteria string, even if it happens to be parseable as some
    // other JSON value (a bare number, "true", etc.) — this avoids surprising
    // users whose criteria string starts with a digit or quote.
    if (trimmed.startsWith("[")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return {
          refs: [],
          errors: ["evaluators is not valid JSON"],
        };
      }
      if (!Array.isArray(parsed)) {
        return {
          refs: [],
          errors: ["evaluators must be a JSON array"],
        };
      }
      if (parsed.length === 0) {
        return {
          refs: [],
          errors: ["evaluators array must contain at least one evaluator"],
        };
      }

      const refs: EvaluatorRefPayload[] = [];
      const seenUuids = new Set<string>();
      parsed.forEach((entry, i) => {
        const label = `evaluator #${i + 1}`;
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          errors.push(`${label}: must be a JSON object`);
          return;
        }
        const obj = entry as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : "";
        if (!name) {
          errors.push(`${label}: missing "name"`);
          return;
        }

        const evaluator = evaluators.find((e) => e.name === name);
        if (!evaluator) {
          errors.push(
            `evaluator "${name}" does not exist in your Evaluators tab`,
          );
          return;
        }
        if (seenUuids.has(evaluator.uuid)) {
          errors.push(`evaluator "${name}" listed more than once`);
          return;
        }
        seenUuids.add(evaluator.uuid);

        // `variables` may be omitted entirely for evaluators that declare
        // none; for those that do, every declared name must have a
        // non-empty string value.
        let providedVars: Record<string, unknown> = {};
        if (obj.variables !== undefined && obj.variables !== null) {
          if (
            typeof obj.variables !== "object" ||
            Array.isArray(obj.variables)
          ) {
            errors.push(`evaluator "${name}": "variables" must be an object`);
            return;
          }
          providedVars = obj.variables as Record<string, unknown>;
        }

        const expectedNames = evaluator.variables.map((v) => v.name);
        const variableValues: Record<string, string> = {};
        const missing: string[] = [];
        for (const v of evaluator.variables) {
          const raw = providedVars[v.name];
          if (typeof raw !== "string" || !raw.trim()) {
            missing.push(v.name);
            continue;
          }
          variableValues[v.name] = raw;
        }
        if (missing.length > 0) {
          errors.push(
            `evaluator "${name}": missing variable value(s) for ${missing
              .map((n) => `"${n}"`)
              .join(", ")}`,
          );
        }
        const extras = Object.keys(providedVars).filter(
          (k) => !expectedNames.includes(k),
        );
        if (extras.length > 0) {
          errors.push(
            `evaluator "${name}": unknown variable(s) ${extras
              .map((n) => `"${n}"`)
              .join(", ")}`,
          );
        }

        const ref: EvaluatorRefPayload = { evaluator_uuid: evaluator.uuid };
        if (evaluator.variables.length > 0) {
          ref.variable_values = variableValues;
        }
        refs.push(ref);
      });

      return { refs, errors };
    }

    // Plain-string form → default LLM next-reply evaluator with the string
    // as its `criteria` variable. We resolve by stable slug because the
    // evaluator's `name` is tenant-mutable.
    const correctness = evaluators.find(
      (e) => e.slug === DEFAULT_NEXT_REPLY_EVALUATOR_SLUG,
    );
    if (!correctness) {
      return {
        refs: [],
        errors: [
          `default LLM next-reply evaluator (slug "${DEFAULT_NEXT_REPLY_EVALUATOR_SLUG}") was not found — add it to your evaluators or use the JSON-array form`,
        ],
      };
    }
    return {
      refs: [
        {
          evaluator_uuid: correctness.uuid,
          variable_values: { criteria: trimmed },
        },
      ],
      errors: [],
    };
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

        const requiredColumns = isResponseType
          ? ["name", "conversation_history", "evaluators"]
          : ["name", "conversation_history", "tool_calls"];

        const headers = Object.keys(data[0]);
        const missingColumns = requiredColumns.filter(
          (col) => !headers.includes(col),
        );
        if (missingColumns.length > 0) {
          setParseError(
            `Missing required columns: ${missingColumns.join(", ")}`,
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
        // Tracks the canonical sorted list of evaluator UUIDs from the first
        // successfully-parsed response row, so we can flag any subsequent
        // row whose evaluator set differs.
        let referenceEvaluatorUuids: string[] | null = null;
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
            if (!row.evaluators?.trim()) {
              errors.push(`Row ${rowNum}: missing evaluators`);
              return;
            }

            const { refs, errors: rowErrors } = resolveEvaluatorsCell(
              row.evaluators,
              availableLLMEvaluators,
            );
            if (rowErrors.length > 0) {
              for (const err of rowErrors) {
                errors.push(`Row ${rowNum}: ${err}`);
              }
              return;
            }

            const sortedUuids = refs
              .map((r) => r.evaluator_uuid)
              .slice()
              .sort();
            if (referenceEvaluatorUuids === null) {
              referenceEvaluatorUuids = sortedUuids;
            } else if (
              sortedUuids.length !== referenceEvaluatorUuids.length ||
              sortedUuids.some(
                (uuid, i) => uuid !== referenceEvaluatorUuids![i],
              )
            ) {
              errors.push(
                `Row ${rowNum}: evaluators don't match the first row — all rows must attach the same set of evaluators`,
              );
              return;
            }

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
            const list = [...unknownToolNames]
              .map((t) => `"${t}"`)
              .join(", ");
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
      if (assignToAgents && selectedAgentUuids.length > 0) {
        body.agent_uuids = selectedAgentUuids;
      }

      const response = await fetch(`${backendUrl}/tests/bulk`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
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
        <span className="italic text-red-500">
          empty tool_calls array
        </span>
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

  // Render one cell of the per-evaluator-with-variables column. If the
  // evaluator has a single variable (the common case — e.g. Correctness's
  // `criteria`) we just dump the value. With multiple variables we prefix
  // each value with a tiny monospace `varName:` label so the user can tell
  // which variable's value is which.
  const renderEvaluatorVariableCell = (
    test: ParsedTest,
    evaluator: { uuid: string; variables: EvaluatorVariableDef[] },
  ) => {
    const ref = test.evaluators?.find(
      (r) => r.evaluator_uuid === evaluator.uuid,
    );
    const values = ref?.variable_values ?? {};
    if (evaluator.variables.length === 1) {
      const v = evaluator.variables[0];
      return (
        <div className="line-clamp-4 whitespace-pre-wrap break-words">
          {values[v.name] ?? ""}
        </div>
      );
    }
    return (
      <div className="space-y-1.5">
        {evaluator.variables.map((v) => (
          <div key={v.name}>
            <code className="text-[10px] font-mono text-muted-foreground block">
              {v.name}
            </code>
            <span className="line-clamp-3 whitespace-pre-wrap break-words">
              {values[v.name] ?? ""}
            </span>
          </div>
        ))}
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
          parsedTests.length > 0 ? "max-w-5xl" : "max-w-xl"
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
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Step 1: Test Type */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-3">
              Select the type of test
            </label>
            <div className="flex rounded-lg border border-border overflow-hidden w-fit">
              <button
                type="button"
                onClick={() => {
                  setTestType("response");
                  setCsvFile(null);
                  setParsedTests([]);
                  setParseError(null);
                  setUploadError(null);
                  setPendingFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                  isResponseType
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                Next Reply
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
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-l border-border ${
                  testType === "tool_call"
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                Tool Call
              </button>
            </div>
          </div>

          {/* Step 2: CSV Upload (only if type selected) */}
          {testType && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-foreground">
                  Upload CSV
                </label>
                <button
                  onClick={downloadSampleCsv}
                  className="h-9 px-3 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
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
                  Download sample CSV
                </button>
              </div>

              {/* Format description — once a CSV has parsed successfully
                  it auto-collapses so the preview owns the screen, but
                  remains togglable via the disclosure button below. */}
              {parsedTests.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFormatHelpOpen((o) => !o)}
                  className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  aria-expanded={formatHelpOpen}
                >
                  <svg
                    className={`w-3.5 h-3.5 transition-transform ${
                      formatHelpOpen ? "rotate-90" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.25 4.5l7.5 7.5-7.5 7.5"
                    />
                  </svg>
                  {formatHelpOpen
                    ? "Hide CSV format details"
                    : "Show CSV format details"}
                </button>
              )}
              {formatHelpOpen &&
                (isResponseType ? (
                <div className="text-xs text-muted-foreground mb-3 leading-relaxed space-y-2">
                  <p>Your CSV needs three columns per row:</p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                      <code className="font-mono text-foreground">name</code> —
                      a unique test name
                    </li>
                    <li>
                      <code className="font-mono text-foreground">
                        conversation_history
                      </code>{" "}
                      — JSON array of OpenAI-format chat messages
                    </li>
                    <li>
                      <code className="font-mono text-foreground">
                        evaluators
                      </code>{" "}
                      — accepts either:
                      <ul className="list-disc pl-5 mt-1.5 space-y-1.5">
                        <li>
                          A plain criteria string — attaches the default{" "}
                          {correctnessEvaluatorUuid ? (
                            <Link
                              href={`/evaluators/${correctnessEvaluatorUuid}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={HELPER_LINK_CLASS}
                            >
                              Correctness
                            </Link>
                          ) : (
                            <span className="text-foreground">Correctness</span>
                          )}{" "}
                          evaluator with that string as its{" "}
                          <code className="font-mono text-foreground">
                            criteria
                          </code>{" "}
                          variable.
                        </li>
                        <li>
                          A JSON array like{" "}
                          <code className="font-mono text-foreground">
                            {`[{"name":"...","variables":{...}}]`}
                          </code>{" "}
                          to attach one or more evaluators by name with their
                          variable values.
                        </li>
                      </ul>
                    </li>
                  </ul>
                  <p>
                    Evaluators must already exist in the{" "}
                    <Link
                      href="/evaluators"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={HELPER_LINK_CLASS}
                    >
                      Evaluators
                    </Link>{" "}
                    tab, every variable they declare must be filled, and all
                    rows must use the same set of evaluators (variable values
                    can differ per row).
                  </p>
                  <p>
                    Download the sample CSV ZIP for basic and advanced examples
                    plus a README with the full format.
                  </p>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground mb-3 leading-relaxed space-y-2">
                  <p>Your CSV needs three columns per row:</p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li>
                      <code className="font-mono text-foreground">name</code> —
                      a unique test name
                    </li>
                    <li>
                      <code className="font-mono text-foreground">
                        conversation_history
                      </code>{" "}
                      — JSON array of OpenAI-format chat messages
                    </li>
                    <li>
                      <code className="font-mono text-foreground">
                        tool_calls
                      </code>{" "}
                      — JSON array of expected tool-call objects, each with:
                      <ul className="list-disc pl-5 mt-1.5 space-y-1.5">
                        <li>
                          <code className="font-mono text-foreground">
                            tool
                          </code>{" "}
                          (required) — the tool&apos;s name
                        </li>
                        <li>
                          <code className="font-mono text-foreground">
                            arguments
                          </code>{" "}
                          (optional) — object of expected argument values
                        </li>
                        <li>
                          <code className="font-mono text-foreground">
                            accept_any_arguments
                          </code>{" "}
                          (optional) — set to{" "}
                          <code className="font-mono text-foreground">
                            true
                          </code>{" "}
                          to skip argument matching
                        </li>
                      </ul>
                    </li>
                  </ul>
                  <p>
                    Download the sample CSV ZIP for an example plus a README
                    with the full format.
                  </p>
                </div>
              ))}

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

              {/* Evaluator pills — response uploads only. Rendered as a
                  standalone row OUTSIDE the parsed-preview card so it
                  reads as metadata about the upload (which evaluators
                  every row shares) rather than a header strip stuck to
                  the table. The pill set is identical for every row
                  (parser validation guarantees it), so we render them
                  once and link each to its evaluator detail page. */}
              {parsedTests.length > 0 &&
                isResponseType &&
                previewEvaluators.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-semibold text-foreground mb-2">
                      Evaluators
                    </h4>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {previewEvaluators.map((ev) => (
                        <Link
                          key={ev.uuid}
                          href={`/evaluators/${ev.uuid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-border bg-background text-foreground hover:bg-muted transition-colors"
                        >
                          {ev.name}
                          <svg
                            className="w-3 h-3 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                            />
                          </svg>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

              {/* Parsed Preview */}
              {parsedTests.length > 0 && (
                <div className="mt-3 rounded-lg bg-muted/50 border border-border overflow-hidden">
                  {/* "Found N tests" header */}
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

                  {/* Per-test table */}
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
                          {isResponseType ? (
                            previewEvaluators
                              .filter((ev) => ev.variables.length > 0)
                              .map((ev) => (
                                <th
                                  key={ev.uuid}
                                  className="px-3 py-2 font-medium min-w-[200px]"
                                >
                                  {ev.name}
                                </th>
                              ))
                          ) : (
                            <th className="px-3 py-2 font-medium min-w-[240px]">
                              Expected tool calls
                            </th>
                          )}
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
                            {isResponseType ? (
                              previewEvaluators
                                .filter((ev) => ev.variables.length > 0)
                                .map((ev) => (
                                  <td
                                    key={ev.uuid}
                                    className="px-3 py-2 text-foreground"
                                  >
                                    {renderEvaluatorVariableCell(test, ev)}
                                  </td>
                                ))
                            ) : (
                              <td className="px-3 py-2 text-foreground">
                                {renderToolCallsCell(test.tool_calls)}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Assign to Agents (optional) */}
          {testType && parsedTests.length > 0 && (
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
                    (assignToAgents && selectedAgentUuids.length === 0)
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
