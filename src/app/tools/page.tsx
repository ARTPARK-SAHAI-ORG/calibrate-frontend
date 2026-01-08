"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";

type Parameter = {
  id: string;
  dataType: string;
  name: string;
  required: boolean;
  description: string;
  enumValues: string[];
  newEnumValue: string;
};

type ToolData = {
  uuid: string;
  name: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export default function ToolsPage() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addToolSidebarOpen, setAddToolSidebarOpen] = useState(false);
  const [newToolName, setNewToolName] = useState("");
  const [newToolDescription, setNewToolDescription] = useState("");
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [tools, setTools] = useState<ToolData[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingToolUuid, setEditingToolUuid] = useState<string | null>(null);
  const [isLoadingTool, setIsLoadingTool] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);

  const addParameter = () => {
    setParameters([
      ...parameters,
      {
        id: crypto.randomUUID(),
        dataType: "string",
        name: "",
        required: true,
        description: "",
        enumValues: [],
        newEnumValue: "",
      },
    ]);
  };

  const removeParameter = (id: string) => {
    setParameters(parameters.filter((p) => p.id !== id));
  };

  const updateParameter = (id: string, updates: Partial<Parameter>) => {
    setParameters(
      parameters.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  };

  const addEnumValue = (id: string) => {
    const param = parameters.find((p) => p.id === id);
    if (param && param.newEnumValue.trim()) {
      const trimmedValue = param.newEnumValue.trim();
      if (!param.enumValues.includes(trimmedValue)) {
        updateParameter(id, {
          enumValues: [...param.enumValues, trimmedValue],
          newEnumValue: "",
        });
      }
    }
  };

  const removeEnumValue = (paramId: string, index: number) => {
    const param = parameters.find((p) => p.id === paramId);
    if (param) {
      updateParameter(paramId, {
        enumValues: param.enumValues.filter((_, i) => i !== index),
      });
    }
  };

  // Fetch tools from backend
  useEffect(() => {
    const fetchTools = async () => {
      try {
        setToolsLoading(true);
        setToolsError(null);
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

        const data: ToolData[] = await response.json();
        setTools(data);
      } catch (err) {
        console.error("Error fetching tools:", err);
        setToolsError(
          err instanceof Error ? err.message : "Failed to load tools"
        );
      } finally {
        setToolsLoading(false);
      }
    };

    fetchTools();
  }, []);

  // Delete tool from backend
  const deleteTool = async (uuid: string) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tools/${uuid}`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete tool");
      }

      // Remove the tool from local state
      setTools(tools.filter((tool) => tool.uuid !== uuid));
    } catch (err) {
      console.error("Error deleting tool:", err);
      alert(err instanceof Error ? err.message : "Failed to delete tool");
    }
  };

  // Create tool via POST API
  const createTool = async () => {
    setValidationAttempted(true);
    if (!newToolName.trim() || !newToolDescription.trim()) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Build parameters object for the API
      const parametersConfig: Record<string, any> = {};
      parameters.forEach((param) => {
        parametersConfig[param.name] = {
          type: param.dataType,
          description: param.description,
          required: param.required,
          ...(param.enumValues.length > 0 && { enum: param.enumValues }),
        };
      });

      const response = await fetch(`${backendUrl}/tools`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          name: newToolName.trim(),
          description: newToolDescription.trim(),
          config: {
            description: newToolDescription.trim(),
            parameters: parametersConfig,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create tool");
      }

      // Refetch the tools list to get the updated data
      const toolsResponse = await fetch(`${backendUrl}/tools`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (toolsResponse.ok) {
        const updatedTools: ToolData[] = await toolsResponse.json();
        setTools(updatedTools);
      }

      // Reset form fields
      setNewToolName("");
      setNewToolDescription("");
      setParameters([]);

      // Close the sidebar
      setAddToolSidebarOpen(false);
    } catch (err) {
      console.error("Error creating tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create tool"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Fetch tool details by UUID and open edit sidebar
  const openEditTool = async (uuid: string) => {
    try {
      setIsLoadingTool(true);
      setEditingToolUuid(uuid);
      setAddToolSidebarOpen(true);
      setCreateError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tools/${uuid}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch tool details");
      }

      const toolData: ToolData = await response.json();

      // Populate form fields with tool data
      setNewToolName(toolData.name || "");
      setNewToolDescription(toolData.config?.description || "");

      // Convert parameters from config to Parameter array
      const toolParams: Parameter[] = [];
      if (toolData.config?.parameters) {
        Object.entries(toolData.config.parameters).forEach(
          ([paramName, paramConfig]: [string, any]) => {
            toolParams.push({
              id: crypto.randomUUID(),
              name: paramName,
              dataType: paramConfig.type || "string",
              required: paramConfig.required ?? true,
              description: paramConfig.description || "",
              enumValues: paramConfig.enum || [],
              newEnumValue: "",
            });
          }
        );
      }
      setParameters(toolParams);
    } catch (err) {
      console.error("Error fetching tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load tool"
      );
    } finally {
      setIsLoadingTool(false);
    }
  };

  // Update existing tool via PUT API
  const updateTool = async () => {
    setValidationAttempted(true);
    if (!newToolName.trim() || !newToolDescription.trim() || !editingToolUuid)
      return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Build parameters object for the API
      const parametersConfig: Record<string, any> = {};
      parameters.forEach((param) => {
        if (param.name) {
          parametersConfig[param.name] = {
            type: param.dataType,
            description: param.description,
            required: param.required,
            ...(param.enumValues.length > 0 && { enum: param.enumValues }),
          };
        }
      });

      const response = await fetch(`${backendUrl}/tools/${editingToolUuid}`, {
        method: "PUT",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
        },
        body: JSON.stringify({
          name: newToolName.trim(),
          description: newToolDescription.trim(),
          config: {
            description: newToolDescription.trim(),
            parameters: parametersConfig,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update tool");
      }

      // Refetch the tools list to get the updated data
      const toolsResponse = await fetch(`${backendUrl}/tools`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
        },
      });

      if (toolsResponse.ok) {
        const updatedTools: ToolData[] = await toolsResponse.json();
        setTools(updatedTools);
      }

      // Reset and close
      resetForm();
      setAddToolSidebarOpen(false);
    } catch (err) {
      console.error("Error updating tool:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update tool"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Reset form fields
  const resetForm = () => {
    setNewToolName("");
    setNewToolDescription("");
    setParameters([]);
    setEditingToolUuid(null);
    setCreateError(null);
    setValidationAttempted(false);
  };

  // Filter tools based on search query
  const filteredTools = tools.filter(
    (tool) =>
      (tool.name &&
        tool.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (tool.config?.description &&
        tool.config.description
          .toLowerCase()
          .includes(searchQuery.toLowerCase()))
  );

  return (
    <AppLayout
      activeItem="tools"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Tools</h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Manage and configure tools that can be used by your agents.
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setAddToolSidebarOpen(true);
            }}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add tool
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
            placeholder="Search tools"
            className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        {/* Tools List / Loading / Error / Empty State */}
        {toolsLoading ? (
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
        ) : toolsError ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{toolsError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
              <svg
                className="w-7 h-7 text-muted-foreground"
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
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No tools found
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              {searchQuery
                ? "No tools match your search"
                : "You haven't created any tools yet"}
            </p>
            <button
              onClick={() => {
                resetForm();
                setAddToolSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add tool
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
            {filteredTools.map((tool) => (
              <div
                key={tool.uuid}
                onClick={() => openEditTool(tool.uuid)}
                className="grid grid-cols-[1fr_2fr_auto] gap-4 px-4 py-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              >
                <div className="min-w-0">
                  <p className="text-base font-medium text-foreground truncate">
                    {tool.name}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {tool.config?.description || "—"}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (
                      confirm(`Are you sure you want to delete "${tool.name}"?`)
                    ) {
                      deleteTool(tool.uuid);
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

      {/* Add Tool Sidebar */}
      {addToolSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetForm();
              setAddToolSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-full max-w-xl bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-3">
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
                    d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                  />
                </svg>
                <h2 className="text-lg font-semibold">
                  {editingToolUuid ? "Edit tool" : "Add tool"}
                </h2>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setAddToolSidebarOpen(false);
                }}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
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
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingTool ? (
                <div className="flex items-center justify-center py-12">
                  <svg
                    className="w-6 h-6 animate-spin"
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
              ) : (
                <>
                  {/* Configuration Section */}
                  <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/30">
                    <div>
                      <h3 className="text-base font-medium mb-1">
                        Configuration
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Describe to the LLM how and when to use the tool
                      </p>
                    </div>

                    {/* Name */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newToolName}
                        onChange={(e) => setNewToolName(e.target.value)}
                        className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                          validationAttempted && !newToolName.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={newToolDescription}
                        onChange={(e) => setNewToolDescription(e.target.value)}
                        rows={3}
                        className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
                          validationAttempted && !newToolDescription.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Parameters Section */}
                  <div className="border border-border rounded-xl p-5 space-y-5 bg-muted/30">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-medium mb-1">
                          Parameters
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Define the parameters that will be sent with the event
                        </p>
                      </div>
                      <button
                        onClick={addParameter}
                        className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        Add param
                      </button>
                    </div>

                    {/* Parameter Cards */}
                    {parameters.map((param) => (
                      <div
                        key={param.id}
                        className="border border-border rounded-xl p-5 space-y-5 bg-background"
                      >
                        {/* Data type and Name */}
                        <div className="flex gap-4">
                          <div className="w-40">
                            <label className="block text-sm font-medium mb-2">
                              Data type
                            </label>
                            <div className="relative">
                              <select
                                value={param.dataType}
                                onChange={(e) =>
                                  updateParameter(param.id, {
                                    dataType: e.target.value,
                                  })
                                }
                                className="w-full h-10 pl-4 pr-10 rounded-md text-base border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none"
                              >
                                <option value="boolean">Boolean</option>
                                <option value="integer">Integer</option>
                                <option value="number">Number</option>
                                <option value="string">String</option>
                                <option value="object">Object</option>
                                <option value="array">Array</option>
                              </select>
                              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                                <svg
                                  className="w-4 h-4 text-muted-foreground"
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
                            </div>
                          </div>
                          <div className="flex-1">
                            <label className="block text-sm font-medium mb-2">
                              Name
                            </label>
                            <input
                              type="text"
                              value={param.name}
                              onChange={(e) =>
                                updateParameter(param.id, {
                                  name: e.target.value,
                                })
                              }
                              className="w-full h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                            />
                          </div>
                        </div>

                        {/* Required checkbox */}
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              updateParameter(param.id, {
                                required: !param.required,
                              })
                            }
                            className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                              param.required
                                ? "bg-foreground border-foreground"
                                : "border-border hover:border-muted-foreground"
                            }`}
                          >
                            {param.required && (
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
                          <span className="text-sm font-medium">Required</span>
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Description
                          </label>
                          <textarea
                            value={param.description}
                            onChange={(e) =>
                              updateParameter(param.id, {
                                description: e.target.value,
                              })
                            }
                            rows={3}
                            placeholder="This field will be passed to the LLM and should describe in detail what the parameter is for and how it should be populated"
                            className="w-full px-4 py-3 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
                          />
                        </div>

                        {/* Enum Values */}
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            Enum Values (optional)
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={param.newEnumValue}
                              onChange={(e) =>
                                updateParameter(param.id, {
                                  newEnumValue: e.target.value,
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  addEnumValue(param.id);
                                }
                              }}
                              placeholder="Enter an enum value"
                              className="flex-1 h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                            />
                            <button
                              onClick={() => addEnumValue(param.id)}
                              className="w-10 h-10 rounded-md border border-border bg-background hover:bg-muted/50 flex items-center justify-center transition-colors cursor-pointer"
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
                                  d="M12 4.5v15m7.5-7.5h-15"
                                />
                              </svg>
                            </button>
                          </div>
                          {param.enumValues.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {param.enumValues.map((value, index) => (
                                <div
                                  key={index}
                                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-muted text-sm"
                                >
                                  <span>{value}</span>
                                  <button
                                    onClick={() =>
                                      removeEnumValue(param.id, index)
                                    }
                                    className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
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
                              ))}
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground mt-2">
                            Add predefined values that the LLM can select from.
                            If no values are provided, the LLM can use any
                            string value.
                          </p>
                        </div>

                        {/* Delete button */}
                        <div className="flex justify-end">
                          <button
                            onClick={() => removeParameter(param.id)}
                            className="h-9 px-4 rounded-md text-sm font-medium text-red-500 bg-red-500/10 hover:text-red-600 hover:bg-red-500/20 transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-border space-y-3">
              {createError && (
                <p className="text-sm text-red-500">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => {
                    resetForm();
                    setAddToolSidebarOpen(false);
                  }}
                  disabled={isCreating || isLoadingTool}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={editingToolUuid ? updateTool : createTool}
                  disabled={isCreating || isLoadingTool}
                  className="h-10 px-4 rounded-md text-base font-medium bg-white text-gray-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                      {editingToolUuid ? "Saving..." : "Creating..."}
                    </>
                  ) : editingToolUuid ? (
                    "Save"
                  ) : (
                    "Add tool"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
