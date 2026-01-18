"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { ToolPicker, AvailableTool } from "@/components/ToolPicker";
import { INBUILT_TOOLS } from "@/constants/inbuilt-tools";

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
  settings?: {
    language?: "english" | "hindi" | "kannada";
  };
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
  onSubmit: (config: TestConfig) => void;
  initialTab?: "next-reply" | "tool-invocation";
  initialConfig?: TestConfig;
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
}: AddTestDialogProps) {
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [activeTab, setActiveTab] = useState<"next-reply" | "tool-invocation">(
    initialTab || "next-reply"
  );

  // Update active tab when initialTab changes (when opening an existing test)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Populate fields from initialConfig when editing an existing test
  useEffect(() => {
    if (initialConfig) {
      // Parse history and convert to chatMessages format
      if (initialConfig.history && initialConfig.history.length > 0) {
        const messages: Array<{
          id: string;
          role: "agent" | "user" | "tool_call";
          content: string;
          toolName?: string;
          toolId?: string;
          toolParams?: Array<{ name: string; value: string }>;
        }> = [];

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
              messages.push({
                id: toolCall.id || `tool-${index}`,
                role: "tool_call",
                content: "",
                toolId: toolCall.id,
                toolName: toolCall.function.name,
                toolParams: Object.entries(parsedArgs).map(([name, value]) => ({
                  name,
                  value: String(value),
                })),
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
          }
          // Skip "tool" role messages as they are tool responses
        });

        if (messages.length > 0) {
          setChatMessages(messages);
        }
      }

      // Populate settings fields
      if (initialConfig.settings?.language) {
        setTestLanguage(initialConfig.settings.language);
      }

      // Populate evaluation fields
      if (initialConfig.evaluation) {
        if (
          initialConfig.evaluation.type === "response" &&
          initialConfig.evaluation.criteria
        ) {
          setExpectedMessage(initialConfig.evaluation.criteria);
        } else if (initialConfig.evaluation.type === "tool_call") {
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
  }, [initialConfig]);

  const [selectedTools, setSelectedTools] = useState<SelectedToolConfig[]>([]);
  const [expectedMessage, setExpectedMessage] = useState("");
  const [testLanguage, setTestLanguage] = useState<
    "english" | "hindi" | "kannada"
  >("english");
  const [localValidationAttempted, setLocalValidationAttempted] =
    useState(false);
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [availableToolsLoading, setAvailableToolsLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      role: "agent" | "user" | "tool_call";
      content: string;
      toolName?: string;
      toolId?: string;
      toolParams?: Array<{ name: string; value: string }>;
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
    params: Array<{ name: string; value: string }>
  ) => {
    setChatMessages([
      ...chatMessages,
      {
        id: Date.now().toString(),
        role: "tool_call",
        content: "",
        toolId,
        toolName,
        toolParams: params,
      },
    ]);
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
    value: string
  ) => {
    setChatMessages(
      chatMessages.map((msg) =>
        msg.id === messageId && msg.toolParams
          ? {
              ...msg,
              toolParams: msg.toolParams.map((p) =>
                p.name === paramName ? { ...p, value } : p
              ),
            }
          : msg
      )
    );
  };

  const removeChatMessage = (id: string) => {
    setChatMessages(chatMessages.filter((msg) => msg.id !== id));
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
      }
    };

    fetchTools();
  }, [isOpen, backendAccessToken]);

  const addToolFromSelection = (tool: AvailableTool) => {
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
      acceptAnyParameterValues: false,
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
        const argsObj: Record<string, string> = {};
        if (message.toolParams) {
          for (const param of message.toolParams) {
            argsObj[param.name] = param.value;
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

        // Add the tool response message
        history.push({
          role: "tool",
          content: '{"status": "received"}',
          tool_call_id: toolCallId,
        });
      }
    }

    // Build the evaluation object based on the active tab
    let evaluation: TestConfig["evaluation"];

    if (activeTab === "tool-invocation") {
      if (selectedTools.length > 0) {
        // Build tool_calls array from all selected tools
        const toolCalls = selectedTools.map((tool) => {
          // Use tool.id for inbuilt tools, tool.name for custom tools
          const toolIdentifier = tool.isInbuilt ? tool.id : tool.name;

          if (tool.expectation === "should-call") {
            // Build the expected arguments
            const expectedArgs: Record<string, any> = {};
            if (!tool.acceptAnyParameterValues) {
              for (const param of tool.expectedParameters) {
                // Try to parse as JSON, otherwise use as string
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
          } else {
            // should-not-call
            return {
              tool: toolIdentifier,
              arguments: {},
              is_called: false,
              accept_any_arguments: false,
            };
          }
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
      // next-reply test
      evaluation = {
        type: "response",
        criteria: expectedMessage,
      };
    }

    // Build settings object (only for next-reply tests)
    const settings =
      activeTab === "next-reply"
        ? {
            language: testLanguage,
          }
        : undefined;

    return { history, settings, evaluation };
  };

  // Handle form submission
  const handleSubmit = () => {
    setLocalValidationAttempted(true);

    // Auto-hide validation errors after 3 seconds
    setTimeout(() => {
      setLocalValidationAttempted(false);
    }, 3000);

    // Validate required fields based on test type
    if (activeTab === "next-reply") {
      if (!testName.trim() || !expectedMessage.trim()) {
        return; // Don't submit if validation fails
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
    }

    const config = buildConfig();
    onSubmit(config);
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
        className="absolute inset-0 bg-black/50"
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
      <div className="relative w-full max-w-7xl h-[85vh] bg-background rounded-2xl shadow-2xl flex overflow-hidden border border-border">
        {/* Left Column - Form */}
        <div className="w-2/5 flex flex-col border-r border-border">
          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab("next-reply")}
              className={`flex-1 py-4 text-base font-medium transition-colors cursor-pointer ${
                activeTab === "next-reply"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Next reply test
            </button>
            <button
              onClick={() => setActiveTab("tool-invocation")}
              className={`flex-1 py-4 text-base font-medium transition-colors cursor-pointer ${
                activeTab === "tool-invocation"
                  ? "text-foreground border-b-2 border-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Tool invocation test
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto overflow-x-visible p-6">
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

                {/* Describe expected next message */}
                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Describe expected next reply
                  </label>
                  <textarea
                    value={expectedMessage}
                    onChange={(e) => setExpectedMessage(e.target.value)}
                    placeholder="Describe the ideal response of the agent given the conversation history on the right to pass this test (e.g., provides a correct answer, uses a specific tone, includes key information)."
                    rows={4}
                    className={`w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent resize-none ${
                      localValidationAttempted &&
                      activeTab === "next-reply" &&
                      !expectedMessage.trim()
                        ? "border-red-500"
                        : "border-border"
                    }`}
                  />
                </div>

                {/* Language */}
                <div>
                  <label className="block text-base font-medium text-foreground mb-2">
                    Language
                  </label>
                  <div className="flex rounded-lg border border-border overflow-hidden w-fit">
                    {(["english", "hindi", "kannada"] as const).map(
                      (lang, index) => (
                        <button
                          key={lang}
                          type="button"
                          onClick={() => setTestLanguage(lang)}
                          className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
                            index > 0 ? "border-l border-border" : ""
                          } ${
                            testLanguage === lang
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

                          {/* Should have been called / Should not have been called tabs */}
                          <div className="flex rounded-lg overflow-hidden border border-border">
                            <button
                              onClick={() =>
                                updateToolConfig(tool.id, {
                                  expectation: "should-call",
                                })
                              }
                              className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                                tool.expectation === "should-call"
                                  ? "bg-foreground text-background"
                                  : "bg-muted text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Should have been called
                            </button>
                            <button
                              onClick={() =>
                                updateToolConfig(tool.id, {
                                  expectation: "should-not-call",
                                })
                              }
                              className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                                tool.expectation === "should-not-call"
                                  ? "bg-foreground text-background"
                                  : "bg-muted text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              Should not have been called
                            </button>
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
          <div className="px-6 py-4 bg-background">
            {createError && (
              <p className="text-sm text-red-500 mb-3">{createError}</p>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={onClose}
                disabled={isCreating || isLoading}
                className="h-10 px-5 rounded-lg text-base font-medium bg-background text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-border"
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
                      className="h-10 px-5 rounded-lg text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        <div className="w-3/5 flex flex-col bg-muted/30 overflow-visible">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto overflow-x-visible p-6">
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
                        <input
                          type="text"
                          value={message.content}
                          onChange={(e) =>
                            updateChatMessage(message.id, e.target.value)
                          }
                          className={`w-full px-4 py-2 rounded-xl text-sm text-foreground border focus:outline-none focus:ring-1 focus:ring-accent ${
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
                          </div>
                          {message.toolParams &&
                            message.toolParams.length > 0 && (
                              <div className="space-y-3 mt-3">
                                {message.toolParams.map((param, idx) => (
                                  <div key={idx}>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                                      {param.name}
                                    </label>
                                    <input
                                      type="text"
                                      value={param.value}
                                      onChange={(e) =>
                                        updateToolCallParam(
                                          message.id,
                                          param.name,
                                          e.target.value
                                        )
                                      }
                                      placeholder={`Enter ${param.name}`}
                                      className="w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent"
                                    />
                                  </div>
                                ))}
                              </div>
                            )}
                        </div>
                      </div>
                    )}

                    {/* Message Actions - Delete button for all messages, Add button only for last */}
                    <div className="flex items-center gap-2 relative">
                      {/* Delete and Add Message Buttons - only for last message */}
                      {index === chatMessages.length - 1 && (
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
                                      onSelectCustomTool={(tool, params) => {
                                        // Always add tool call directly with params (empty values if has params)
                                        addToolCallMessage(
                                          tool.uuid,
                                          tool.name,
                                          params.map((p) => ({
                                            name: p.name,
                                            value: "",
                                          }))
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
          <div className="px-6 py-4 border-t border-border">
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
