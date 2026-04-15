"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { sttProviders } from "@/components/agent-tabs/constants/providers";
import { formatStatus, getStatusBadgeClass } from "@/lib/status";
import { useSidebarState } from "@/lib/sidebar";
import { Dataset, getDataset } from "@/lib/datasets";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { useDatasetManagement } from "@/hooks";

type STTJob = {
  uuid: string;
  type: string;
  status: "queued" | "in_progress" | "done" | "failed";
  details: {
    audio_paths: string[];
    texts: string[];
    providers: string[];
    language: string;
  };
  dataset_id?: string | null;
  dataset_name?: string | null;
  created_at: string;
  updated_at: string;
};

// Helper function to map provider value back to label
const getProviderLabel = (value: string): string => {
  const provider = sttProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

function STTPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const backendAccessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  // Tab state – initialise from ?tab= query param
  const [activeTab, setActiveTab] = useState<"evaluations" | "datasets">(
    searchParams.get("tab") === "datasets" ? "datasets" : "evaluations",
  );

  // Evaluations state
  const [jobs, setJobs] = useState<STTJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Datasets state
  const {
    datasets,
    datasetsLoading,
    datasetsError,
    fetchDatasets,
    showCreateModal,
    setShowCreateModal,
    newDatasetName,
    setNewDatasetName,
    isCreating,
    deleteDatasetId,
    setDeleteDatasetId,
    isDeletingDataset,
    handleDeleteDataset,
    handleCreateDataset,
  } = useDatasetManagement(
    backendAccessToken,
    "stt",
    (uuid) => router.push(`/datasets/${uuid}`),
    (deletedId) =>
      setJobs((prev) =>
        prev.map((job) =>
          job.dataset_id === deletedId
            ? { ...job, dataset_id: null, dataset_name: null }
            : job,
        ),
      ),
  );

  // Set page title
  useEffect(() => {
    document.title = "Speech to Text | Calibrate";
  }, []);

  // Fetch STT jobs
  useEffect(() => {
    const fetchJobs = async () => {
      if (!backendAccessToken) return;

      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/jobs?job_type=stt`, {
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
          throw new Error("Failed to fetch STT jobs");
        }

        const data = await response.json();
        const fetchedJobs: STTJob[] = data.jobs || [];

        const datasetIds = [
          ...new Set(
            fetchedJobs
              .filter((j) => j.dataset_id)
              .map((j) => j.dataset_id!),
          ),
        ];
        const validDatasetIds = new Set<string>();
        await Promise.all(
          datasetIds.map(async (id) => {
            try {
              await getDataset(backendAccessToken, id);
              validDatasetIds.add(id);
            } catch {
              // Dataset no longer exists
            }
          }),
        );
        const validatedJobs = fetchedJobs.map((job) => {
          if (job.dataset_id && !validDatasetIds.has(job.dataset_id)) {
            return { ...job, dataset_id: null, dataset_name: null };
          }
          return job;
        });

        setJobs(validatedJobs);
      } catch (err) {
        console.error("Error fetching STT jobs:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load STT jobs",
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobs();
  }, [backendAccessToken]);

  const formatDate = (dateString: string): string => {
    try {
      const date = new Date(dateString.replace(" ", "T"));
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

  const formatLanguage = (language: string): string => {
    return language.charAt(0).toUpperCase() + language.slice(1);
  };

  // Toggle sort order
  const toggleSort = () => {
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };

  // Sort jobs by created_at
  const sortedJobs = [...jobs].sort((a, b) => {
    const dateA = new Date((a.created_at || "").replace(" ", "T")).getTime();
    const dateB = new Date((b.created_at || "").replace(" ", "T")).getTime();
    if (isNaN(dateA) || isNaN(dateB)) {
      return sortOrder === "asc"
        ? (a.created_at || "").localeCompare(b.created_at || "")
        : (b.created_at || "").localeCompare(a.created_at || "");
    }
    return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
  });

  return (
    <AppLayout
      activeItem="stt"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">
              Speech-to-Text Evaluation
            </h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
              Evaluate STT quality across multiple providers
            </p>
          </div>
          {activeTab === "evaluations" ? (
            <button
              onClick={() => router.push("/stt/new")}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
            >
              New evaluation
            </button>
          ) : (
            <button
              onClick={() => setShowCreateModal(true)}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
            >
              New dataset
            </button>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => { setActiveTab("evaluations"); router.replace("/stt", { scroll: false }); }}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === "evaluations"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Evaluations
          </button>
          <button
            onClick={() => { setActiveTab("datasets"); router.replace("/stt?tab=datasets", { scroll: false }); }}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === "datasets"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Datasets
          </button>
        </div>

        {/* Evaluations Tab */}
        {activeTab === "evaluations" && (
          <>
            {isLoading ? (
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
            ) : error ? (
              <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
                <p className="text-sm md:text-base text-red-500 mb-2">
                  {error}
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : sortedJobs.length === 0 ? (
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
                      d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
                  No evaluations yet
                </h3>
                <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center">
                  Create a new evaluation to compare STT providers
                </p>
                <button
                  onClick={() => router.push("/stt/new")}
                  className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  New evaluation
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {jobs.length} {jobs.length === 1 ? "evaluation" : "evaluations"}
                </p>
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

                {/* Desktop Table View */}
                <div className="hidden md:block border border-border rounded-xl overflow-hidden">
                  {/* Table Header */}
                  <div className="grid grid-cols-[2fr_1fr_100px_100px_80px_1fr] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                    <div className="text-sm font-medium text-muted-foreground">
                      Providers
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Dataset
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Language
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Status
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Samples
                    </div>
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
                  {sortedJobs.map((job) => (
                    <div
                      key={job.uuid}
                      onClick={() => router.push(`/stt/${job.uuid}`)}
                      className="grid grid-cols-[2fr_1fr_100px_100px_80px_1fr] gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors items-center cursor-pointer"
                    >
                      {/* Providers as pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {job.details?.providers?.map((provider) => (
                          <span
                            key={provider}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground"
                          >
                            {getProviderLabel(provider)}
                          </span>
                        )) || (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                      {/* Dataset */}
                      <div>
                        {job.dataset_id && job.dataset_name ? (
                          <Link
                            href={`/datasets/${job.dataset_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground hover:bg-muted/70 transition-colors max-w-[160px]"
                          >
                            <svg
                              className="w-3 h-3 shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                              />
                            </svg>
                            <span className="truncate">{job.dataset_name}</span>
                          </Link>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                      {/* Language */}
                      <div>
                        <span className="text-sm text-foreground">
                          {job.details?.language
                            ? formatLanguage(job.details.language)
                            : "—"}
                        </span>
                      </div>
                      {/* Status */}
                      <div>
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeClass(
                            job.status,
                          )}`}
                        >
                          {formatStatus(job.status)}
                        </span>
                      </div>
                      {/* Samples count */}
                      <div>
                        <span className="text-sm text-foreground">
                          {job.details?.texts?.length || 0}
                        </span>
                      </div>
                      {/* Created At */}
                      <p className="text-sm text-muted-foreground">
                        {job.created_at ? formatDate(job.created_at) : "—"}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {sortedJobs.map((job) => (
                    <div
                      key={job.uuid}
                      onClick={() => router.push(`/stt/${job.uuid}`)}
                      className="block border border-border rounded-xl overflow-hidden bg-background hover:shadow-lg hover:border-foreground/20 transition-all duration-200 cursor-pointer"
                    >
                      <div className="p-5">
                        {/* Header with Providers */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          {job.details?.providers?.map((provider) => (
                            <span
                              key={provider}
                              className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold bg-foreground/5 text-foreground border border-foreground/10"
                            >
                              {getProviderLabel(provider)}
                            </span>
                          )) || (
                            <span className="text-sm text-muted-foreground">
                              No providers
                            </span>
                          )}
                        </div>

                        {/* Status Badge - Prominent */}
                        <div className="mb-4">
                          <span
                            className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold ${getStatusBadgeClass(
                              job.status,
                            )}`}
                          >
                            {formatStatus(job.status)}
                          </span>
                        </div>

                        {/* Details with Icons */}
                        <div className="space-y-3">
                          {job.dataset_id && job.dataset_name && (
                            <div className="flex items-center gap-3">
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
                                    d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                                  />
                                </svg>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground mb-0.5">
                                  Dataset
                                </p>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/datasets/${job.dataset_id}`);
                                  }}
                                  className="text-sm font-medium text-foreground hover:underline cursor-pointer text-left"
                                >
                                  {job.dataset_name}
                                </button>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-3">
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
                                  d="M10.5 21l5.25-11.25L21 21m-9-3h7.5M3 5.621a48.474 48.474 0 016-.371m0 0c1.12 0 2.233.038 3.334.114M9 5.25V3m3.334 2.364C11.176 10.658 7.69 15.08 3 17.502m9.334-12.138c.896.061 1.785.147 2.666.257m-4.589 8.495a18.023 18.023 0 01-3.827-5.802"
                                />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground mb-0.5">
                                Language
                              </p>
                              <p className="text-sm font-medium text-foreground">
                                {job.details?.language
                                  ? formatLanguage(job.details.language)
                                  : "—"}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
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
                                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                                />
                              </svg>
                            </div>
                            <div className="flex-1">
                              <p className="text-xs text-muted-foreground mb-0.5">
                                Samples
                              </p>
                              <p className="text-sm font-medium text-foreground">
                                {job.details?.texts?.length || 0}
                              </p>
                            </div>
                          </div>

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
                                {job.created_at
                                  ? formatDate(job.created_at)
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Datasets Tab */}
        {activeTab === "datasets" && (
          <>
            {datasetsLoading ? (
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
            ) : datasetsError ? (
              <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
                <p className="text-sm md:text-base text-red-500 mb-2">
                  {datasetsError}
                </p>
                <button
                  onClick={fetchDatasets}
                  className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  Retry
                </button>
              </div>
            ) : datasets.length === 0 ? (
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
                      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                    />
                  </svg>
                </div>
                <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
                  No STT datasets yet
                </h3>
                <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center">
                  Create a dataset to reuse test data across evaluations
                </p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  New dataset
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  {datasets.length} {datasets.length === 1 ? "dataset" : "datasets"}
                </p>
                <div className="border border-border rounded-xl overflow-hidden">
                  {/* Table Header */}
                  <div className="hidden md:grid grid-cols-[2fr_80px_80px_1fr_40px] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                    <div className="text-sm font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Items
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Evals
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Updated
                  </div>
                  <div />
                </div>
                {datasets.map((dataset) => (
                  <div
                    key={dataset.uuid}
                    onClick={() => router.push(`/datasets/${dataset.uuid}`)}
                    className="flex flex-col md:grid md:grid-cols-[2fr_80px_80px_1fr_40px] gap-1 md:gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                  >
                    <div className="text-sm font-medium text-foreground">
                      {dataset.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {dataset.item_count}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {dataset.eval_count}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {dataset.updated_at
                        ? formatDate(dataset.updated_at)
                        : "—"}
                    </div>
                    <div className="flex justify-end">
                      <button
                        title="Delete dataset"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteDatasetId(dataset.uuid);
                        }}
                        className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                      >
                        <svg
                          className="w-3.5 h-3.5"
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
                  </div>
                ))}
              </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Delete Dataset Confirmation */}
      {deleteDatasetId && (
        <DeleteConfirmationDialog
          isOpen={true}
          onClose={() => setDeleteDatasetId(null)}
          onConfirm={() => handleDeleteDataset(deleteDatasetId)}
          title="Delete dataset"
          message={`Are you sure you want to delete "${datasets.find((d) => d.uuid === deleteDatasetId)?.name}"? The evaluations associated with this dataset will not be impacted but this action cannot be undone.`}
          isDeleting={isDeletingDataset}
        />
      )}

      {/* Create Dataset Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-xl p-6 w-full max-w-sm mx-4 shadow-xl">
            <h2 className="text-base font-semibold mb-4">New STT dataset</h2>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                Dataset name
              </label>
              <input
                type="text"
                value={newDatasetName}
                onChange={(e) => setNewDatasetName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateDataset()}
                placeholder="e.g. Hindi test set"
                autoFocus
                className="w-full h-9 px-3 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
              />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewDatasetName("");
                }}
                className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateDataset}
                disabled={!newDatasetName.trim() || isCreating}
                className="h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreating ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

export default function STTPage() {
  return (
    <Suspense fallback={null}>
      <STTPageInner />
    </Suspense>
  );
}
