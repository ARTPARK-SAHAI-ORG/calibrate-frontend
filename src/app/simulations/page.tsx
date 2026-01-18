"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { NewSimulationDialog } from "@/components/NewSimulationDialog";

type SimulationData = {
  uuid: string;
  name: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  created_at: string;
  updated_at: string;
};

export default function SimulationsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Set page title
  useEffect(() => {
    document.title = "Simulations | Pense";
  }, []);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [simulations, setSimulations] = useState<SimulationData[]>([]);
  const [simulationsLoading, setSimulationsLoading] = useState(true);
  const [simulationsError, setSimulationsError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [simulationToDelete, setSimulationToDelete] =
    useState<SimulationData | null>(null);
  const [isSimulationDeleting, setIsSimulationDeleting] = useState(false);

  // Navigate to simulation detail page
  const navigateToSimulation = (uuid: string) => {
    router.push(`/simulations/${uuid}`);
  };

  // Fetch simulations from backend
  useEffect(() => {
    const fetchSimulations = async () => {
      if (!backendAccessToken) return;
      
      try {
        setSimulationsLoading(true);
        setSimulationsError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/simulations`, {
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
          throw new Error("Failed to fetch simulations");
        }

        const data: SimulationData[] = await response.json();
        setSimulations(data);
      } catch (err) {
        console.error("Error fetching simulations:", err);
        setSimulationsError(
          err instanceof Error ? err.message : "Failed to load simulations"
        );
      } finally {
        setSimulationsLoading(false);
      }
    };

    fetchSimulations();
  }, [backendAccessToken]);

  // Open delete confirmation dialog
  const openDeleteDialog = (simulation: SimulationData) => {
    setSimulationToDelete(simulation);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isSimulationDeleting) {
      setDeleteDialogOpen(false);
      setSimulationToDelete(null);
    }
  };

  // Delete simulation from backend
  const deleteSimulation = async () => {
    if (!simulationToDelete) return;

    try {
      setIsSimulationDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/simulations/${simulationToDelete.uuid}`,
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
        throw new Error("Failed to delete simulation");
      }

      // Remove the simulation from local state
      setSimulations(
        simulations.filter(
          (simulation) => simulation.uuid !== simulationToDelete.uuid
        )
      );
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting simulation:", err);
    } finally {
      setIsSimulationDeleting(false);
    }
  };

  // Filter simulations based on search query
  const filteredSimulations = simulations.filter(
    (simulation) =>
      simulation.name &&
      simulation.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort simulations by updated_at
  const sortedSimulations = [...filteredSimulations].sort((a, b) => {
    const dateA = new Date(a.updated_at).getTime();
    const dateB = new Date(b.updated_at).getTime();
    // Handle invalid dates by falling back to string comparison
    if (isNaN(dateA) || isNaN(dateB)) {
      return sortOrder === "asc"
        ? (a.updated_at || "").localeCompare(b.updated_at || "")
        : (b.updated_at || "").localeCompare(a.updated_at || "");
    }
    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
  });

  // Toggle sort order
  const toggleSort = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  // Format date to display format
  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateString;
    }
  };

  return (
    <AppLayout
      activeItem="simulations"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Simulations</h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Simulate agent-user conversations and evaluate the results
            </p>
          </div>
          <button
            onClick={() => setDialogOpen(true)}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add simulation
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
            placeholder="Search simulations"
            className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        {/* Simulations List / Loading / Error / Empty State */}
        {simulationsLoading ? (
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
        ) : simulationsError ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{simulationsError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : sortedSimulations.length === 0 ? (
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
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No simulations found
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              {searchQuery
                ? "No simulations match your search"
                : "You haven't created any simulations yet"}
            </p>
            <button
              onClick={() => setDialogOpen(true)}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add simulation
            </button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Name
              </div>
              <div className="text-sm font-medium text-muted-foreground">
                <button
                  onClick={toggleSort}
                  className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
                >
                  Last updated at
                  <svg
                    className={`w-4 h-4 transition-transform ${
                      sortOrder === "asc" ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
                    />
                  </svg>
                </button>
              </div>
              <div className="w-8"></div>
            </div>
            {/* Table Rows */}
            {sortedSimulations.map((simulation) => (
              <div
                key={simulation.uuid}
                className="grid grid-cols-[1fr_1fr_auto] gap-4 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors items-center"
              >
                <Link
                  href={`/simulations/${simulation.uuid}`}
                  className="min-w-0 px-4 py-2"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {simulation.name}
                  </p>
                </Link>
                <Link
                  href={`/simulations/${simulation.uuid}`}
                  className="px-4 py-2"
                >
                  <p className="text-sm text-muted-foreground">
                    {simulation.updated_at
                      ? formatDate(simulation.updated_at)
                      : "—"}
                  </p>
                </Link>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    openDeleteDialog(simulation);
                  }}
                  className="w-8 h-8 mr-4 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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

      {/* New Simulation Dialog */}
      {dialogOpen && (
        <NewSimulationDialog
          onClose={() => setDialogOpen(false)}
          onCreateSimulation={navigateToSimulation}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deleteSimulation}
        title="Delete simulation"
        message={`Are you sure you want to delete "${simulationToDelete?.name}"?`}
        confirmText="Delete"
        isDeleting={isSimulationDeleting}
      />
    </AppLayout>
  );
}
