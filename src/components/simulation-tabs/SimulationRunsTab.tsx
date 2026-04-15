"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { formatStatus, getStatusBadgeClass } from "@/lib/status";

type Run = {
  uuid: string;
  name: string;
  status: string;
  type: "text" | "audio";
  created_at?: string;
  updated_at?: string;
};

type SimulationRunsTabProps = {
  simulationUuid: string;
};

export function SimulationRunsTab({ simulationUuid }: SimulationRunsTabProps) {
  const backendAccessToken = useAccessToken();
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    if (!backendAccessToken) return;

    const fetchRuns = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/simulations/${simulationUuid}/runs`,
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
          throw new Error("Failed to fetch runs");
        }

        const data = await response.json();
        setRuns(data.runs || []);
      } catch (err) {
        console.error("Error fetching runs:", err);
        setError(err instanceof Error ? err.message : "Failed to load runs");
      } finally {
        setIsLoading(false);
      }
    };

    fetchRuns();
  }, [simulationUuid, backendAccessToken]);

  const getTypeBadgeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "text":
        return "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400";
      case "audio":
      case "voice":
        return "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400";
      default:
        return "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400";
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-3 py-8">
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
    );
  }

  if (error) {
    return (
      <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
        <p className="text-base text-red-500 mb-2">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
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
        <h3 className="text-lg font-medium text-foreground mb-2">
          No runs yet
        </h3>
        <p className="text-base text-muted-foreground text-center max-w-md">
          Launch the simulation to see its runs here
        </p>
      </div>
    );
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    const date = new Date(dateString.replace(" ", "T"));
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Toggle sort order
  const toggleSort = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  // Sort runs by created_at (fallback to updated_at if not available)
  const sortedRuns = [...runs].sort((a, b) => {
    const dateStrA = a.created_at || a.updated_at || "";
    const dateStrB = b.created_at || b.updated_at || "";
    const dateA = dateStrA ? new Date(dateStrA.replace(" ", "T")).getTime() : 0;
    const dateB = dateStrB ? new Date(dateStrB.replace(" ", "T")).getTime() : 0;
    // Handle invalid dates by falling back to string comparison
    if (isNaN(dateA) || isNaN(dateB)) {
      return sortOrder === "asc"
        ? dateStrA.localeCompare(dateStrB)
        : dateStrB.localeCompare(dateStrA);
    }
    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
  });

  return (
    <>
      {/* Mobile Sort Button */}
      <div className="flex justify-end md:hidden mb-3">
        <button
          onClick={toggleSort}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
        >
          Sort by date
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

      <p className="text-sm text-muted-foreground mb-3">
        {runs.length} {runs.length === 1 ? "run" : "runs"}
      </p>

      {/* Desktop Table View */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 px-4 py-2 border-b border-border bg-muted/30">
          <div className="text-sm font-medium text-muted-foreground">Name</div>
          <div className="text-sm font-medium text-muted-foreground">
            Status
          </div>
          <div className="text-sm font-medium text-muted-foreground">Type</div>
          <div className="text-sm font-medium text-muted-foreground">
            <button
              onClick={toggleSort}
              className="flex items-center gap-2 hover:text-foreground transition-colors cursor-pointer"
            >
              Created At
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
        </div>
        {/* Table Rows */}
        {sortedRuns.map((run) => (
          <Link
            key={run.uuid}
            href={`/simulations/${simulationUuid}/runs/${run.uuid}`}
            className="grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors items-center"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">
                {run.name}
              </p>
            </div>
            <div>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeClass(
                  run.status
                )}`}
              >
                {formatStatus(run.status)}
              </span>
            </div>
            <div>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getTypeBadgeClass(
                  run.type
                )}`}
              >
                {run.type}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(run.created_at || run.updated_at || "")}
            </p>
          </Link>
        ))}
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {sortedRuns.map((run) => (
          <Link
            key={run.uuid}
            href={`/simulations/${simulationUuid}/runs/${run.uuid}`}
            className="block border border-border rounded-xl overflow-hidden bg-background hover:shadow-lg hover:border-foreground/20 transition-all duration-200"
          >
            <div className="p-5">
              {/* Name */}
              <div className="font-medium text-sm text-foreground mb-3">
                {run.name}
              </div>

              {/* Status and Type Pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${getStatusBadgeClass(
                    run.status
                  )}`}
                >
                  {formatStatus(run.status)}
                </span>
                <span
                  className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${getTypeBadgeClass(
                    run.type
                  )}`}
                >
                  {run.type}
                </span>
              </div>

              {/* Created date with icon */}
              <div className="flex items-center gap-3 pt-2 border-t border-border/50">
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
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
                      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Created
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {formatDate(run.created_at || run.updated_at || "")}
                  </p>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
