"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { AddToolDialog } from "@/components/AddToolDialog";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { useSidebarState } from "@/lib/sidebar";

type ToolData = {
  uuid: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

export default function ToolsPage() {
  const router = useRouter();
  const backendAccessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [searchQuery, setSearchQuery] = useState("");

  // Set page title
  useEffect(() => {
    document.title = "Tools | Calibrate";
  }, []);

  const [addToolDialogOpen, setAddToolDialogOpen] = useState(false);
  const [editingToolUuid, setEditingToolUuid] = useState<string | null>(null);
  const [toolType, setToolType] = useState<"structured_output" | "webhook">(
    "structured_output"
  );
  const [tools, setTools] = useState<ToolData[]>([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<ToolData | null>(null);
  const [isToolDeleting, setIsToolDeleting] = useState(false);

  // Fetch tools from backend
  useEffect(() => {
    const fetchTools = async () => {
      if (!backendAccessToken) return;

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
  }, [backendAccessToken]);

  // Open delete confirmation dialog
  const openDeleteDialog = (tool: ToolData) => {
    setToolToDelete(tool);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isToolDeleting) {
      setDeleteDialogOpen(false);
      setToolToDelete(null);
    }
  };

  // Delete tool from backend
  const deleteTool = async () => {
    if (!toolToDelete) return;

    try {
      setIsToolDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tools/${toolToDelete.uuid}`, {
        method: "DELETE",
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
        throw new Error("Failed to delete tool");
      }

      // Remove the tool from local state
      setTools(tools.filter((tool) => tool.uuid !== toolToDelete.uuid));
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting tool:", err);
    } finally {
      setIsToolDeleting(false);
    }
  };

  // Open add tool dialog
  const openAddToolDialog = (type: "structured_output" | "webhook") => {
    setEditingToolUuid(null);
    setToolType(type);
    setAddToolDialogOpen(true);
  };

  // Open edit tool dialog
  const openEditToolDialog = (uuid: string) => {
    setEditingToolUuid(uuid);
    // Get tool type from config, default to "structured_output" if not present
    const tool = tools.find((t) => t.uuid === uuid);
    const type =
      tool?.config?.type === "webhook" ? "webhook" : "structured_output";
    setToolType(type);
    setAddToolDialogOpen(true);
  };

  // Close tool dialog
  const closeToolDialog = () => {
    setAddToolDialogOpen(false);
    setEditingToolUuid(null);
  };

  // Filter tools based on search query
  const filteredTools = tools.filter(
    (tool) =>
      (tool.name &&
        tool.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      ((tool.description || tool.config?.description) &&
        (tool.description || tool.config?.description)
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
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Header */}
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Tools</h1>
          <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
            Manage and configure tools that can be used by your agents
          </p>
        </div>
        {/* Add Tool Cards */}
        <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
          <button
            onClick={() => openAddToolDialog("webhook")}
            className="h-9 md:h-10 px-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer text-sm md:text-base font-medium text-foreground"
          >
            Add webhook tool
          </button>
          <button
            onClick={() => openAddToolDialog("structured_output")}
            className="h-9 md:h-10 px-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer text-sm md:text-base font-medium text-foreground"
          >
            Add structured output tool
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
            className="w-full h-9 md:h-10 pl-10 pr-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
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
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm md:text-base text-red-500 mb-2">
              {toolsError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
              <svg
                className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground"
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
            <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
              No tools found
            </h3>
            <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center px-4">
              {searchQuery
                ? "No tools match your search"
                : "You haven't created any tools yet"}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 w-full sm:w-auto px-4 sm:px-0">
              <button
                onClick={() => openAddToolDialog("webhook")}
                className="h-9 md:h-10 px-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer text-sm md:text-base font-medium text-foreground"
              >
                Add webhook tool
              </button>
              <button
                onClick={() => openAddToolDialog("structured_output")}
                className="h-9 md:h-10 px-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer text-sm md:text-base font-medium text-foreground"
              >
                Add structured output tool
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block border border-border rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[200px_150px_1fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                <div className="text-sm font-medium text-muted-foreground">
                  Name
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Type
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Description
                </div>
                <div className="w-8"></div>
              </div>
              {/* Table Rows */}
              {filteredTools.map((tool) => (
                <div
                  key={tool.uuid}
                  onClick={() => openEditToolDialog(tool.uuid)}
                  className="grid grid-cols-[200px_150px_1fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                >
                  <div className="overflow-x-auto max-w-full">
                    <p className="text-sm font-medium text-foreground whitespace-nowrap">
                      {tool.name}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tool.config?.type === "webhook"
                      ? "Webhook"
                      : "Structured Output"}
                  </p>
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {tool.description || tool.config?.description || "—"}
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteDialog(tool);
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
                </div>
              ))}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredTools.map((tool) => (
                <div
                  key={tool.uuid}
                  className="border border-border rounded-lg overflow-hidden bg-background"
                >
                  <div
                    onClick={() => openEditToolDialog(tool.uuid)}
                    className="p-4 cursor-pointer"
                  >
                    <div className="font-medium text-sm text-foreground mb-1">
                      {tool.name}
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {tool.config?.type === "webhook"
                        ? "Webhook"
                        : "Structured Output"}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {tool.description || tool.config?.description || "—"}
                    </div>
                  </div>
                  <div className="px-4 pb-3 pt-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(tool);
                      }}
                      className="w-full h-8 flex items-center justify-center gap-2 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
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
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add/Edit Tool Dialog */}
      <AddToolDialog
        isOpen={addToolDialogOpen}
        onClose={closeToolDialog}
        toolType={toolType}
        editingToolUuid={editingToolUuid}
        backendAccessToken={backendAccessToken ?? undefined}
        onToolsUpdated={setTools}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deleteTool}
        title="Delete tool"
        message={`Are you sure you want to delete "${toolToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={isToolDeleting}
      />
    </AppLayout>
  );
}
