"use client";

import React, { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { ToolPicker, AvailableTool } from "@/components/ToolPicker";
import { INBUILT_TOOLS } from "@/constants/inbuilt-tools";
import { useHideFloatingButton } from "@/components/AppLayout";

type SelectedToolConfig = {
  id: string;
  name: string;
  expectation: "should-call" | "should-not-call";
  acceptAnyParameterValues: boolean;
  isInbuilt: boolean;
  expectedParameters: Array<{
    id: string;
    name: string;
    value: string;
  }>;
};

export type TestConfig = {
  history: Array<{
    role: "assistant" | "user" | "tool";
    content?: string;
    tool_calls?: Array<{
      id: string;
      function: {
        name: string;
        arguments: string;
      };
      type: "function";
    }>;
    tool_call_id?: string;
  }>;
  evaluation: {
    type: "tool_call" | "response";
    tool_calls?: Array<{
      tool: string;
      arguments: Record<string, any>;
      is_called?: boolean;
      accept_any_arguments?: boolean;
    }>;
    criteria?: string;
  };
};

export type EvaluatorVariableDef = {
  name: string;
  description?: string;
  default?: string;
};

// Hydrated evaluator row as returned by GET /tests/{uuid}.evaluators[]
// (`uuid` is the evaluator's id; we expose it as `evaluator_uuid` to match the
// write-side EvaluatorRef shape on POST/PUT bodies)
export type AttachedEvaluatorInit = {
  evaluator_uuid: string;
  name: string;
  description?: string | null;
  slug: string | null;
  variables: EvaluatorVariableDef[];
  variable_values?: Record<string, string> | null;
};

export type EvaluatorRefPayload = {
  evaluator_uuid: string;
  variable_values?: Record<string, string>;
};

// The default LLM "Correctness" evaluator. Identified by a stable backend slug.
const DEFAULT_NEXT_REPLY_EVALUATOR_SLUG = "default-llm-next-reply";

type AttachedEvaluator = {
  evaluator_uuid: string;
  name: string;
  description?: string;
  slug: string | null;
  variables: EvaluatorVariableDef[];
  variable_values: Record<string, string>;
};

type LLMEvaluatorOption = {
  uuid: string;
  name: string;
  description?: string;
  slug: string | null;
  owner_user_id: string | null;
  variables: EvaluatorVariableDef[];
};

type AddTestDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  isEditing: boolean;
  isLoading: boolean;
  isCreating: boolean;
  createError: string | null;
  testName: string;
  setTestName: (name: string) => void;
  validationAttempted: boolean;
  onSubmit: (config: TestConfig, evaluators: EvaluatorRefPayload[]) => void;
  initialTab?: "next-reply" | "tool-invocation";
  initialConfig?: TestConfig;
  initialEvaluators?: AttachedEvaluatorInit[];
};

export function AddTestDialog({
  isOpen,
  onClose,
  isEditing,
  isLoading,
  isCreating,
  createError,
  testName,
  setTestName,
  validationAttempted,
  onSubmit,
  initialTab,
  initialConfig,
  initialEvaluators,
}: AddTestDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const backendAccessToken = useAccessToken();
  const [activeTab, setActiveTab] = useState<"next-reply" | "tool-invocation">(
    initialTab || "next-reply"
  );

  // Available tools state - declared early so it's available for initialConfig parsing
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [availableToolsLoading, setAvailableToolsLoading] = useState(false);

  // Update active tab when initialTab changes (when opening an existing test)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Track if tools have been fetched (even if the result is empty)
  const [toolsFetched, setToolsFetched] = useState(false);

  // Populate fields from initialConfig when editing an existing test
  // Wait for tools fetch to complete so we can properly determine tool types
  useEffect(() => {
    if (initialConfig && toolsFetched) {
      // Parse history and convert to chatMessages format
      if (initialConfig.history && initialConfig.history.length > 0) {
        const messages: Array<{
          id: string;
          role: "agent" | "user" | "tool_call" | "tool_response";
          content: string;
          toolName?: string;
          toolId?: string;
          toolParams?: Array<{ name: string; value: string; group?: string }>;
          isWebhook?: boolean;
          linkedToolCallId?: string;
        }> = [];

        // Helper to format value - stringify objects/arrays for display
        const formatValue = (val: any): string => {
          if (val === null) return "null";
          if (val === undefined) return "";
          if (typeof val === "object") {
            try {
              return JSON.stringify(val, null, 2);
            } catch {
              return String(val);
            }
          }
          return String(val);
        };

        // Track tool call IDs for linking tool responses
        const toolCallIds: string[] = [];

        initialConfig.history.forEach((historyItem, index) => {
          if (historyItem.role === "assistant") {
            if (historyItem.tool_calls && historyItem.tool_calls.length > 0) {
              // This is a tool call message
              const toolCall = historyItem.tool_calls[0];
              let parsedArgs: Record<string, any> = {};
              try {
                parsedArgs = JSON.parse(toolCall.function.arguments);
              } catch {
                parsedArgs = {};
              }

              const toolCallId = toolCall.id || `tool-${index}`;
              toolCallIds.push(toolCallId);

              // Look up the tool by name to check its actual config type
              const tool = availableTools.find(
                (t) => t.name === toolCall.function.name
              );
              const isWebhook = tool?.config?.type === "webhook";

              let toolParams: Array<{
                name: string;
                value: string;
                group?: string;
              }> = [];

              if (isWebhook) {
                // Extract params from body, query with their group (headers are not shown in UI)
                const webhookKeys = ["body", "query"];
                webhookKeys.forEach((groupKey) => {
                  const groupValue = parsedArgs[groupKey];
                  if (
                    groupValue &&
                    typeof groupValue === "object" &&
                    !Array.isArray(groupValue)
                  ) {
                    Object.entries(groupValue).forEach(
                      ([paramName, paramValue]) => {
                        toolParams.push({
                          name: paramName,
                          value: formatValue(paramValue),
                          group: groupKey,
                        });
                      }
                    );
                  }
                });
              } else {
                // Regular tool params (non-webhook)
                toolParams = Object.entries(parsedArgs).map(
                  ([name, value]) => ({
                    name,
                    value: formatValue(value),
                  })
                );
              }

              messages.push({
                id: toolCallId,
                role: "tool_call",
                content: "",
                toolId: toolCall.id,
                toolName: toolCall.function.name,
                toolParams,
                isWebhook,
              });
            } else {
              // Regular assistant message
              messages.push({
                id: `msg-${index}`,
                role: "agent",
                content: historyItem.content || "",
              });
            }
          } else if (historyItem.role === "user") {
            messages.push({
              id: `msg-${index}`,
              role: "user",
              content: historyItem.content || "",
            });
          } else if (historyItem.role === "tool" && historyItem.content) {
            // Tool response message - link to the tool call
            const linkedToolCallId =
              historyItem.tool_call_id ||
              toolCallIds[toolCallIds.length - 1] ||
              "";
            // Find the linked tool call to get its name
            const linkedToolCall = messages.find(
              (m) =>
                m.role === "tool_call" &&
                (m.toolId === linkedToolCallId || m.id === linkedToolCallId)
            );
            messages.push({
              id: `tool-response-${index}`,
              role: "tool_response",
              content: historyItem.content,
              linkedToolCallId,
              toolName: linkedToolCall?.toolName || "",
            });
          }
        });

        if (messages.length > 0) {
          setChatMessages(messages);
        }
      }

      // Populate evaluation fields. Note: response-type tests no longer keep a
      // free-text `criteria` on the config — the value lives in the attached
      // correctness evaluator's `variable_values.criteria` (handled separately
      // in the attached-evaluators initialization effect below).
      if (initialConfig.evaluation) {
        if (initialConfig.evaluation.type === "tool_call") {
          const toolCalls = initialConfig.evaluation.tool_calls;

          // Check if tool_calls is empty array
          if (!toolCalls || toolCalls.length === 0) {
            setSelectedTools([]);
          } else {
            // Populate all tool calls
            const tools: SelectedToolConfig[] = toolCalls.map(
              (toolCall, idx) => {
                const expectation: "should-call" | "should-not-call" =
                  toolCall.is_called === false
                    ? "should-not-call"
                    : "should-call";
                const acceptAny = toolCall.accept_any_arguments === true;
                const params =
                  !acceptAny &&
                  toolCall.arguments &&
                  Object.keys(toolCall.arguments).length > 0
                    ? Object.entries(toolCall.arguments).map(
                        ([name, value], paramIdx) => ({
                          id: `param-${idx}-${paramIdx}`,
                          name,
                          value: String(value),
                        })
                      )
                    : [];

                // Check if this is an inbuilt tool by matching tool id or name
                const inbuiltTool = INBUILT_TOOLS.find(
                  (t) => t.id === toolCall.tool || t.name === toolCall.tool
                );

                return {
                  id: inbuiltTool ? inbuiltTool.id : toolCall.tool,
                  name: inbuiltTool ? inbuiltTool.name : toolCall.tool,
                  expectation,
                  acceptAnyParameterValues: acceptAny,
                  isInbuilt: !!inbuiltTool,
                  expectedParameters: params,
                };
              }
            );
            setSelectedTools(tools);
          }
        }
      }
    }
  }, [initialConfig, toolsFetched, availableTools]);

  const [selectedTools, setSelectedTools] = useState<SelectedToolConfig[]>([]);

  // Evaluators attached to this test (next-reply tab only).
  const [attachedEvaluators, setAttachedEvaluators] = useState<
    AttachedEvaluator[]
  >([]);
  // Tracks whether the initial population (from initialEvaluators / legacy
  // criteria / default-correctness auto-attach) has run. Without this we'd
  // re-stomp the user's edits every time props update.
  const [attachedEvaluatorsInitialized, setAttachedEvaluatorsInitialized] =
    useState(false);
  // All available LLM evaluators (defaults + user-owned), used by the picker
  // and for resolving the default-correctness evaluator on init.
  const [availableLLMEvaluators, setAvailableLLMEvaluators] = useState<
    LLMEvaluatorOption[]
  >([]);
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(false);
  const [evaluatorsFetched, setEvaluatorsFetched] = useState(false);
  const [evaluatorPickerOpen, setEvaluatorPickerOpen] = useState(false);
  const [evaluatorPickerSearch, setEvaluatorPickerSearch] = useState("");

  const [localValidationAttempted, setLocalValidationAttempted] =
    useState(false);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      role: "agent" | "user" | "tool_call" | "tool_response";
      content: string;
      toolName?: string;
      toolId?: string;
      toolParams?: Array<{ name: string; value: string; group?: string }>;
      isWebhook?: boolean;
      linkedToolCallId?: string; // For tool_response to link back to tool_call
    }>
  >([{ id: "1", role: "agent", content: "Hello, how can I help you today?" }]);

  const addChatMessage = (role: "agent" | "user") => {
    const defaultContent =
      role === "agent" ? "Enter agent message" : "Enter user message";
    setChatMessages([
      ...chatMessages,
      { id: Date.now().toString(), role, content: defaultContent },
    ]);
  };

  const addToolCallMessage = (
    toolId: string,
    toolName: string,
    params: Array<{ name: string; value: string; group?: string }>,
    isWebhook: boolean = false
  ) => {
    const toolCallId = Date.now().toString();
    const newMessages: typeof chatMessages = [
      ...chatMessages,
      {
        id: toolCallId,
        role: "tool_call",
        content: "",
        toolId,
        toolName,
        toolParams: params,
        isWebhook,
      },
    ];

    // If it's a webhook tool, automatically add a tool response message after it
    if (isWebhook) {
      newMessages.push({
        id: (Date.now() + 1).toString(),
        role: "tool_response",
        content: '{\n  "status": "success",\n  "response": {}\n}',
        linkedToolCallId: toolCallId,
        toolName,
      });
    }

    setChatMessages(newMessages);
    setToolCallDropdownOpen(false);
    setPendingToolCall(null);
  };

  const updateChatMessage = (id: string, content: string) => {
    setChatMessages(
      chatMessages.map((msg) => (msg.id === id ? { ...msg, content } : msg))
    );
  };

  const updateToolCallParam = (
    messageId: string,
    paramName: string,
    value: string,
    group?: string
  ) => {
    setChatMessages(
      chatMessages.map((msg) =>
        msg.id === messageId && msg.toolParams
          ? {
              ...msg,
              toolParams: msg.toolParams.map((p) =>
                p.name === paramName && p.group === group ? { ...p, value } : p
              ),
            }
          : msg
      )
    );
  };

  const removeChatMessage = (id: string) => {
    const messageToRemove = chatMessages.find((msg) => msg.id === id);

    // If removing a tool_call that's a webhook, also remove its linked tool_response
    if (messageToRemove?.role === "tool_call" && messageToRemove?.isWebhook) {
      setChatMessages(
        chatMessages.filter(
          (msg) => msg.id !== id && msg.linkedToolCallId !== id
        )
      );
    } else {
      setChatMessages(chatMessages.filter((msg) => msg.id !== id));
    }
  };

  const [addMessageDropdownOpen, setAddMessageDropdownOpen] = useState(false);
  const [toolCallDropdownOpen, setToolCallDropdownOpen] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<{
    toolId: string;
    toolName: string;
    params: Array<{ name: string; value: string }>;
  } | null>(null);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length]);

  // Fetch available tools when dialog opens
  useEffect(() => {
    const fetchTools = async () => {
      if (!isOpen || !backendAccessToken) return;

      try {
        setAvailableToolsLoading(true);
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
      } finally {
        setAvailableToolsLoading(false);
        setToolsFetched(true);
      }
    };

    fetchTools();
  }, [isOpen, backendAccessToken]);

  // Fetch available LLM evaluators (defaults + user-owned) when dialog opens.
  // Used both for the "Add evaluator" picker and to resolve the default
  // correctness evaluator on initial population.
  useEffect(() => {
    const fetchLLMEvaluators = async () => {
      if (!isOpen || !backendAccessToken) return;

      try {
        setEvaluatorsLoading(true);
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
          }
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
          description?: string;
          slug: string | null;
          owner_user_id: string | null;
          evaluator_type?: string;
          live_version?: { variables?: EvaluatorVariableDef[] | null } | null;
        }> = await response.json();

        const llm: LLMEvaluatorOption[] = raw
          .filter((e) => e.evaluator_type === "llm")
          .map((e) => ({
            uuid: e.uuid,
            name: e.name,
            description: e.description,
            slug: e.slug,
            owner_user_id: e.owner_user_id,
            variables: Array.isArray(e.live_version?.variables)
              ? (e.live_version!.variables as EvaluatorVariableDef[])
              : [],
          }));
        setAvailableLLMEvaluators(llm);
      } catch (err) {
        console.error("Error fetching evaluators:", err);
      } finally {
        setEvaluatorsLoading(false);
        setEvaluatorsFetched(true);
      }
    };

    fetchLLMEvaluators();
  }, [isOpen, backendAccessToken]);

  // Build initial variable_values for a freshly-attached evaluator: prefer
  // explicit values, then variable defaults, then empty string.
  const buildInitialVariableValues = (
    variables: EvaluatorVariableDef[],
    explicit?: Record<string, string> | null
  ): Record<string, string> => {
    const values: Record<string, string> = {};
    for (const v of variables) {
      if (explicit && typeof explicit[v.name] === "string") {
        values[v.name] = explicit[v.name];
      } else if (typeof v.default === "string") {
        values[v.name] = v.default;
      } else {
        values[v.name] = "";
      }
    }
    return values;
  };

  // Initialize attached evaluators once props + evaluator list have settled.
  // Three cases:
  //   1. Edit with hydrated evaluators[] → use as-is.
  //   2. Edit on a legacy test (no evaluators[] but config.evaluation.criteria
  //      is a string) → auto-attach default-correctness with that criteria
  //      pre-filled into its `criteria` variable.
  //   3. New test → auto-attach default-correctness with empty values.
  // Re-runs only until initialized; the user's subsequent edits are preserved.
  useEffect(() => {
    if (attachedEvaluatorsInitialized) return;
    if (!evaluatorsFetched) return;
    // For edit, also wait for the parent's GET to finish so initialConfig /
    // initialEvaluators are settled.
    if (isEditing && isLoading) return;

    if (initialEvaluators && initialEvaluators.length > 0) {
      setAttachedEvaluators(
        initialEvaluators.map((e) => ({
          evaluator_uuid: e.evaluator_uuid,
          name: e.name,
          description: e.description ?? undefined,
          slug: e.slug,
          variables: e.variables ?? [],
          variable_values: buildInitialVariableValues(
            e.variables ?? [],
            e.variable_values ?? undefined
          ),
        }))
      );
      setAttachedEvaluatorsInitialized(true);
      return;
    }

    const correctness = availableLLMEvaluators.find(
      (e) => e.slug === DEFAULT_NEXT_REPLY_EVALUATOR_SLUG
    );

    // Legacy edit: pre-fill criteria from the old free-text field.
    if (
      isEditing &&
      initialConfig?.evaluation?.type === "response" &&
      typeof initialConfig.evaluation.criteria === "string" &&
      initialConfig.evaluation.criteria.length > 0 &&
      correctness
    ) {
      setAttachedEvaluators([
        {
          evaluator_uuid: correctness.uuid,
          name: correctness.name,
          description: correctness.description,
          slug: correctness.slug,
          variables: correctness.variables,
          variable_values: buildInitialVariableValues(correctness.variables, {
            criteria: initialConfig.evaluation.criteria,
          }),
        },
      ]);
      setAttachedEvaluatorsInitialized(true);
      return;
    }

    // New test (or edit with no usable initial state): auto-attach default
    // correctness only on the next-reply tab. Tool-invocation tests are
    // unchanged and don't carry evaluators today.
    if (!isEditing && activeTab === "next-reply" && correctness) {
      setAttachedEvaluators([
        {
          evaluator_uuid: correctness.uuid,
          name: correctness.name,
          description: correctness.description,
          slug: correctness.slug,
          variables: correctness.variables,
          variable_values: buildInitialVariableValues(correctness.variables),
        },
      ]);
      setAttachedEvaluatorsInitialized(true);
      return;
    }

    // Nothing to attach; mark initialized so manual adds can proceed.
    setAttachedEvaluatorsInitialized(true);
  }, [
    attachedEvaluatorsInitialized,
    evaluatorsFetched,
    availableLLMEvaluators,
    initialEvaluators,
    initialConfig,
    isEditing,
    isLoading,
    activeTab,
  ]);

  const updateEvaluatorVariableValue = (
    evaluatorUuid: string,
    variableName: string,
    value: string
  ) => {
    setAttachedEvaluators((prev) =>
      prev.map((e) =>
        e.evaluator_uuid === evaluatorUuid
          ? {
              ...e,
              variable_values: { ...e.variable_values, [variableName]: value },
            }
          : e
      )
    );
  };

  const removeAttachedEvaluator = (evaluatorUuid: string) => {
    setAttachedEvaluators((prev) =>
      prev.filter((e) => e.evaluator_uuid !== evaluatorUuid)
    );
  };

  const closeEvaluatorPicker = () => {
    setEvaluatorPickerOpen(false);
    setEvaluatorPickerSearch("");
  };

  const attachEvaluatorFromOption = (option: LLMEvaluatorOption) => {
    setAttachedEvaluators((prev) => {
      if (prev.some((e) => e.evaluator_uuid === option.uuid)) return prev;
      return [
        ...prev,
        {
          evaluator_uuid: option.uuid,
          name: option.name,
          description: option.description,
          slug: option.slug,
          variables: option.variables,
          variable_values: buildInitialVariableValues(option.variables),
        },
      ];
    });
    closeEvaluatorPicker();
  };

  const addToolFromSelection = (tool: AvailableTool) => {
    // Check if tool is a webhook type - default to accept any arguments for webhooks
    const isWebhook = tool.config?.type === "webhook";

    // Extract parameters from tool config - handle both array (new) and object (legacy) formats
    let paramList: Array<{ id: string; name: string; value: string }> = [];
    const params = tool.config?.parameters;

    if (Array.isArray(params)) {
      // New array format
      paramList = params.map((param: any) => ({
        id: Date.now().toString() + (param.id || param.name),
        name: param.id || param.name || "",
        value: "",
      }));
    } else {
      // Legacy object format
      const propsObj =
        tool.config?.parameters?.properties ||
        tool.config?.function?.parameters?.properties ||
        tool.config?.properties ||
        tool.config?.parameters ||
        {};
      paramList = Object.keys(propsObj).map((name) => ({
        id: Date.now().toString() + name,
        name,
        value: "",
      }));
    }

    const newTool: SelectedToolConfig = {
      id: tool.uuid,
      name: tool.name,
      expectation: "should-call",
      acceptAnyParameterValues: isWebhook, // Default to true for webhook tools
      isInbuilt: false,
      expectedParameters: paramList,
    };

    setSelectedTools([...selectedTools, newTool]);
    setToolDropdownOpen(false);
  };

  const selectInbuiltTool = (toolId: string, toolName: string) => {
    const newTool: SelectedToolConfig = {
      id: toolId,
      name: toolName,
      expectation: "should-call",
      acceptAnyParameterValues: false,
      isInbuilt: true,
      expectedParameters: [],
    };
    setSelectedTools([...selectedTools, newTool]);
    setToolDropdownOpen(false);
  };

  const removeTool = (toolId: string) => {
    setSelectedTools(selectedTools.filter((t) => t.id !== toolId));
  };

  // Helper function to get parameters from tool config for selected tool
  const getToolParamsForSelectedTool = (toolId: string, toolName: string) => {
    const tool = availableTools.find(
      (t) => t.uuid === toolId || t.name === toolName
    );
    if (!tool) return [];

    const params = tool.config?.parameters;

    // Handle array format (new)
    if (Array.isArray(params)) {
      return params.map((param: any) => ({
        id: Date.now().toString() + (param.id || param.name),
        name: param.id || param.name || "",
        value: "",
      }));
    }

    // Handle object format (legacy)
    const propsObj =
      tool.config?.parameters?.properties ||
      tool.config?.function?.parameters?.properties ||
      tool.config?.properties ||
      tool.config?.parameters ||
      {};
    return Object.keys(propsObj).map((name) => ({
      id: Date.now().toString() + name,
      name,
      value: "",
    }));
  };

  // Update a specific tool's configuration
  const updateToolConfig = (
    toolId: string,
    updates: Partial<SelectedToolConfig>
  ) => {
    setSelectedTools(
      selectedTools.map((tool) => {
        if (tool.id !== toolId) return tool;

        const updatedTool = { ...tool, ...updates };

        // If toggling acceptAnyParameterValues off, populate parameters
        if (
          updates.acceptAnyParameterValues === false &&
          tool.acceptAnyParameterValues === true
        ) {
          updatedTool.expectedParameters = getToolParamsForSelectedTool(
            tool.id,
            tool.name
          );
        }

        // If changing to should-call and params are empty and acceptAny is false
        if (
          updates.expectation === "should-call" &&
          tool.expectation !== "should-call" &&
          !updatedTool.acceptAnyParameterValues &&
          updatedTool.expectedParameters.length === 0
        ) {
          updatedTool.expectedParameters = getToolParamsForSelectedTool(
            tool.id,
            tool.name
          );
        }

        return updatedTool;
      })
    );
  };

  // Update a parameter value for a specific tool
  const updateToolParameterValue = (
    toolId: string,
    paramId: string,
    value: string
  ) => {
    setSelectedTools(
      selectedTools.map((tool) => {
        if (tool.id !== toolId) return tool;
        return {
          ...tool,
          expectedParameters: tool.expectedParameters.map((param) =>
            param.id === paramId ? { ...param, value } : param
          ),
        };
      })
    );
  };

  // Check if a tool has parameters in its original config
  const toolHasParams = (toolId: string, toolName: string) => {
    const tool = availableTools.find(
      (t) => t.uuid === toolId || t.name === toolName
    );
    if (!tool) return false;

    const params = tool.config?.parameters;

    // Handle array format (new)
    if (Array.isArray(params)) {
      return params.length > 0;
    }

    // Handle object format (legacy)
    const propsObj =
      tool.config?.parameters?.properties ||
      tool.config?.function?.parameters?.properties ||
      tool.config?.properties ||
      tool.config?.parameters ||
      {};
    return Object.keys(propsObj).length > 0;
  };

  // Generate a UUID for tool calls
  const generateUUID = () => {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // Build the config object for API submission
  const buildConfig = (): TestConfig => {
    const history: TestConfig["history"] = [];

    // Convert chat messages to the API format
    for (const message of chatMessages) {
      if (message.role === "agent") {
        history.push({
          role: "assistant",
          content: message.content,
        });
      } else if (message.role === "user") {
        history.push({
          role: "user",
          content: message.content,
        });
      } else if (message.role === "tool_call") {
        // Generate a unique ID for this tool call
        const toolCallId = generateUUID();

        // Build the arguments object from tool params
        const argsObj: Record<string, any> = {};
        if (message.toolParams) {
          for (const param of message.toolParams) {
            // For webhook tools, group params by their group (query, body)
            // Note: Headers are not shown in conversation history UI
            if (message.isWebhook && param.group) {
              if (param.group === "body") {
                if (!argsObj.body) argsObj.body = {};
                argsObj.body[param.name] = param.value;
              } else if (param.group === "query") {
                if (!argsObj.query) argsObj.query = {};
                argsObj.query[param.name] = param.value;
              }
            } else {
              argsObj[param.name] = param.value;
            }
          }
        }

        // Add the assistant message with tool_calls
        history.push({
          role: "assistant",
          tool_calls: [
            {
              id: toolCallId,
              function: {
                name: message.toolName || "",
                arguments: JSON.stringify(argsObj),
              },
              type: "function",
            },
          ],
        });

        // For webhook tools, find the linked tool_response message and add it to history
        // For non-webhook tools, don't add any tool response
        if (message.isWebhook) {
          const linkedResponse = chatMessages.find(
            (m) =>
              m.role === "tool_response" && m.linkedToolCallId === message.id
          );
          if (linkedResponse && linkedResponse.content) {
            history.push({
              role: "tool",
              content: linkedResponse.content,
              tool_call_id: toolCallId,
            });
          }
        }
      }
      // Skip tool_response messages as they're handled with their linked tool_call
    }

    // Build the evaluation object based on the active tab
    let evaluation: TestConfig["evaluation"];

    if (activeTab === "tool-invocation") {
      if (selectedTools.length > 0) {
        // Build tool_calls array from all selected tools. The "should not
        // have been called" expectation is intentionally suppressed for now
        // — every selected tool is treated as `should-call` regardless of
        // any pre-existing `expectation` value loaded from the backend, so
        // the API always receives a positive should-call payload.
        const toolCalls = selectedTools.map((tool) => {
          const toolIdentifier = tool.isInbuilt ? tool.id : tool.name;

          const expectedArgs: Record<string, any> = {};
          if (!tool.acceptAnyParameterValues) {
            for (const param of tool.expectedParameters) {
              try {
                expectedArgs[param.name] = JSON.parse(param.value);
              } catch {
                expectedArgs[param.name] = param.value;
              }
            }
          }

          return {
            tool: toolIdentifier,
            arguments: tool.acceptAnyParameterValues ? {} : expectedArgs,
            accept_any_arguments: tool.acceptAnyParameterValues,
          };
        });

        evaluation = {
          type: "tool_call",
          tool_calls: toolCalls,
        };
      } else {
        // No tool selected - test that no tool is called
        evaluation = {
          type: "tool_call",
          tool_calls: [],
        };
      }
    } else {
      // next-reply test. The legacy free-text `criteria` field is no longer
      // sent — the user-supplied criteria now lives on the attached
      // correctness evaluator's `variable_values.criteria` (sent separately
      // on the POST/PUT body's `evaluators` array).
      evaluation = {
        type: "response",
      };
    }

    return { history, evaluation };
  };

  // Build the EvaluatorRef[] payload sent alongside `config` on POST/PUT
  // /tests. Only relevant for next-reply tests. We omit `variable_values`
  // entirely when the evaluator has no variables to keep the payload lean.
  const buildEvaluatorsPayload = (): EvaluatorRefPayload[] => {
    if (activeTab !== "next-reply") return [];
    return attachedEvaluators.map((e) => {
      const ref: EvaluatorRefPayload = { evaluator_uuid: e.evaluator_uuid };
      if (e.variables.length > 0) {
        ref.variable_values = { ...e.variable_values };
      }
      return ref;
    });
  };

  // Returns true if any attached evaluator has at least one variable whose
  // value is empty (after trim). Used to gate the Save button.
  const hasUnfilledEvaluatorVariables = () => {
    if (activeTab !== "next-reply") return false;
    for (const e of attachedEvaluators) {
      for (const v of e.variables) {
        const value = e.variable_values[v.name];
        if (typeof value !== "string" || value.trim().length === 0) {
          return true;
        }
      }
    }
    return false;
  };

  // Helper to check if tool call messages have empty params
  const hasEmptyToolCallParams = () => {
    const toolCallMessages = chatMessages.filter((m) => m.role === "tool_call");
    for (const msg of toolCallMessages) {
      if (msg.toolParams && msg.toolParams.length > 0) {
        const hasEmpty = msg.toolParams.some((p) => !p.value.trim());
        if (hasEmpty) return true;
      }
    }
    return false;
  };

  // Handle form submission
  const handleSubmit = () => {
    setLocalValidationAttempted(true);

    // Auto-hide validation errors after 3 seconds
    setTimeout(() => {
      setLocalValidationAttempted(false);
    }, 3000);

    // Validate tool call params in conversation history (for both test types)
    if (hasEmptyToolCallParams()) {
      return; // Don't submit if any tool call has empty params
    }

    // Validate required fields based on test type
    if (activeTab === "next-reply") {
      if (!testName.trim()) {
        return; // Don't submit if validation fails
      }
      // At least one evaluator and every variable on every attached evaluator
      // must have a non-empty value.
      if (attachedEvaluators.length === 0) {
        return;
      }
      if (hasUnfilledEvaluatorVariables()) {
        return;
      }
      // Validate that all tool_response messages have valid JSON
      const toolResponses = chatMessages.filter(
        (m) => m.role === "tool_response"
      );
      for (const response of toolResponses) {
        try {
          JSON.parse(response.content);
        } catch {
          return; // Don't submit if any tool response has invalid JSON
        }
      }
    } else {
      // tool-invocation - name and at least one tool are required
      if (!testName.trim() || selectedTools.length === 0) {
        return;
      }
      // For each tool that should be called with specific params, all params must have values
      for (const tool of selectedTools) {
        if (
          tool.expectation === "should-call" &&
          tool.expectedParameters.length > 0 &&
          !tool.acceptAnyParameterValues
        ) {
          const hasEmptyParams = tool.expectedParameters.some(
            (param) => !param.value.trim()
          );
          if (hasEmptyParams) {
            return;
          }
        }
      }
      // Validate that all tool_response messages have valid JSON
      const toolResponses = chatMessages.filter(
        (m) => m.role === "tool_response"
      );
      for (const response of toolResponses) {
        try {
          JSON.parse(response.content);
        } catch {
          return; // Don't submit if any tool response has invalid JSON
        }
      }
    }

    const config = buildConfig();
    const evaluators = buildEvaluatorsPayload();
    onSubmit(config, evaluators);
  };

  const handleBackdropClick = () => {
    setShowCloseConfirmation(true);
  };

  const handleConfirmClose = () => {
    setShowCloseConfirmation(false);
    onClose();
  };

  const handleCancelClose = () => {
    setShowCloseConfirmation(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleBackdropClick}
      />

      {/* Close Confirmation Dialog */}
      {showCloseConfirmation && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={handleCancelClose}
          />
          <div className="relative bg-background rounded-xl shadow-2xl border border-border p-6 max-w-sm w-full mx-4">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              Discard changes?
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              You have unsaved changes. Are you sure you want to close this
              dialog? Your changes will be lost.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={handleCancelClose}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-background text-foreground hover:bg-muted transition-colors cursor-pointer border border-border"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmClose}
                className="h-10 px-4 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog */}
      <div className="relative w-full max-w-7xl h-[95vh] md:h-[85vh] mx-2 md:mx-4 bg-background rounded-xl md:rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden border border-border">
        {/* Left Column - Form */}
        <div className="w-full md:w-2/5 flex flex-col border-b md:border-b-0 md:border-r border-border">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("next-reply")}
              className={`flex-1 py-3 md:py-4 text-sm md:text-base font-medium transition-colors cursor-pointer ${
                activeTab === "next-reply"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Next reply test
            </button>
            <button
              onClick={() => setActiveTab("tool-invocation")}
              className={`flex-1 py-3 md:py-4 text-sm md:text-base font-medium transition-colors cursor-pointer ${
                activeTab === "tool-invocation"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tool invocation test
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overflow-x-visible p-4 md:p-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <svg
                  className="w-6 h-6 animate-spin text-foreground"
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
              </div>
            ) : activeTab === "next-reply" ? (
              <div className="space-y-6">
                {/* Test Name */}
                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Test name
                  </label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="Your test name"
                    className={`w-full h-11 px-4 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                      localValidationAttempted &&
                      activeTab === "next-reply" &&
                      !testName.trim()
                        ? "border-red-500"
                        : "border-border"
                    }`}
                  />
                </div>

                {/* Evaluators (next-reply tab only) */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-base font-medium text-foreground">
                      Evaluators
                    </label>
                    {(() => {
                      const remainingOptions = availableLLMEvaluators.filter(
                        (o) =>
                          !attachedEvaluators.some(
                            (a) => a.evaluator_uuid === o.uuid
                          )
                      );
                      const noOptionsLeft = remainingOptions.length === 0;
                      return (
                        <button
                          onClick={() => {
                            if (evaluatorPickerOpen) {
                              closeEvaluatorPicker();
                            } else {
                              setEvaluatorPickerOpen(true);
                            }
                          }}
                          disabled={
                            evaluatorsLoading || isLoading || noOptionsLeft
                          }
                          className={`px-3 py-1.5 text-sm font-medium bg-background text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer border border-border disabled:opacity-50 disabled:cursor-not-allowed ${
                            localValidationAttempted &&
                            activeTab === "next-reply" &&
                            attachedEvaluators.length === 0
                              ? "border-red-500 text-red-400"
                              : ""
                          }`}
                        >
                          Add evaluator
                        </button>
                      );
                    })()}
                  </div>

                  {/* Evaluator picker dropdown */}
                  {evaluatorPickerOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[99]"
                        onClick={closeEvaluatorPicker}
                      />
                      <div className="absolute right-0 top-9 mt-1 w-80 max-h-80 flex flex-col bg-background border border-border rounded-xl shadow-2xl z-[100] overflow-hidden">
                        {/* Sticky search bar */}
                        <div className="p-2 border-b border-border bg-background">
                          <input
                            type="text"
                            value={evaluatorPickerSearch}
                            onChange={(e) =>
                              setEvaluatorPickerSearch(e.target.value)
                            }
                            placeholder="Search evaluators..."
                            autoFocus
                            className="w-full h-9 px-3 rounded-md text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                          />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                          {(() => {
                            const remaining = availableLLMEvaluators.filter(
                              (o) =>
                                !attachedEvaluators.some(
                                  (a) => a.evaluator_uuid === o.uuid
                                )
                            );
                            if (remaining.length === 0) {
                              return (
                                <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                                  No more LLM evaluators to add.
                                </div>
                              );
                            }
                            // Case-insensitive substring match against both
                            // name and description so users can search by
                            // either label or rubric snippet.
                            const query = evaluatorPickerSearch
                              .trim()
                              .toLowerCase();
                            const matches = query
                              ? remaining.filter((o) => {
                                  const name = o.name.toLowerCase();
                                  const desc = (
                                    o.description ?? ""
                                  ).toLowerCase();
                                  return (
                                    name.includes(query) ||
                                    desc.includes(query)
                                  );
                                })
                              : remaining;
                            if (matches.length === 0) {
                              return (
                                <div className="px-4 py-6 text-sm text-muted-foreground text-center">
                                  No evaluators match &ldquo;
                                  {evaluatorPickerSearch}&rdquo;.
                                </div>
                              );
                            }
                            const defaults = matches.filter(
                              (o) => o.owner_user_id === null
                            );
                            const mine = matches.filter(
                              (o) => o.owner_user_id !== null
                            );
                            const renderRow = (o: LLMEvaluatorOption) => (
                              <button
                                key={o.uuid}
                                onClick={() => attachEvaluatorFromOption(o)}
                                className="w-full text-left px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer"
                              >
                                <div className="text-sm font-medium text-foreground">
                                  {o.name}
                                </div>
                                {o.description && (
                                  <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                                    {o.description}
                                  </div>
                                )}
                              </button>
                            );
                            return (
                              <>
                                {defaults.length > 0 && (
                                  <div>
                                    <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                      Default
                                    </div>
                                    {defaults.map(renderRow)}
                                  </div>
                                )}
                                {mine.length > 0 && (
                                  <div>
                                    <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                                      My evaluators
                                    </div>
                                    {mine.map(renderRow)}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Empty / loading state */}
                  {evaluatorsLoading && attachedEvaluators.length === 0 && (
                    <div className="text-sm text-muted-foreground py-4">
                      Loading evaluators...
                    </div>
                  )}
                  {!evaluatorsLoading &&
                    attachedEvaluators.length === 0 && (
                      <div
                        className={`text-sm py-4 ${
                          localValidationAttempted &&
                          activeTab === "next-reply"
                            ? "text-red-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        Add at least one evaluator to grade the agent&apos;s
                        next reply.
                      </div>
                    )}

                  {/* Attached evaluator cards */}
                  <div className="space-y-4">
                    {attachedEvaluators.map((ev) => (
                      <div
                        key={ev.evaluator_uuid}
                        className="border border-border rounded-lg p-4 bg-background"
                      >
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-foreground">
                              {ev.name}
                            </div>
                            {ev.description && (
                              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {ev.description}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() =>
                              removeAttachedEvaluator(ev.evaluator_uuid)
                            }
                            className="text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                            aria-label={`Remove ${ev.name}`}
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

                        {ev.variables.length > 0 && (
                          <div className="space-y-3">
                            {ev.variables.map((v) => {
                              // Uniform rendering for every evaluator variable:
                              // a small `{{name}}` monospace hint + textarea
                              // whose placeholder is the variable's
                              // `description` (falling back to `default`, then
                              // a generic prompt). No special-case label —
                              // the description carries the user-facing copy.
                              const placeholder =
                                v.description && v.description.length > 0
                                  ? v.description
                                  : v.default && v.default.length > 0
                                  ? v.default
                                  : `Enter value for {{${v.name}}}`;
                              const value = ev.variable_values[v.name] ?? "";
                              const isMissing =
                                localValidationAttempted &&
                                activeTab === "next-reply" &&
                                value.trim().length === 0;
                              return (
                                <div key={v.name}>
                                  <div className="text-xs text-muted-foreground mb-1.5">
                                    <code className="font-mono">{`{{${v.name}}}`}</code>
                                  </div>
                                  <textarea
                                    value={value}
                                    onChange={(e) =>
                                      updateEvaluatorVariableValue(
                                        ev.evaluator_uuid,
                                        v.name,
                                        e.target.value
                                      )
                                    }
                                    placeholder={placeholder}
                                    rows={4}
                                    className={`w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent resize-none ${
                                      isMissing
                                        ? "border-red-500"
                                        : "border-border"
                                    }`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Test Name */}
                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Test name
                  </label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="Your test name"
                    className={`w-full h-11 px-4 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                      localValidationAttempted &&
                      activeTab === "tool-invocation" &&
                      !testName.trim()
                        ? "border-red-500"
                        : "border-border"
                    }`}
                  />
                </div>

                {/* Tools to test */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-base font-medium text-foreground">
                      Tools to test
                    </label>
                    <button
                      onClick={() => setToolDropdownOpen(!toolDropdownOpen)}
                      className={`px-3 py-1.5 text-sm font-medium bg-background text-foreground rounded-lg hover:bg-muted transition-colors cursor-pointer border ${
                        localValidationAttempted &&
                        activeTab === "tool-invocation" &&
                        selectedTools.length === 0
                          ? "border-red-500 text-red-400"
                          : "border-border"
                      }`}
                    >
                      Add tool
                    </button>
                  </div>

                  {/* Tool Dropdown */}
                  {toolDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[99]"
                        onClick={() => {
                          setToolDropdownOpen(false);
                        }}
                      />
                      <div className="absolute right-0 top-8 mt-2 w-72 bg-background border border-border rounded-xl shadow-2xl z-[100] overflow-hidden">
                        <ToolPicker
                          availableTools={availableTools}
                          isLoading={availableToolsLoading}
                          onSelectInbuiltTool={(toolId, toolName) => {
                            selectInbuiltTool(toolId, toolName);
                          }}
                          onSelectCustomTool={(tool) => {
                            addToolFromSelection(tool);
                          }}
                          selectedToolIds={selectedTools.map((t) => t.id)}
                        />
                      </div>
                    </>
                  )}

                  {selectedTools.length === 0 ? (
                    <div className="bg-muted rounded-lg p-8 text-center ">
                      <p className="text-muted-foreground text-sm">
                        If you leave this empty, the test will check that no
                        tool has been called.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {selectedTools.map((tool) => (
                        <div
                          key={tool.id}
                          className="bg-muted rounded-lg p-4 border border-border"
                        >
                          {/* Tool header with name and delete button */}
                          <div className="flex items-center gap-2 mb-3">
                            <div className="flex-1 h-10 px-4 rounded-lg text-base bg-background text-foreground border border-border flex items-center">
                              {tool.name}
                            </div>
                            <button
                              onClick={() => removeTool(tool.id)}
                              className="w-10 h-10 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
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
                                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                />
                              </svg>
                            </button>
                          </div>

                          {/* Expectation indicator. The "should not have been
                              called" option is intentionally hidden for now
                              and the dialog assumes "should have been called"
                              on every save (see the tool_calls payload
                              builder below). Rendered as a full-width
                              selected-state pill for visual consistency with
                              the rest of the dialog rather than a real
                              segmented control. */}
                          <div
                            className="w-full py-2.5 rounded-lg border border-border bg-foreground text-background text-sm font-medium text-center"
                            aria-label="Expected behaviour"
                          >
                            Should have been called
                          </div>

                          {/* Accept any parameter values checkbox - show when "should call" is selected and tool has parameters */}
                          {tool.expectation === "should-call" &&
                            toolHasParams(tool.id, tool.name) && (
                              <div className="mt-4 flex items-center gap-3">
                                <button
                                  onClick={() =>
                                    updateToolConfig(tool.id, {
                                      acceptAnyParameterValues:
                                        !tool.acceptAnyParameterValues,
                                    })
                                  }
                                  className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                                    tool.acceptAnyParameterValues
                                      ? "bg-foreground border-foreground"
                                      : "bg-background border-muted-foreground hover:border-foreground"
                                  }`}
                                >
                                  {tool.acceptAnyParameterValues && (
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
                                  Accept any values for the parameters
                                </span>
                              </div>
                            )}

                          {/* Expected parameters section - only show when "should call" is selected and toggle is off */}
                          {tool.expectation === "should-call" &&
                            tool.expectedParameters.length > 0 &&
                            !tool.acceptAnyParameterValues && (
                              <div className="mt-4">
                                <div className="mb-3">
                                  <h4 className="text-sm font-medium text-foreground">
                                    Expected extracted parameters
                                  </h4>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Configure how each parameter should be
                                    evaluated when the agent calls this tool
                                  </p>
                                </div>

                                <div className="space-y-3">
                                  {tool.expectedParameters.map((param) => (
                                    <div key={param.id}>
                                      <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                        {param.name}
                                      </label>
                                      <input
                                        type="text"
                                        value={param.value}
                                        onChange={(e) =>
                                          updateToolParameterValue(
                                            tool.id,
                                            param.id,
                                            e.target.value
                                          )
                                        }
                                        placeholder="Expected value"
                                        className={`w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                          localValidationAttempted &&
                                          activeTab === "tool-invocation" &&
                                          !param.value.trim()
                                            ? "border-red-500"
                                            : "border-border"
                                        }`}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 md:px-6 py-3 md:py-4 bg-background">
            {createError && (
              <p className="text-sm text-red-500 mb-3">{createError}</p>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={onClose}
                disabled={isCreating || isLoading}
                className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-sm md:text-base font-medium bg-background text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-border"
              >
                Back
              </button>
              {(() => {
                const lastMessage = chatMessages[chatMessages.length - 1];
                const isLastMessageAgent =
                  lastMessage?.role === "agent" || chatMessages.length === 0;
                const isButtonDisabled =
                  isCreating || isLoading || isLastMessageAgent;

                return (
                  <div className="relative group">
                    <button
                      onClick={handleSubmit}
                      disabled={isButtonDisabled}
                      className="h-9 md:h-10 px-4 md:px-5 rounded-lg text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCreating ? (
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
                          {isEditing ? "Saving..." : "Creating..."}
                        </>
                      ) : isEditing ? (
                        "Save"
                      ) : (
                        "Create"
                      )}
                    </button>
                    {/* Tooltip for disabled state */}
                    {isLastMessageAgent && !isCreating && !isLoading && (
                      <div className="absolute bottom-full mb-2 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        <div className="px-3 py-2 text-sm bg-background text-foreground border border-border rounded-lg shadow-lg w-72">
                          A test should end with a user message, not an agent
                          message or agent tool call
                        </div>
                        {/* Arrow */}
                        <div className="absolute top-full right-4 -mt-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-border"></div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Right Column - Chat Messages */}
        <div className="w-full md:w-3/5 flex flex-col bg-muted/30 overflow-visible">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto overflow-x-visible p-4 md:p-6">
            {chatMessages.length === 0 ? (
              /* Empty State Placeholder */
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                {/* Globe with chat icon */}
                <div className="mb-6">
                  <svg
                    className="w-24 h-24 text-muted-foreground"
                    viewBox="0 0 100 100"
                    fill="none"
                  >
                    {/* Globe */}
                    <circle
                      cx="45"
                      cy="50"
                      r="30"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                    <ellipse
                      cx="45"
                      cy="50"
                      rx="12"
                      ry="30"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      d="M15 50 Q45 35 75 50"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    <path
                      d="M15 50 Q45 65 75 50"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                    />
                    {/* Chat bubbles */}
                    <circle
                      cx="70"
                      cy="30"
                      r="12"
                      className="fill-muted"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <circle cx="66" cy="30" r="1.5" fill="currentColor" />
                    <circle cx="70" cy="30" r="1.5" fill="currentColor" />
                    <circle cx="74" cy="30" r="1.5" fill="currentColor" />
                    {/* Shadow */}
                    <ellipse
                      cx="45"
                      cy="88"
                      rx="18"
                      ry="4"
                      fill="currentColor"
                      opacity="0.2"
                    />
                  </svg>
                </div>

                <h3 className="text-xl font-semibold text-foreground mb-3">
                  No conversation context
                </h3>

                <p className="text-muted-foreground text-sm mb-6 max-w-md leading-relaxed">
                  The agent&apos;s response to the last user message will be
                  evaluated against the success criteria using examples
                  provided. Previous messages will be passed as context.
                </p>

                <p className="text-muted-foreground text-sm mb-4">
                  Create conversation context starting with
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => addChatMessage("agent")}
                    className="px-4 py-2.5 rounded-xl border border-border bg-transparent text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-5 h-5 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                      />
                    </svg>
                    <span className="text-sm font-medium">Agent message</span>
                  </button>
                  <button
                    onClick={() => addChatMessage("user")}
                    className="px-4 py-2.5 rounded-xl border border-border bg-transparent text-foreground hover:bg-muted transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-5 h-5 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                      />
                    </svg>
                    <span className="text-sm font-medium">User message</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {chatMessages.map((message, index) => (
                  <div
                    key={message.id}
                    className={`space-y-2 ${
                      message.role === "user" ? "flex flex-col items-end" : ""
                    }`}
                  >
                    {/* Message Header - show for agent messages and tool calls */}
                    {(message.role === "agent" ||
                      message.role === "tool_call") && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {message.role === "tool_call"
                            ? "Agent Tool Call"
                            : "Agent"}
                        </span>
                      </div>
                    )}

                    {/* Message Bubble - for agent and user messages */}
                    {(message.role === "agent" || message.role === "user") && (
                      <div className="w-1/2">
                        <textarea
                          value={message.content}
                          onChange={(e) => {
                            updateChatMessage(message.id, e.target.value);
                            // Auto-resize textarea
                            e.target.style.height = "auto";
                            e.target.style.height = `${e.target.scrollHeight}px`;
                          }}
                          onInput={(e) => {
                            // Auto-resize on initial render and paste
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = "auto";
                            target.style.height = `${target.scrollHeight}px`;
                          }}
                          ref={(el) => {
                            // Auto-resize on mount
                            if (el) {
                              el.style.height = "auto";
                              el.style.height = `${el.scrollHeight}px`;
                            }
                          }}
                          rows={1}
                          className={`w-full px-4 py-2 rounded-xl text-sm text-foreground border focus:outline-none focus:ring-1 focus:ring-accent resize-none overflow-hidden ${
                            message.role === "agent"
                              ? "bg-background border-border"
                              : "bg-accent border-border"
                          }`}
                        />
                      </div>
                    )}

                    {/* Tool Call Display */}
                    {message.role === "tool_call" && (
                      <div className="w-1/2">
                        <div className="bg-muted border border-border rounded-2xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              className="w-4 h-4 text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                              />
                            </svg>
                            <span className="text-sm font-medium text-foreground">
                              {message.toolName}
                            </span>
                            {message.isWebhook && (
                              <span className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
                                Webhook
                              </span>
                            )}
                          </div>
                          {message.toolParams &&
                            message.toolParams.length > 0 && (
                              <div className="space-y-3 mt-3">
                                {/* Group parameters by type for webhook tools */}
                                {message.isWebhook ? (
                                  <>
                                    {/* Query Parameters */}
                                    {message.toolParams.filter(
                                      (p) => p.group === "query"
                                    ).length > 0 && (
                                      <div className="bg-background border border-border rounded-xl p-3">
                                        <h5 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                                          Query
                                        </h5>
                                        <div className="space-y-3">
                                          {message.toolParams
                                            .filter((p) => p.group === "query")
                                            .map((param, idx) => {
                                              const isEmpty =
                                                !param.value.trim();
                                              const showError =
                                                localValidationAttempted &&
                                                isEmpty;
                                              return (
                                                <div key={idx}>
                                                  <label className="block text-sm font-medium text-foreground mb-1.5">
                                                    {param.name}
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={param.value}
                                                    onChange={(e) =>
                                                      updateToolCallParam(
                                                        message.id,
                                                        param.name,
                                                        e.target.value,
                                                        param.group
                                                      )
                                                    }
                                                    placeholder={`Enter ${param.name}`}
                                                    className={`w-full h-10 px-3 rounded-lg text-sm bg-muted text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                                      showError
                                                        ? "border-red-500"
                                                        : "border-border"
                                                    }`}
                                                  />
                                                  {showError && (
                                                    <p className="text-xs text-red-500 mt-1">
                                                      This field cannot be empty
                                                    </p>
                                                  )}
                                                </div>
                                              );
                                            })}
                                        </div>
                                      </div>
                                    )}
                                    {/* Body Parameters */}
                                    {message.toolParams.filter(
                                      (p) => p.group === "body"
                                    ).length > 0 && (
                                      <div className="bg-background border border-border rounded-xl p-3">
                                        <h5 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                                          Body
                                        </h5>
                                        <div className="space-y-3">
                                          {message.toolParams
                                            .filter((p) => p.group === "body")
                                            .map((param, idx) => {
                                              const isEmpty =
                                                !param.value.trim();
                                              const showError =
                                                localValidationAttempted &&
                                                isEmpty;
                                              return (
                                                <div key={idx}>
                                                  <label className="block text-sm font-medium text-foreground mb-1.5">
                                                    {param.name}
                                                  </label>
                                                  <input
                                                    type="text"
                                                    value={param.value}
                                                    onChange={(e) =>
                                                      updateToolCallParam(
                                                        message.id,
                                                        param.name,
                                                        e.target.value,
                                                        param.group
                                                      )
                                                    }
                                                    placeholder={`Enter ${param.name}`}
                                                    className={`w-full h-10 px-3 rounded-lg text-sm bg-muted text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                                      showError
                                                        ? "border-red-500"
                                                        : "border-border"
                                                    }`}
                                                  />
                                                  {showError && (
                                                    <p className="text-xs text-red-500 mt-1">
                                                      This field cannot be empty
                                                    </p>
                                                  )}
                                                </div>
                                              );
                                            })}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  /* Regular tool parameters */
                                  <div className="space-y-3">
                                    {message.toolParams.map((param, idx) => {
                                      const isEmpty = !param.value.trim();
                                      const showError =
                                        localValidationAttempted && isEmpty;
                                      return (
                                        <div key={idx}>
                                          <label className="block text-sm font-medium text-foreground mb-1.5">
                                            {param.name}
                                          </label>
                                          <input
                                            type="text"
                                            value={param.value}
                                            onChange={(e) =>
                                              updateToolCallParam(
                                                message.id,
                                                param.name,
                                                e.target.value,
                                                param.group
                                              )
                                            }
                                            placeholder={`Enter ${param.name}`}
                                            className={`w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${
                                              showError
                                                ? "border-red-500"
                                                : "border-border"
                                            }`}
                                          />
                                          {showError && (
                                            <p className="text-xs text-red-500 mt-1">
                                              This field cannot be empty
                                            </p>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                        </div>
                      </div>
                    )}

                    {/* Tool Response Display (for webhook tools) */}
                    {message.role === "tool_response" && (
                      <div className="w-1/2">
                        <div className="bg-muted border border-border rounded-2xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              className="w-4 h-4 text-muted-foreground"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span className="text-sm font-medium text-foreground">
                              Tool Response
                            </span>
                            <span className="text-xs text-muted-foreground">
                              ({message.toolName})
                            </span>
                          </div>
                          <div className="mt-2">
                            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                              JSON Response{" "}
                              <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              value={message.content}
                              onChange={(e) =>
                                updateChatMessage(message.id, e.target.value)
                              }
                              placeholder='{"status": "success", "response": {}}'
                              rows={5}
                              className={`w-full px-3 py-2 rounded-lg text-sm font-mono bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent ${(() => {
                                try {
                                  JSON.parse(message.content);
                                  return "border-border";
                                } catch {
                                  return message.content.trim()
                                    ? "border-red-500"
                                    : "border-border";
                                }
                              })()}`}
                            />
                            {(() => {
                              try {
                                JSON.parse(message.content);
                                return null;
                              } catch {
                                return message.content.trim() ? (
                                  <p className="text-xs text-red-500 mt-1">
                                    Invalid JSON format
                                  </p>
                                ) : null;
                              }
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Message Actions - Delete button for all messages, Add button only for last */}
                    <div className="flex items-center gap-2 relative">
                      {/* Delete and Add Message Buttons - only for last non-tool-response message */}
                      {/* Tool response messages are linked to their tool call and shouldn't have independent actions */}
                      {message.role !== "tool_response" &&
                        index ===
                          chatMessages.length -
                            1 -
                            (chatMessages[chatMessages.length - 1]?.role ===
                            "tool_response"
                              ? 1
                              : 0) && (
                          <>
                            <button
                              onClick={() => removeChatMessage(message.id)}
                              className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
                              title="Remove message"
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
                                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                                />
                              </svg>
                            </button>
                            <div className="relative">
                              <button
                                onClick={() =>
                                  setAddMessageDropdownOpen(
                                    !addMessageDropdownOpen
                                  )
                                }
                                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-muted-foreground transition-colors cursor-pointer"
                                title="Add message"
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
                                    d="M12 4.5v15m7.5-7.5h-15"
                                  />
                                </svg>
                              </button>

                              {/* Dropdown Menu */}
                              {addMessageDropdownOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-[150]"
                                    onClick={() =>
                                      setAddMessageDropdownOpen(false)
                                    }
                                  />
                                  <div
                                    className={`absolute bg-background border border-border rounded-lg shadow-xl z-[200] overflow-hidden py-1 whitespace-nowrap ${
                                      message.role === "user"
                                        ? chatMessages.length <= 2
                                          ? "right-0 top-10"
                                          : "right-0 bottom-full mb-2"
                                        : chatMessages.length <= 2
                                        ? "left-0 top-10"
                                        : "left-0 bottom-full mb-2"
                                    }`}
                                  >
                                    <button
                                      onClick={() => {
                                        addChatMessage("user");
                                        setAddMessageDropdownOpen(false);
                                      }}
                                      className="w-full px-3 py-1.5 flex items-center gap-2 text-foreground hover:bg-muted transition-colors cursor-pointer"
                                    >
                                      <svg
                                        className="w-4 h-4 text-muted-foreground"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={1.5}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
                                        />
                                      </svg>
                                      <span className="text-sm">
                                        User message
                                      </span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        addChatMessage("agent");
                                        setAddMessageDropdownOpen(false);
                                      }}
                                      className="w-full px-3 py-1.5 flex items-center gap-2 text-foreground hover:bg-muted transition-colors cursor-pointer"
                                    >
                                      <svg
                                        className="w-4 h-4 text-muted-foreground"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={1.5}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25zm.75-12h9v9h-9v-9z"
                                        />
                                      </svg>
                                      <span className="text-sm">
                                        Agent message
                                      </span>
                                    </button>
                                    <button
                                      onClick={() => {
                                        setAddMessageDropdownOpen(false);
                                        setToolCallDropdownOpen(true);
                                      }}
                                      className="w-full px-3 py-1.5 flex items-center gap-2 text-foreground hover:bg-muted transition-colors cursor-pointer"
                                    >
                                      <svg
                                        className="w-4 h-4 text-muted-foreground"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={1.5}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                                        />
                                      </svg>
                                      <span className="text-sm">
                                        Agent tool call
                                      </span>
                                    </button>
                                  </div>
                                </>
                              )}

                              {/* Tool Call Selection Dropdown */}
                              {toolCallDropdownOpen && (
                                <>
                                  <div
                                    className="fixed inset-0 z-[150]"
                                    onClick={() => {
                                      setToolCallDropdownOpen(false);
                                      setPendingToolCall(null);
                                    }}
                                  />
                                  <div
                                    className={`absolute bg-background border border-border rounded-xl shadow-xl z-[200] overflow-hidden min-w-[320px] ${
                                      message.role === "user"
                                        ? chatMessages.length <= 2
                                          ? "right-0 top-10"
                                          : "right-0 bottom-full mb-2"
                                        : chatMessages.length <= 2
                                        ? "left-0 top-10"
                                        : "left-0 bottom-full mb-2"
                                    }`}
                                  >
                                    {!pendingToolCall ? (
                                      <ToolPicker
                                        availableTools={availableTools}
                                        isLoading={availableToolsLoading}
                                        onSelectInbuiltTool={(
                                          toolId,
                                          toolName
                                        ) => {
                                          addToolCallMessage(
                                            toolId,
                                            toolName,
                                            []
                                          );
                                        }}
                                        onSelectCustomTool={(tool) => {
                                          const isWebhook =
                                            tool.config?.type === "webhook";
                                          let allParams: Array<{
                                            name: string;
                                            value: string;
                                            group?: string;
                                          }> = [];

                                          if (
                                            isWebhook &&
                                            tool.config?.webhook
                                          ) {
                                            // Extract webhook-specific parameters
                                            const webhook = tool.config.webhook;

                                            // Query parameters (for GET requests)
                                            if (
                                              webhook.queryParameters &&
                                              Array.isArray(
                                                webhook.queryParameters
                                              )
                                            ) {
                                              webhook.queryParameters.forEach(
                                                (p: any) => {
                                                  allParams.push({
                                                    name: p.id || p.name || "",
                                                    value: "",
                                                    group: "query",
                                                  });
                                                }
                                              );
                                            }

                                            // Body parameters (for POST requests)
                                            if (
                                              webhook.body?.parameters &&
                                              Array.isArray(
                                                webhook.body.parameters
                                              )
                                            ) {
                                              webhook.body.parameters.forEach(
                                                (p: any) => {
                                                  allParams.push({
                                                    name: p.id || p.name || "",
                                                    value: "",
                                                    group: "body",
                                                  });
                                                }
                                              );
                                            }
                                            // Note: Headers are not shown in conversation history UI
                                          } else {
                                            // Structured output tool - use regular parameters
                                            const params =
                                              tool.config?.parameters;
                                            if (Array.isArray(params)) {
                                              allParams = params.map(
                                                (p: any) => ({
                                                  name: p.id || p.name || "",
                                                  value: "",
                                                })
                                              );
                                            } else {
                                              const propsObj =
                                                tool.config?.parameters
                                                  ?.properties ||
                                                tool.config?.function
                                                  ?.parameters?.properties ||
                                                tool.config?.properties ||
                                                tool.config?.parameters ||
                                                {};
                                              allParams = Object.keys(
                                                propsObj
                                              ).map((name) => ({
                                                name,
                                                value: "",
                                              }));
                                            }
                                          }

                                          addToolCallMessage(
                                            tool.uuid,
                                            tool.name,
                                            allParams,
                                            isWebhook
                                          );
                                        }}
                                      />
                                    ) : (
                                      <div className="p-4">
                                        <div className="flex items-center gap-2 mb-4">
                                          <button
                                            onClick={() =>
                                              setPendingToolCall(null)
                                            }
                                            className="text-muted-foreground hover:text-foreground transition-colors"
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
                                                d="M15.75 19.5L8.25 12l7.5-7.5"
                                              />
                                            </svg>
                                          </button>
                                          <h4 className="text-sm font-medium text-foreground">
                                            {pendingToolCall.toolName}
                                          </h4>
                                        </div>
                                        <p className="text-xs text-muted-foreground mb-3">
                                          Enter values for parameters:
                                        </p>
                                        <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                          {pendingToolCall.params.map(
                                            (param, idx) => (
                                              <div key={idx}>
                                                <label className="block text-xs text-muted-foreground mb-1">
                                                  {param.name}
                                                </label>
                                                <input
                                                  type="text"
                                                  value={param.value}
                                                  onChange={(e) => {
                                                    const newParams = [
                                                      ...pendingToolCall.params,
                                                    ];
                                                    newParams[idx].value =
                                                      e.target.value;
                                                    setPendingToolCall({
                                                      ...pendingToolCall,
                                                      params: newParams,
                                                    });
                                                  }}
                                                  placeholder={`Enter ${param.name}`}
                                                  className="w-full h-9 px-3 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-accent"
                                                />
                                              </div>
                                            )
                                          )}
                                        </div>
                                        <button
                                          onClick={() =>
                                            addToolCallMessage(
                                              pendingToolCall.toolId,
                                              pendingToolCall.toolName,
                                              pendingToolCall.params
                                            )
                                          }
                                          className="w-full mt-4 h-9 px-4 rounded-lg text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                                        >
                                          Add tool call
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          </>
                        )}
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Info Footer */}
          <div className="px-4 md:px-6 py-3 md:py-4 border-t border-border">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                />
              </svg>
              <p className="text-xs text-muted-foreground leading-relaxed">
                The agent&apos;s response to the last user message will be
                evaluated against the success criteria using examples provided.
                Previous messages will be passed as context.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
