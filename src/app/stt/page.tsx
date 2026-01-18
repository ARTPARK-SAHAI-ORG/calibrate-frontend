"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { sttProviders } from "@/components/agent-tabs/constants/providers";
import { formatStatus, getStatusBadgeClass } from "@/lib/status";

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
  created_at: string;
  updated_at: string;
};

// Helper function to map provider value back to label
const getProviderLabel = (value: string): string => {
  const provider = sttProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

export default function STTPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [jobs, setJobs] = useState<STTJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

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
        setJobs(data.jobs || []);
      } catch (err) {
        console.error("Error fetching STT jobs:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load STT jobs"
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

  // Sort jobs by updated_at
  const sortedJobs = [...jobs].sort((a, b) => {
    const dateA = new Date(
      (a.updated_at || a.created_at || "").replace(" ", "T")
    ).getTime();
    const dateB = new Date(
      (b.updated_at || b.created_at || "").replace(" ", "T")
    ).getTime();
    if (isNaN(dateA) || isNaN(dateB)) {
      return sortOrder === "asc"
        ? (a.updated_at || "").localeCompare(b.updated_at || "")
        : (b.updated_at || "").localeCompare(a.updated_at || "");
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              Speech-to-Text Evaluation
            </h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Evaluate STT quality across multiple providers
            </p>
          </div>
          <button
            onClick={() => router.push("/stt/new")}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            New STT evaluation
          </button>
        </div>

        {/* Jobs List / Loading / Error / Empty State */}
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
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : sortedJobs.length === 0 ? (
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
                  d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">
              No evaluations yet
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              Create a new evaluation to compare STT providers
            </p>
            <button
              onClick={() => router.push("/stt/new")}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              New STT evaluation
            </button>
          </div>
        ) : (
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-[2fr_100px_100px_80px_1fr] gap-4 px-4 py-2 border-b border-border bg-muted/30">
              <div className="text-sm font-medium text-muted-foreground">
                Providers
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
                  Updated At
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
              <Link
                key={job.uuid}
                href={`/stt/${job.uuid}`}
                className="grid grid-cols-[2fr_100px_100px_80px_1fr] gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors items-center"
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
                    <span className="text-sm text-muted-foreground">—</span>
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
                      job.status
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
                {/* Updated At */}
                <p className="text-sm text-muted-foreground">
                  {job.updated_at || job.created_at
                    ? formatDate(job.updated_at || job.created_at)
                    : "—"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
