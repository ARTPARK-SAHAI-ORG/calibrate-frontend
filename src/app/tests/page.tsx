"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import {
  ToolPicker,
  AvailableTool,
  getToolParams,
} from "@/components/ToolPicker";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type Tool = {
  id: string;
  name: string;
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
  onSubmit: () => void;
};

function AddTestDialog({
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
}: AddTestDialogProps) {
  const [activeTab, setActiveTab] = useState<"next-reply" | "tool-invocation">(
    "next-reply"
  );
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [expectedMessage, setExpectedMessage] = useState("");
  const [toolDropdownOpen, setToolDropdownOpen] = useState(false);
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [availableToolsLoading, setAvailableToolsLoading] = useState(false);
  const [toolCallExpectation, setToolCallExpectation] = useState<
    "should-call" | "should-not-call"
  >("should-call");
  const [acceptAnyParameterValues, setAcceptAnyParameterValues] =
    useState(false);
  const [expectedParameters, setExpectedParameters] = useState<
    Array<{
      id: string;
      name: string;
      value: string;
    }>
  >([]);
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

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new messages are added
  useEffect(() => {
    if (chatMessages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages.length]);

  const updateParameterValue = (id: string, value: string) => {
    setExpectedParameters(
      expectedParameters.map((param) =>
        param.id === id ? { ...param, value } : param
      )
    );
  };

  // Fetch available tools when dialog opens
  useEffect(() => {
    const fetchTools = async () => {
      if (!isOpen) return;

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
          },
        });

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
  }, [isOpen]);

  const addToolFromSelection = (tool: AvailableTool) => {
    setSelectedTool({ id: tool.uuid, name: tool.name });
    setToolDropdownOpen(false);

    // Extract parameters from tool config - handle different possible structures
    const params =
      tool.config?.parameters?.properties ||
      tool.config?.function?.parameters?.properties ||
      tool.config?.properties ||
      tool.config?.parameters ||
      {};
    const paramList = Object.keys(params).map((name) => ({
      id: Date.now().toString() + name,
      name,
      value: "",
    }));
    setExpectedParameters(paramList);
  };

  const selectInbuiltTool = (toolId: string, toolName: string) => {
    setSelectedTool({ id: toolId, name: toolName });
    setToolDropdownOpen(false);
    // In-built tools don't have configurable parameters
    setExpectedParameters([]);
  };

  const removeTool = () => {
    setSelectedTool(null);
    setExpectedParameters([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-gray-500/20" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full max-w-7xl h-[85vh] bg-black rounded-2xl shadow-2xl flex overflow-hidden">
        {/* Left Column - Form */}
        <div className="w-2/5 flex flex-col border-r border-[#222]">
          {/* Tabs */}
          <div className="flex border-b border-[#222]">
            <button
              onClick={() => setActiveTab("next-reply")}
              className={`flex-1 py-4 text-base font-medium transition-colors cursor-pointer ${
                activeTab === "next-reply"
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-gray-300"
              }`}
            >
              Next reply test
            </button>
            <button
              onClick={() => setActiveTab("tool-invocation")}
              className={`flex-1 py-4 text-base font-medium transition-colors cursor-pointer ${
                activeTab === "tool-invocation"
                  ? "text-white border-b-2 border-white"
                  : "text-gray-400 hover:text-gray-300"
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
                  className="w-6 h-6 animate-spin text-white"
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
                  <label className="block text-base font-medium text-white mb-2">
                    Test name
                  </label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="Your test name"
                    className={`w-full h-11 px-4 rounded-lg text-base bg-black text-white placeholder:text-gray-500 border focus:outline-none focus:ring-2 focus:ring-gray-600 ${
                      validationAttempted && !testName.trim()
                        ? "border-red-500"
                        : "border-[#2a2a2a]"
                    }`}
                  />
                </div>

                {/* Describe expected next message */}
                <div>
                  <label className="block text-base font-medium text-white mb-2">
                    Describe expected next message
                  </label>
                  <textarea
                    value={expectedMessage}
                    onChange={(e) => setExpectedMessage(e.target.value)}
                    placeholder="Describe the ideal response or behavior the agent should exhibit to pass this test (e.g., provides a correct answer, uses a specific tone, includes key information)."
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg text-base bg-black text-white placeholder:text-gray-500 border border-[#2a2a2a] focus:outline-none focus:ring-2 focus:ring-gray-600 resize-none"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Test Name */}
                <div>
                  <label className="block text-base font-medium text-white mb-2">
                    Test name
                  </label>
                  <input
                    type="text"
                    value={testName}
                    onChange={(e) => setTestName(e.target.value)}
                    placeholder="Your test name"
                    className={`w-full h-11 px-4 rounded-lg text-base bg-black text-white placeholder:text-gray-500 border focus:outline-none focus:ring-2 focus:ring-gray-600 ${
                      validationAttempted && !testName.trim()
                        ? "border-red-500"
                        : "border-[#2a2a2a]"
                    }`}
                  />
                </div>

                {/* Tool to test */}
                <div className="relative">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-base font-medium text-white">
                      Tool to test
                    </label>
                    <button
                      onClick={() => setToolDropdownOpen(!toolDropdownOpen)}
                      className="px-3 py-1.5 text-sm font-medium bg-black text-white rounded-lg hover:bg-[#222] transition-colors cursor-pointer border border-[#2a2a2a]"
                    >
                      {selectedTool ? "Change tool" : "Add tool"}
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
                      <div className="absolute right-0 top-8 mt-2 w-full bg-[#1a1a1a] border border-[#333] rounded-xl shadow-2xl z-[100] overflow-hidden">
                        <ToolPicker
                          availableTools={availableTools}
                          isLoading={availableToolsLoading}
                          onSelectInbuiltTool={(toolId, toolName) => {
                            selectInbuiltTool(toolId, toolName);
                          }}
                          onSelectCustomTool={(tool) => {
                            addToolFromSelection(tool);
                          }}
                        />
                      </div>
                    </>
                  )}

                  {!selectedTool ? (
                    <div className="bg-[#161616] rounded-lg p-8 text-center ">
                      <p className="text-gray-400 text-sm">
                        If you leave this empty, the test will check that no
                        tool has been called.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Selected tool display */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-10 px-4 rounded-lg text-base bg-[#161616] text-white border border-[#2a2a2a] flex items-center">
                          {selectedTool.name}
                        </div>
                        <button
                          onClick={() => removeTool()}
                          className="w-10 h-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-[#222] transition-colors cursor-pointer"
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
                      <div className="mt-4">
                        <div className="flex rounded-lg overflow-hidden border border-[#2a2a2a]">
                          <button
                            onClick={() =>
                              setToolCallExpectation("should-call")
                            }
                            className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                              toolCallExpectation === "should-call"
                                ? "bg-white text-black"
                                : "bg-transparent text-gray-400 hover:text-white"
                            }`}
                          >
                            Should have been called
                          </button>
                          <button
                            onClick={() =>
                              setToolCallExpectation("should-not-call")
                            }
                            className={`flex-1 py-2.5 text-sm font-medium transition-colors cursor-pointer ${
                              toolCallExpectation === "should-not-call"
                                ? "bg-white text-black"
                                : "bg-transparent text-gray-400 hover:text-white"
                            }`}
                          >
                            Should not have been called
                          </button>
                        </div>
                      </div>

                      {/* Accept any parameter values toggle - only show when "should call" is selected and has parameters */}
                      {toolCallExpectation === "should-call" &&
                        expectedParameters.length > 0 && (
                          <div className="mt-4 flex items-center gap-3">
                            <button
                              onClick={() =>
                                setAcceptAnyParameterValues(
                                  !acceptAnyParameterValues
                                )
                              }
                              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                                acceptAnyParameterValues
                                  ? "bg-white"
                                  : "bg-[#333]"
                              }`}
                            >
                              <div
                                className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform ${
                                  acceptAnyParameterValues
                                    ? "translate-x-5 bg-black"
                                    : "translate-x-0.5 bg-gray-500"
                                }`}
                              />
                            </button>
                            <span className="text-sm text-gray-300">
                              Accept any values for the parameters
                            </span>
                          </div>
                        )}

                      {/* Expected parameters section - only show when "should call" is selected and toggle is off */}
                      {toolCallExpectation === "should-call" &&
                        expectedParameters.length > 0 &&
                        !acceptAnyParameterValues && (
                          <div className="mt-4">
                            <div className="mb-3">
                              <h4 className="text-base font-medium text-white">
                                Expected extracted parameters
                              </h4>
                              <p className="text-sm text-gray-400 mt-1">
                                Configure how each parameter should be evaluated
                                when the agent calls this tool.
                              </p>
                            </div>

                            <div className="space-y-3">
                              {expectedParameters.map((param) => (
                                <div key={param.id}>
                                  <label className="block text-sm font-medium text-gray-300 mb-1.5">
                                    {param.name}
                                  </label>
                                  <input
                                    type="text"
                                    value={param.value}
                                    onChange={(e) =>
                                      updateParameterValue(
                                        param.id,
                                        e.target.value
                                      )
                                    }
                                    placeholder="Expected value"
                                    className="w-full h-10 px-4 rounded-lg text-sm bg-black text-white placeholder:text-gray-500 border border-[#2a2a2a] focus:outline-none focus:ring-2 focus:ring-gray-500"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#222] bg-black">
            {createError && (
              <p className="text-sm text-red-500 mb-3">{createError}</p>
            )}
            <div className="flex items-center justify-between">
              <button
                onClick={onClose}
                disabled={isCreating || isLoading}
                className="h-10 px-5 rounded-lg text-base font-medium bg-black text-white hover:bg-[#222] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border border-[#2a2a2a]"
              >
                Back
              </button>
              <button
                onClick={onSubmit}
                disabled={isCreating || isLoading}
                className="h-10 px-5 rounded-lg text-base font-medium bg-white text-black hover:bg-[#444] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
            </div>
          </div>
        </div>

        {/* Right Column - Chat Messages */}
        <div className="w-3/5 flex flex-col bg-[#0a0a0a] overflow-visible">
          {/* Chat Messages Area */}
          <div className="flex-1 overflow-y-auto overflow-x-visible p-6">
            {chatMessages.length === 0 ? (
              /* Empty State Placeholder */
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                {/* Globe with chat icon */}
                <div className="mb-6">
                  <svg
                    className="w-24 h-24 text-gray-600"
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
                      fill="#1a1a1a"
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

                <h3 className="text-xl font-semibold text-white mb-3">
                  No conversation context
                </h3>

                <p className="text-gray-400 text-sm mb-6 max-w-md leading-relaxed">
                  The agent&apos;s response to the last user message will be
                  evaluated against the success criteria using examples
                  provided. Previous messages will be passed as context.
                </p>

                <p className="text-gray-500 text-sm mb-4">
                  Create conversation context starting with
                </p>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => addChatMessage("agent")}
                    className="px-4 py-2.5 rounded-xl border border-[#333] bg-transparent text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-5 h-5 text-gray-400"
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
                    className="px-4 py-2.5 rounded-xl border border-[#333] bg-transparent text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <svg
                      className="w-5 h-5 text-gray-400"
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
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            message.role === "tool_call"
                              ? "bg-orange-500/20"
                              : "bg-white/10"
                          }`}
                        >
                          {message.role === "tool_call" ? (
                            <svg
                              className="w-3.5 h-3.5 text-orange-400"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="w-3.5 h-3.5 text-white"
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
                          )}
                        </div>
                        <span className="text-sm font-medium text-white">
                          {message.role === "tool_call"
                            ? "Agent Tool Call"
                            : "Agent"}
                        </span>
                      </div>
                    )}

                    {/* Message Bubble - for agent and user messages */}
                    {(message.role === "agent" || message.role === "user") && (
                      <div
                        className={`${
                          message.role === "agent" ? "ml-8 w-1/2" : "w-1/2"
                        }`}
                      >
                        <input
                          type="text"
                          value={message.content}
                          onChange={(e) =>
                            updateChatMessage(message.id, e.target.value)
                          }
                          className={`w-full px-4 py-2 rounded-xl text-sm text-white border focus:outline-none focus:ring-1 focus:ring-gray-500 ${
                            message.role === "agent"
                              ? "bg-black border-[#333]"
                              : "bg-[#242426] border-[#444]"
                          }`}
                        />
                      </div>
                    )}

                    {/* Tool Call Display */}
                    {message.role === "tool_call" && (
                      <div className="ml-8 w-1/2">
                        <div className="bg-[#1a1a1a] border border-[#333] rounded-2xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              className="w-4 h-4 text-orange-400"
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
                            <span className="text-sm font-medium text-orange-400">
                              {message.toolName}
                            </span>
                          </div>
                          {message.toolParams &&
                          message.toolParams.length > 0 ? (
                            <div className="space-y-2 mt-3">
                              {message.toolParams.map((param, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-xs text-gray-400 min-w-[80px]">
                                    {param.name}:
                                  </span>
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
                                    className="flex-1 h-8 px-3 rounded-lg text-xs bg-black text-white placeholder:text-gray-500 border border-[#2a2a2a] focus:outline-none focus:ring-1 focus:ring-gray-500"
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-500">
                              No parameters
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Message Actions - Delete button for all messages, Add button only for last */}
                    <div
                      className={`flex items-center gap-2 relative ${
                        message.role === "agent" || message.role === "tool_call"
                          ? "ml-8"
                          : ""
                      }`}
                    >
                      {/* Delete and Add Message Buttons - only for last message */}
                      {index === chatMessages.length - 1 && (
                        <>
                          <button
                            onClick={() => removeChatMessage(message.id)}
                            className="w-8 h-8 rounded-lg border border-[#333] flex items-center justify-center text-gray-400 hover:text-red-400 hover:border-red-400/50 transition-colors cursor-pointer"
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
                              className="w-8 h-8 rounded-lg border border-[#333] flex items-center justify-center text-gray-400 hover:text-white hover:border-gray-500 transition-colors cursor-pointer"
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
                                  className={`absolute bg-[#2a2a2a] rounded-lg shadow-xl z-[200] overflow-hidden py-1 whitespace-nowrap ${
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
                                    className="w-full px-3 py-1.5 flex items-center gap-2 text-white hover:bg-[#3a3a3a] transition-colors cursor-pointer"
                                  >
                                    <svg
                                      className="w-4 h-4 text-gray-400"
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
                                    className="w-full px-3 py-1.5 flex items-center gap-2 text-white hover:bg-[#3a3a3a] transition-colors cursor-pointer"
                                  >
                                    <svg
                                      className="w-4 h-4 text-gray-400"
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
                                    className="w-full px-3 py-1.5 flex items-center gap-2 text-white hover:bg-[#3a3a3a] transition-colors cursor-pointer"
                                  >
                                    <svg
                                      className="w-4 h-4 text-gray-400"
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
                                  className={`absolute bg-[#1a1a1a] border border-[#333] rounded-xl shadow-xl z-[200] overflow-hidden min-w-[320px] ${
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
                                        if (params.length === 0) {
                                          addToolCallMessage(
                                            tool.uuid,
                                            tool.name,
                                            []
                                          );
                                        } else {
                                          setPendingToolCall({
                                            toolId: tool.uuid,
                                            toolName: tool.name,
                                            params,
                                          });
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="p-4">
                                      <div className="flex items-center gap-2 mb-4">
                                        <button
                                          onClick={() =>
                                            setPendingToolCall(null)
                                          }
                                          className="text-gray-400 hover:text-white transition-colors"
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
                                        <h4 className="text-sm font-medium text-white">
                                          {pendingToolCall.toolName}
                                        </h4>
                                      </div>
                                      <p className="text-xs text-gray-400 mb-3">
                                        Enter values for parameters:
                                      </p>
                                      <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                        {pendingToolCall.params.map(
                                          (param, idx) => (
                                            <div key={idx}>
                                              <label className="block text-xs text-gray-400 mb-1">
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
                                                className="w-full h-9 px-3 rounded-lg text-sm bg-black text-white placeholder:text-gray-500 border border-[#2a2a2a] focus:outline-none focus:ring-1 focus:ring-gray-500"
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
                                        className="w-full mt-4 h-9 px-4 rounded-lg text-sm font-medium bg-white text-black hover:bg-gray-200 transition-colors cursor-pointer"
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
          <div className="px-6 py-4 border-t border-[#222]">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0"
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
              <p className="text-xs text-gray-500 leading-relaxed">
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

export default function LLMPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addTestSidebarOpen, setAddTestSidebarOpen] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [newTestDescription, setNewTestDescription] = useState("");
  const [tests, setTests] = useState<TestData[]>([]);
  const [testsLoading, setTestsLoading] = useState(true);
  const [testsError, setTestsError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingTestUuid, setEditingTestUuid] = useState<string | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Fetch tests from backend
  useEffect(() => {
    const fetchTests = async () => {
      try {
        setTestsLoading(true);
        setTestsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tests`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch tests");
        }

        const data: TestData[] = await response.json();
        setTests(data);
      } catch (err) {
        console.error("Error fetching tests:", err);
        setTestsError(
          err instanceof Error ? err.message : "Failed to load tests"
        );
      } finally {
        setTestsLoading(false);
      }
    };

    fetchTests();
  }, []);

  // Delete test from backend
  const deleteTest = async (uuid: string) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests/${uuid}`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete test");
      }

      // Remove the test from local state
      setTests(tests.filter((test) => test.uuid !== uuid));
    } catch (err) {
      console.error("Error deleting test:", err);
      alert(err instanceof Error ? err.message : "Failed to delete test");
    }
  };

  // Create test via POST API
  const createTest = async () => {
    setValidationAttempted(true);
    if (!newTestName.trim() || !newTestDescription.trim()) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          name: newTestName.trim(),
          description: newTestDescription.trim(),
          config: {
            description: newTestDescription.trim(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create test");
      }

      // Refetch the tests list to get the updated data
      const testsResponse = await fetch(`${backendUrl}/tests`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (testsResponse.ok) {
        const updatedTests: TestData[] = await testsResponse.json();
        setTests(updatedTests);
      }

      // Reset form fields
      setNewTestName("");
      setNewTestDescription("");

      // Close the sidebar
      setAddTestSidebarOpen(false);
    } catch (err) {
      console.error("Error creating test:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create test"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Fetch test details by UUID and open edit sidebar
  const openEditTest = async (uuid: string) => {
    try {
      setIsLoadingTest(true);
      setEditingTestUuid(uuid);
      setAddTestSidebarOpen(true);
      setCreateError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests/${uuid}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch test details");
      }

      const testData: TestData = await response.json();

      // Populate form fields with test data
      setNewTestName(testData.name || "");
      setNewTestDescription(
        testData.config?.description || testData.description || ""
      );
    } catch (err) {
      console.error("Error fetching test:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load test"
      );
    } finally {
      setIsLoadingTest(false);
    }
  };

  // Update existing test via PUT API
  const updateTest = async () => {
    setValidationAttempted(true);
    if (!newTestName.trim() || !newTestDescription.trim() || !editingTestUuid)
      return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests/${editingTestUuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          name: newTestName.trim(),
          description: newTestDescription.trim(),
          config: {
            description: newTestDescription.trim(),
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update test");
      }

      // Refetch the tests list to get the updated data
      const testsResponse = await fetch(`${backendUrl}/tests`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (testsResponse.ok) {
        const updatedTests: TestData[] = await testsResponse.json();
        setTests(updatedTests);
      }

      // Reset and close
      resetForm();
      setAddTestSidebarOpen(false);
    } catch (err) {
      console.error("Error updating test:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update test"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Reset form fields
  const resetForm = () => {
    setNewTestName("");
    setNewTestDescription("");
    setEditingTestUuid(null);
    setCreateError(null);
    setValidationAttempted(false);
  };

  // Filter tests based on search query
  const filteredTests = tests.filter(
    (test) =>
      (test.name &&
        test.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (test.description &&
        test.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (test.config?.description &&
        test.config.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase()))
  );

  return (
    <AppLayout
      activeItem="tests"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Tests</h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Create and manage tests to evaluate your language models.
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setAddTestSidebarOpen(true);
            }}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add test
          </button>
        </div>

        {/* Search Input */}
        <div className="relative max-w-md">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-5 h-5 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tests"
            className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        {/* Tests List / Loading / Error / Empty State */}
        {testsLoading ? (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg
              className="w-5 h-5 animate-spin"
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
        ) : testsError ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{testsError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
              <svg
                className="w-7 h-7 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M9 3h6v2h-1v4.5l4.5 7.5c.5.83.5 1.5-.17 2.17-.67.67-1.34.83-2.33.83H8c-1 0-1.67-.17-2.33-.83-.67-.67-.67-1.34-.17-2.17L10 9.5V5H9V3zm3 8.5L8.5 17h7L12 11.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No tests found
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              {searchQuery
                ? "No tests match your search"
                : "You haven't created any tests yet"}
            </p>
            <button
              onClick={() => {
                resetForm();
                setAddTestSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add test
            </button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-3 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Name
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Description
              </div>
              <div className="w-10"></div>
            </div>
            {/* Table Rows */}
            {filteredTests.map((test) => (
              <div
                key={test.uuid}
                onClick={() => openEditTest(test.uuid)}
                className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              >
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground truncate">
                    {test.name}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {test.config?.description || test.description || "—"}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm(`Are you sure you want to delete "${test.name}"?`)
                    ) {
                      deleteTest(test.uuid);
                    }
                  }}
                  className="w-10 h-10 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
            ))}
          </div>
        )}
      </div>

      {/* Add Test Dialog */}
      {addTestSidebarOpen && (
        <AddTestDialog
          isOpen={addTestSidebarOpen}
          onClose={() => {
            resetForm();
            setAddTestSidebarOpen(false);
          }}
          isEditing={!!editingTestUuid}
          isLoading={isLoadingTest}
          isCreating={isCreating}
          createError={createError}
          testName={newTestName}
          setTestName={setNewTestName}
          validationAttempted={validationAttempted}
          onSubmit={editingTestUuid ? updateTest : createTest}
        />
      )}
    </AppLayout>
  );
}
