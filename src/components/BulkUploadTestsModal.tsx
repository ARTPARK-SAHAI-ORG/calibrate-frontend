"use client";

import React, { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import Papa from "papaparse";
import JSZip from "jszip";
import type { Agent } from "@/components/AgentPicker";

type TestType = "response" | "tool_call";

type ParsedTest = {
  name: string;
  conversation_history: string;
  criteria?: string;
  tool_calls?: string;
};

type BulkUploadTestsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

const SAMPLE_NEXT_REPLY_CSV = `name,conversation_history,criteria
"Greeting test","[{""role"":""assistant"",""content"":""Hello, how can I help you today?""},{""role"":""user"",""content"":""What is your return policy?""}]","The agent should clearly explain the return policy in a helpful and friendly tone"
"Billing question","[{""role"":""user"",""content"":""I was charged twice for my order""}]","The agent should apologize and offer to investigate the duplicate charge"`;

const SAMPLE_TOOL_CALL_CSV = `name,conversation_history,tool_calls
"Book room test","[{""role"":""user"",""content"":""I want to book room 101 for tomorrow""}]","[{""tool"":""book_room"",""arguments"":{""room"":""101""},""accept_any_arguments"":false}]"
"Weather lookup","[{""role"":""assistant"",""content"":""How can I help?""},{""role"":""user"",""content"":""What is the weather in Bangalore?""}]","[{""tool"":""get_weather"",""arguments"":{},""accept_any_arguments"":true}]"
"No tool expected","[{""role"":""user"",""content"":""Just say hello""}]","[]"`;

const NEXT_REPLY_README = `BULK UPLOAD - NEXT REPLY TESTS
================================

This ZIP contains a sample CSV file for bulk uploading "Next Reply" tests.
Each row in the CSV creates one test. The CSV must have the following columns:


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
   CSV for the correct format.

3. criteria
   A plain-text description of what the agent's response should contain or
   how it should behave in order to pass the test. An LLM judge will evaluate
   the agent's actual response against this criteria.
   Example: "The agent should clearly explain the return policy in a helpful
   and friendly tone"
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

     - "is_called" (optional, boolean, default: true)
       If set to false, the test asserts that this tool should NOT be called.
       Useful for verifying the agent avoids calling certain tools.

   To test that NO tools are called at all, use an empty array: []

   Examples:
     Tool should be called with specific arguments:
       [{"tool": "book_room", "arguments": {"room": "101"}, "accept_any_arguments": false}]

     Tool should be called, any arguments accepted:
       [{"tool": "get_weather", "arguments": {}, "accept_any_arguments": true}]

     Tool should NOT be called:
       [{"tool": "delete_account", "is_called": false}]
`;

export function BulkUploadTestsModal({
  isOpen,
  onClose,
  onSuccess,
}: BulkUploadTestsModalProps) {
  const backendAccessToken = useAccessToken();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const agentTriggerRef = useRef<HTMLDivElement>(null);
  const assignAgentsSectionRef = useRef<HTMLDivElement>(null);

  const [testType, setTestType] = useState<TestType | null>(null);
  const isResponseType = testType === "response";
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedTests, setParsedTests] = useState<ParsedTest[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [assignToAgents, setAssignToAgents] = useState(false);
  const [selectedAgentUuids, setSelectedAgentUuids] = useState<string[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [agentSearchQuery, setAgentSearchQuery] = useState("");
  const [language, setLanguage] = useState<"english" | "hindi" | "kannada">(
    "english"
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setTestType(null);
      setCsvFile(null);
      setParsedTests([]);
      setParseError(null);
      setLanguage("english");
      setAssignToAgents(false);
      setSelectedAgentUuids([]);
      setAgentDropdownOpen(false);
      setAgentSearchQuery("");
      setIsUploading(false);
      setUploadError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const fetchAgents = async () => {
      if (!backendAccessToken || !assignToAgents) return;
      if (agents.length > 0) return;

      try {
        setAgentsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const response = await fetch(`${backendUrl}/agents`, {
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

        if (!response.ok) return;

        const data = await response.json();
        const formattedAgents: Agent[] = Array.isArray(data)
          ? data.map((agent: any) => ({
              uuid: agent.uuid,
              name: agent.name || agent.agent_name || String(agent),
              type: agent.type === "connection" ? "connection" : "agent",
              verified:
                agent.type === "connection"
                  ? agent.config?.connection_verified === true
                  : true,
            }))
          : [];
        setAgents(formattedAgents);
      } catch (err) {
        console.error("Error fetching agents:", err);
      } finally {
        setAgentsLoading(false);
      }
    };

    fetchAgents();
  }, [backendAccessToken, assignToAgents, agents.length]);

  const downloadSampleCsv = async () => {
    if (!testType) return;
    const csv = isResponseType ? SAMPLE_NEXT_REPLY_CSV : SAMPLE_TOOL_CALL_CSV;
    const csvFilename = isResponseType
      ? "sample_next_reply_tests.csv"
      : "sample_tool_call_tests.csv";

    const readme = isResponseType ? NEXT_REPLY_README : TOOL_CALL_README;

    const zip = new JSZip();
    zip.file(csvFilename, csv);
    zip.file("README.txt", readme);

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

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    setCsvFile(file);
    setParseError(null);
    setParsedTests([]);
    setUploadError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];

        if (data.length === 0) {
          setParseError("CSV file is empty");
          return;
        }

        const requiredColumns = isResponseType
          ? ["name", "conversation_history", "criteria"]
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
            if (!row.criteria?.trim()) {
              errors.push(`Row ${rowNum}: missing criteria`);
              return;
            }
            tests.push({
              name: row.name.trim(),
              conversation_history: row.conversation_history.trim(),
              criteria: row.criteria.trim(),
            });
          } else {
            if (!row.tool_calls?.trim()) {
              errors.push(`Row ${rowNum}: missing tool_calls`);
              return;
            }
            try {
              const toolCalls = JSON.parse(row.tool_calls);
              if (!Array.isArray(toolCalls)) {
                errors.push(`Row ${rowNum}: tool_calls must be a JSON array`);
                return;
              }
            } catch {
              errors.push(`Row ${rowNum}: tool_calls is not valid JSON`);
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
          setParseError(
            errors.slice(0, 5).join("\n") +
              (errors.length > 5
                ? `\n...and ${errors.length - 5} more errors`
                : ""),
          );
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
          return {
            name: test.name,
            conversation_history,
            criteria: test.criteria,
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
        language?: "english" | "hindi" | "kannada";
        agent_uuids?: string[];
      } = { type: testType, tests };
      if (language !== "english") {
        body.language = language;
      }
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
          422: "Validation failed — check your CSV data format",
        };
        throw new Error(
          errorData?.message ||
            errorData?.error ||
            fallbackMessages[response.status] ||
            "Failed to bulk upload tests"
        );
      }

      onSuccess();
      onClose();
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

  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(agentSearchQuery.toLowerCase()) &&
      !selectedAgentUuids.includes(agent.uuid),
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-xl mx-4 bg-background rounded-2xl shadow-2xl border border-border flex flex-col max-h-[85vh]">
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

          {/* Language */}
          {testType && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                Language
              </label>
              <div className="flex rounded-lg border border-border overflow-hidden w-fit">
                {(["english", "hindi", "kannada"] as const).map(
                  (lang, index) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLanguage(lang)}
                      className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                        index > 0 ? "border-l border-border" : ""
                      } ${
                        language === lang
                          ? "bg-foreground text-background"
                          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {lang.charAt(0).toUpperCase() + lang.slice(1)}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Step 2: CSV Upload (only if type selected) */}
          {testType && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-foreground">
                  Upload CSV
                </label>
                <button
                  onClick={downloadSampleCsv}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
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

              {/* Format description */}
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                {isResponseType
                  ? "Your CSV should have three columns: a unique test name, the conversation history as a JSON array of OpenAI-format chat messages, and the evaluation criteria describing the expected agent response. Download the sample CSV for the exact format — it includes a README with detailed column descriptions."
                  : "Your CSV should have three columns: a unique test name, the conversation history as a JSON array of OpenAI-format chat messages, and the expected tool calls as a JSON array specifying which tools should (or should not) be called and their expected arguments. Download the sample CSV for the exact format — it includes a README with detailed column descriptions."}
              </p>

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

              {/* Parsed Preview */}
              {parsedTests.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border">
                  <div className="flex items-center gap-2 mb-2">
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
                  <div className="max-h-32 overflow-y-auto">
                    {parsedTests.map((test, idx) => (
                      <div
                        key={idx}
                        className="text-xs text-muted-foreground py-1 border-b border-border last:border-b-0 truncate"
                      >
                        {test.name}
                      </div>
                    ))}
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
                      setAgentDropdownOpen(false);
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
                <div>
                  {/* Selected agents tags */}
                  <div
                    ref={agentTriggerRef}
                    onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl text-sm bg-background text-foreground border border-border hover:border-muted-foreground transition-colors cursor-pointer flex flex-wrap items-center gap-2"
                  >
                    {selectedAgentUuids.length === 0 ? (
                      <span className="text-muted-foreground">
                        Select agents
                      </span>
                    ) : (
                      selectedAgentUuids.map((uuid) => {
                        const agent = agents.find((a) => a.uuid === uuid);
                        return (
                          <span
                            key={uuid}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-xs font-medium text-foreground"
                          >
                            {agent?.name || uuid}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAgentSelection(uuid);
                              }}
                              className="text-muted-foreground hover:text-foreground"
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
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </span>
                        );
                      })
                    )}
                    <svg
                      className={`w-4 h-4 text-muted-foreground ml-auto flex-shrink-0 transition-transform ${
                        agentDropdownOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </div>

                  {/* Dropdown */}
                  {agentDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[99]"
                        onClick={() => setAgentDropdownOpen(false)}
                      />
                      <div
                        className="fixed bg-background border border-border rounded-xl shadow-xl z-[100] overflow-hidden"
                        style={{
                          ...(agentTriggerRef.current
                            ? (() => {
                                const rect =
                                  agentTriggerRef.current.getBoundingClientRect();
                                const dropdownHeight = 240;
                                const spaceBelow =
                                  window.innerHeight - rect.bottom - 8;
                                const openAbove =
                                  spaceBelow < dropdownHeight &&
                                  rect.top > dropdownHeight;
                                return {
                                  left: rect.left,
                                  width: rect.width,
                                  ...(openAbove
                                    ? {
                                        bottom:
                                          window.innerHeight - rect.top + 8,
                                      }
                                    : { top: rect.bottom + 8 }),
                                };
                              })()
                            : {}),
                        }}
                      >
                        <div className="p-3 border-b border-border">
                          <input
                            type="text"
                            value={agentSearchQuery}
                            onChange={(e) =>
                              setAgentSearchQuery(e.target.value)
                            }
                            placeholder="Search agents"
                            className="w-full h-9 px-3 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {agentsLoading ? (
                            <div className="px-4 py-3 text-sm text-muted-foreground">
                              Loading agents...
                            </div>
                          ) : filteredAgents.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-muted-foreground">
                              No agents found
                            </div>
                          ) : (
                            filteredAgents.map((agent) => {
                              const isSelected = selectedAgentUuids.includes(
                                agent.uuid,
                              );
                              return (
                                <button
                                  key={agent.uuid}
                                  onClick={() =>
                                    toggleAgentSelection(agent.uuid)
                                  }
                                  className={`w-full px-4 py-2.5 text-left text-sm transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                                    isSelected
                                      ? "bg-accent text-foreground"
                                      : "text-foreground hover:bg-muted"
                                  }`}
                                >
                                  <span className="truncate flex items-center gap-1.5">
                                    {agent.name}
                                    {agent.verified === false && (
                                      <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-yellow-500/10 text-yellow-500 flex-shrink-0">
                                        <svg
                                          className="w-3 h-3"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={2.5}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                                          />
                                        </svg>
                                        Unverified
                                      </span>
                                    )}
                                  </span>
                                  <div className="flex items-center gap-2 flex-shrink-0">
                                    <span
                                      className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                        agent.type === "connection"
                                          ? "bg-blue-500/10 text-blue-500"
                                          : "bg-muted text-muted-foreground"
                                      }`}
                                    >
                                      {agent.type === "connection"
                                        ? "Connection"
                                        : "Agent"}
                                    </span>
                                    {isSelected && (
                                      <svg
                                        className="w-4 h-4 text-foreground"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M4.5 12.75l6 6 9-13.5"
                                        />
                                      </svg>
                                    )}
                                  </div>
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          {uploadError && (
            <p className="text-sm text-red-500 mb-3">{uploadError}</p>
          )}
          <div className="flex items-center justify-end gap-3">
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
          </div>
        </div>
      </div>
    </div>
  );
}
