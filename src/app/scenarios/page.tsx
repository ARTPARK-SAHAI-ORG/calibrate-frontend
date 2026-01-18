"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

type ScenarioData = {
  uuid: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
};

const DEFAULT_DESCRIPTION = `Call to inquire about crop insurance schemes available for paddy farmers. Ask about the eligibility criteria, premium amounts, and the claim process. Request information about government subsidies for small-scale farmers in Karnataka.`;

export default function ScenariosPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [addScenarioSidebarOpen, setAddScenarioSidebarOpen] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Scenarios | Pense";
  }, []);
  const [scenarios, setScenarios] = useState<ScenarioData[]>([]);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [scenariosError, setScenariosError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingScenarioUuid, setEditingScenarioUuid] = useState<string | null>(
    null
  );
  const [isLoadingScenario, setIsLoadingScenario] = useState(false);
  const [validationAttempted, setValidationAttempted] = useState(false);

  // Form fields
  const [scenarioLabel, setScenarioLabel] = useState("");
  const [scenarioDescription, setScenarioDescription] =
    useState(DEFAULT_DESCRIPTION);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [scenarioToDelete, setScenarioToDelete] = useState<ScenarioData | null>(
    null
  );
  const [isScenarioDeleting, setIsScenarioDeleting] = useState(false);

  // Fetch scenarios from backend
  useEffect(() => {
    const fetchScenarios = async () => {
      if (!backendAccessToken) return;

      try {
        setScenariosLoading(true);
        setScenariosError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/scenarios`, {
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
          throw new Error("Failed to fetch scenarios");
        }

        const data: ScenarioData[] = await response.json();
        setScenarios(data);
      } catch (err) {
        console.error("Error fetching scenarios:", err);
        setScenariosError(
          err instanceof Error ? err.message : "Failed to load scenarios"
        );
      } finally {
        setScenariosLoading(false);
      }
    };

    fetchScenarios();
  }, [backendAccessToken]);

  // Open delete confirmation dialog
  const openDeleteDialog = (scenario: ScenarioData) => {
    setScenarioToDelete(scenario);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isScenarioDeleting) {
      setDeleteDialogOpen(false);
      setScenarioToDelete(null);
    }
  };

  // Delete scenario from backend
  const deleteScenario = async () => {
    if (!scenarioToDelete) return;

    try {
      setIsScenarioDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/scenarios/${scenarioToDelete.uuid}`,
        {
          method: "DELETE",
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
        throw new Error("Failed to delete scenario");
      }

      // Remove the scenario from local state
      setScenarios(
        scenarios.filter((scenario) => scenario.uuid !== scenarioToDelete.uuid)
      );
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting scenario:", err);
    } finally {
      setIsScenarioDeleting(false);
    }
  };

  // Reset form fields
  const resetForm = () => {
    setScenarioLabel("");
    setScenarioDescription(DEFAULT_DESCRIPTION);
    setEditingScenarioUuid(null);
    setCreateError(null);
    setValidationAttempted(false);
  };

  // Create scenario via POST API
  const createScenario = async () => {
    setValidationAttempted(true);
    if (!scenarioLabel.trim() || !scenarioDescription.trim()) return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/scenarios`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: scenarioLabel.trim(),
          description: scenarioDescription.trim(),
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create scenario");
      }

      // Refetch the scenarios list to get the updated data
      const scenariosResponse = await fetch(`${backendUrl}/scenarios`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (scenariosResponse.ok) {
        const updatedScenarios: ScenarioData[] = await scenariosResponse.json();
        setScenarios(updatedScenarios);
      }

      // Reset form fields and close sidebar
      resetForm();
      setAddScenarioSidebarOpen(false);
    } catch (err) {
      console.error("Error creating scenario:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create scenario"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Fetch scenario details by UUID and open edit sidebar
  const openEditScenario = async (uuid: string) => {
    try {
      setIsLoadingScenario(true);
      setEditingScenarioUuid(uuid);
      setAddScenarioSidebarOpen(true);
      setCreateError(null);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/scenarios/${uuid}`, {
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
        throw new Error("Failed to fetch scenario details");
      }

      const scenarioData: ScenarioData = await response.json();

      // Populate form fields with scenario data
      setScenarioLabel(scenarioData.name || "");
      setScenarioDescription(scenarioData.description || DEFAULT_DESCRIPTION);
    } catch (err) {
      console.error("Error fetching scenario:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load scenario"
      );
    } finally {
      setIsLoadingScenario(false);
    }
  };

  // Update existing scenario via PUT API
  const updateScenario = async () => {
    setValidationAttempted(true);
    if (
      !scenarioLabel.trim() ||
      !scenarioDescription.trim() ||
      !editingScenarioUuid
    )
      return;

    try {
      setIsCreating(true);
      setCreateError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/scenarios/${editingScenarioUuid}`,
        {
          method: "PUT",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            name: scenarioLabel.trim(),
            description: scenarioDescription.trim(),
          }),
        }
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update scenario");
      }

      // Refetch the scenarios list to get the updated data
      const scenariosResponse = await fetch(`${backendUrl}/scenarios`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (scenariosResponse.ok) {
        const updatedScenarios: ScenarioData[] = await scenariosResponse.json();
        setScenarios(updatedScenarios);
      }

      // Reset and close
      resetForm();
      setAddScenarioSidebarOpen(false);
    } catch (err) {
      console.error("Error updating scenario:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update scenario"
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Filter scenarios based on search query
  const filteredScenarios = scenarios.filter(
    (scenario) =>
      (scenario.name &&
        scenario.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (scenario.description &&
        scenario.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <AppLayout
      activeItem="scenarios"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Scenarios</h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Scenarios define the specific task or conversation goal for the
              simulation
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setAddScenarioSidebarOpen(true);
            }}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add scenario
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
            placeholder="Search scenarios"
            className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        {/* Scenarios List / Loading / Error / Empty State */}
        {scenariosLoading ? (
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
        ) : scenariosError ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{scenariosError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredScenarios.length === 0 ? (
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
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No scenarios found
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              {searchQuery
                ? "No scenarios match your search"
                : "You haven't created any scenarios yet"}
            </p>
            <button
              onClick={() => {
                resetForm();
                setAddScenarioSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add scenario
            </button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[200px_1fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Label
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                Description
              </div>
              <div className="w-8"></div>
            </div>
            {/* Table Rows */}
            {filteredScenarios.map((scenario) => (
              <div
                key={scenario.uuid}
                onClick={() => openEditScenario(scenario.uuid)}
                className="grid grid-cols-[200px_1fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              >
                <div className="overflow-x-auto max-w-full">
                  <p className="text-sm font-medium text-foreground whitespace-nowrap">
                    {scenario.name}
                  </p>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {scenario.description || "—"}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteDialog(scenario);
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
        )}
      </div>

      {/* Add/Edit Scenario Sidebar */}
      {addScenarioSidebarOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => {
              resetForm();
              setAddScenarioSidebarOpen(false);
            }}
          />
          {/* Sidebar */}
          <div className="relative w-[40%] min-w-[500px] bg-background border-l border-border flex flex-col h-full shadow-2xl">
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
                    d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  />
                </svg>
                <h2 className="text-lg font-semibold">
                  {editingScenarioUuid ? "Edit scenario" : "Add scenario"}
                </h2>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setAddScenarioSidebarOpen(false);
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
              {isLoadingScenario ? (
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
                  {/* Form Fields */}
                  <div className="space-y-5">
                    {/* Label */}
                    <div>
                      <label className="block text-sm font-medium mb-2">
                        Label <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={scenarioLabel}
                        onChange={(e) => setScenarioLabel(e.target.value)}
                        placeholder="e.g., Crop Insurance Inquiry"
                        className={`w-full h-10 px-4 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                          validationAttempted && !scenarioLabel.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <p className="text-sm text-muted-foreground mb-2">
                        Define WHAT the persona should do (e.g., &quot;Call to
                        get a refund&quot;, &quot;Ask for PTO&quot;,
                        &quot;Inquire about balance&quot;). Use{" "}
                        <span className="text-white">Personas</span> to define
                        HOW to behave.
                      </p>
                      <textarea
                        value={scenarioDescription}
                        onChange={(e) => setScenarioDescription(e.target.value)}
                        rows={8}
                        className={`w-full px-4 py-3 rounded-md text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none ${
                          validationAttempted && !scenarioDescription.trim()
                            ? "border-red-500"
                            : "border-border"
                        }`}
                      />
                    </div>
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
                    setAddScenarioSidebarOpen(false);
                  }}
                  disabled={isCreating || isLoadingScenario}
                  className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={
                    editingScenarioUuid ? updateScenario : createScenario
                  }
                  disabled={isCreating || isLoadingScenario}
                  className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                      {editingScenarioUuid ? "Saving..." : "Creating..."}
                    </>
                  ) : editingScenarioUuid ? (
                    "Save"
                  ) : (
                    "Add scenario"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deleteScenario}
        title="Delete scenario"
        message={`Are you sure you want to delete "${scenarioToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={isScenarioDeleting}
      />
    </AppLayout>
  );
}
