"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import {
  ToolPicker,
  AvailableTool,
  getToolParams,
} from "@/components/ToolPicker";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TestRunnerDialog } from "@/components/TestRunnerDialog";
import { BenchmarkResultsDialog } from "@/components/BenchmarkResultsDialog";
import { RunTestDialog } from "@/components/RunTestDialog";
import { AddTestDialog, TestConfig } from "@/components/AddTestDialog";
import { BulkUploadTestsModal } from "@/components/BulkUploadTestsModal";
import { useSidebarState } from "@/lib/sidebar";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type Tool = {
  id: string;
  name: string;
};

type TestRunResult = {
  name?: string;
  passed: boolean | null;
  output?: Record<string, any> | null;
  test_case?: {
    name?: string;
    history?: { role: string; content: string }[];
    evaluation?: Record<string, any>;
  } | null;
};

type AllRun = {
  uuid: string;
  name: string;
  status: string;
  type: "llm-unit-test" | "llm-benchmark";
  updated_at: string;
  total_tests: number | null;
  passed: number | null;
  failed: number | null;
  results?: TestRunResult[] | null;
  model_results?: { model: string }[] | null;
  leaderboard_summary?: null;
  results_s3_prefix?: string;
  error: boolean;
  is_public: boolean;
  share_token: string | null;
  agent_id: string;
  agent_name: string;
};

function getRunDisplayName(run: AllRun): string {
  if (run.type === "llm-benchmark") {
    const modelCount = run.model_results?.length ?? 0;
    return `${modelCount} model${modelCount !== 1 ? "s" : ""}`;
  }
  const totalTests = run.total_tests ?? run.results?.length ?? 0;
  if (totalTests === 1 && run.results?.[0]) {
    const testName = run.results[0].name || run.results[0].test_case?.name;
    if (testName) return testName;
  }
  return `${totalTests} test${totalTests !== 1 ? "s" : ""}`;
}

function formatRelativeTime(dateString: string): string {
  let date: Date;
  if (dateString.endsWith("Z") || dateString.includes("+")) {
    date = new Date(dateString);
  } else {
    date = new Date(dateString.replace(" ", "T") + "Z");
  }
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return "now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} min ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return diffInDays === 1 ? "yesterday" : `${diffInDays}d ago`;
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) return `${diffInWeeks}w ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths}m ago`;
  return `${Math.floor(diffInDays / 365)}y ago`;
}

// AddTestDialog and related types have been moved to @/components/AddTestDialog

function LLMPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const backendAccessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [activeTab, setActiveTab] = useState<"tests" | "runs">(
    searchParams.get("tab") === "runs" ? "runs" : "tests"
  );
  const [searchQuery, setSearchQuery] = useState("");

  // All runs state
  const [allRuns, setAllRuns] = useState<AllRun[]>([]);
  const [allRunsLoading, setAllRunsLoading] = useState(false);
  const [runsTypeFilter, setRunsTypeFilter] = useState<"all" | "llm-unit-test" | "llm-benchmark">("all");
  const [runsAgentFilter, setRunsAgentFilter] = useState<string>("all");
  const [runsAgentDropdownOpen, setRunsAgentDropdownOpen] = useState(false);
  const runsAgentDropdownRef = useRef<HTMLDivElement>(null);
  const [runsStatusFilter, setRunsStatusFilter] = useState<"all" | "passed" | "failed" | "error">("all");

  // Viewing a run from the Runs tab
  const [selectedRun, setSelectedRun] = useState<AllRun | null>(null);
  const [viewingRunTest, setViewingRunTest] = useState(false);
  const [viewingRunBenchmark, setViewingRunBenchmark] = useState(false);

  // Set page title
  useEffect(() => {
    document.title = "Tests | Calibrate";
  }, []);
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
  const [initialTab, setInitialTab] = useState<
    "next-reply" | "tool-invocation" | undefined
  >(undefined);
  const [initialConfig, setInitialConfig] = useState<TestConfig | undefined>(
    undefined
  );

  // Selection state for bulk operations
  const [selectedTestUuids, setSelectedTestUuids] = useState<Set<string>>(
    new Set()
  );

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testToDelete, setTestToDelete] = useState<TestData | null>(null);
  const [testsToDeleteBulk, setTestsToDeleteBulk] = useState<string[]>([]);
  const [isTestDeleting, setIsTestDeleting] = useState(false);

  // Run test dialog state
  const [runTestDialogOpen, setRunTestDialogOpen] = useState(false);
  const [testToRun, setTestToRun] = useState<TestData | null>(null);

  // Test runner dialog state
  const [testRunnerOpen, setTestRunnerOpen] = useState(false);
  const [testRunnerAgentUuid, setTestRunnerAgentUuid] = useState<string>("");
  const [testRunnerAgentName, setTestRunnerAgentName] = useState<string>("");

  // Bulk upload modal state
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  const fetchTests = useCallback(async () => {
    if (!backendAccessToken) return;

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
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

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
  }, [backendAccessToken]);

  useEffect(() => {
    fetchTests();
  }, [fetchTests]);

  // Fetch all runs when Runs tab is activated
  useEffect(() => {
    if (activeTab !== "runs" || !backendAccessToken) return;
    const fetchAllRuns = async () => {
      try {
        setAllRunsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("BACKEND_URL not set");
        const response = await fetch(`${backendUrl}/agent-tests/runs`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });
        if (response.status === 401) { await signOut({ callbackUrl: "/login" }); return; }
        if (!response.ok) throw new Error("Failed to fetch runs");
        const data = await response.json();
        setAllRuns(data.runs || []);
      } catch (err) {
        console.error("Error fetching all runs:", err);
      } finally {
        setAllRunsLoading(false);
      }
    };
    fetchAllRuns();
  }, [activeTab, backendAccessToken]);

  const handleRunClick = (run: AllRun) => {
    setSelectedRun(run);
    if (run.type === "llm-unit-test") {
      setViewingRunTest(true);
    } else {
      setViewingRunBenchmark(true);
    }
  };

  const toggleTestSelection = (uuid: string) => {
    setSelectedTestUuids((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(uuid)) {
        newSet.delete(uuid);
      } else {
        newSet.add(uuid);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedTestUuids.size === filteredTests.length) {
      setSelectedTestUuids(new Set());
    } else {
      setSelectedTestUuids(new Set(filteredTests.map((t) => t.uuid)));
    }
  };

  // Open delete confirmation dialog (single)
  const openDeleteDialog = (test: TestData) => {
    setTestToDelete(test);
    setTestsToDeleteBulk([]);
    setDeleteDialogOpen(true);
  };

  // Open bulk delete confirmation dialog
  const openBulkDeleteDialog = () => {
    if (selectedTestUuids.size === 0) return;
    setTestToDelete(null);
    setTestsToDeleteBulk(Array.from(selectedTestUuids));
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isTestDeleting) {
      setDeleteDialogOpen(false);
      setTestToDelete(null);
      setTestsToDeleteBulk([]);
    }
  };

  // Delete test(s) from backend
  const deleteTest = async () => {
    const uuidsToDelete =
      testsToDeleteBulk.length > 0
        ? testsToDeleteBulk
        : testToDelete
        ? [testToDelete.uuid]
        : [];
    if (uuidsToDelete.length === 0) return;

    try {
      setIsTestDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      for (const uuid of uuidsToDelete) {
        const response = await fetch(`${backendUrl}/tests/${uuid}`, {
          method: "DELETE",
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
          throw new Error("Failed to delete test");
        }
      }

      const deletedSet = new Set(uuidsToDelete);
      setTests((prev) => prev.filter((t) => !deletedSet.has(t.uuid)));
      setSelectedTestUuids(new Set());
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting test(s):", err);
    } finally {
      setIsTestDeleting(false);
    }
  };

  // Open run test dialog
  const openRunTestDialog = (test: TestData) => {
    setTestToRun(test);
    setRunTestDialogOpen(true);
  };

  // Handle running the test
  const handleRunTest = async (
    agentUuid: string,
    agentName: string,
    attachToAgent: boolean
  ) => {
    if (!testToRun) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // If attachToAgent is true, attach the test to the agent
      if (attachToAgent) {
        const response = await fetch(`${backendUrl}/agent-tests`, {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            agent_uuid: agentUuid,
            test_uuids: [testToRun.uuid],
          }),
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          console.error("Failed to attach test to agent");
        }
      }

      // Close the run test selection dialog
      setRunTestDialogOpen(false);

      // Open the TestRunnerDialog with the agent and test
      setTestRunnerAgentUuid(agentUuid);
      setTestRunnerAgentName(agentName);
      setTestRunnerOpen(true);
    } catch (err) {
      console.error("Error running test:", err);
      setRunTestDialogOpen(false);
      setTestToRun(null);
    }
  };

  // Create test via POST API
  const createTest = async (config: TestConfig) => {
    setValidationAttempted(true);
    if (!newTestName.trim()) return;

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
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: newTestName.trim(),
          type: config.evaluation.type,
          config: config,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to create test");
      }

      // Refetch the tests list to get the updated data
      const testsResponse = await fetch(`${backendUrl}/tests`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
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
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch test details");
      }

      const testData: TestData = await response.json();

      // Populate form fields with test data
      setNewTestName(testData.name || "");
      setNewTestDescription(
        testData.config?.description || testData.description || ""
      );
      // Set initial tab based on test type
      setInitialTab(
        testData.type === "tool_call" ? "tool-invocation" : "next-reply"
      );
      // Set initial config to populate dialog fields
      if (testData.config) {
        setInitialConfig(testData.config as TestConfig);
      }
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
  const updateTest = async (config: TestConfig) => {
    setValidationAttempted(true);
    if (!newTestName.trim() || !editingTestUuid) return;

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
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          name: newTestName.trim(),
          type: config.evaluation.type,
          config: config,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update test");
      }

      // Refetch the tests list to get the updated data
      const testsResponse = await fetch(`${backendUrl}/tests`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
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
    setInitialTab(undefined);
    setInitialConfig(undefined);
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
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">
              LLM Evaluation
            </h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
              Create and manage tests to evaluate your LLM
            </p>
          </div>
          {activeTab === "tests" && (
            <div className="flex items-center gap-2">
              {selectedTestUuids.size > 0 && (
                <button
                  onClick={openBulkDeleteDialog}
                  className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-red-500 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0"
                >
                  Delete selected ({selectedTestUuids.size})
                </button>
              )}
              <button
                onClick={() => setBulkUploadOpen(true)}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background text-foreground hover:bg-muted/50 transition-colors cursor-pointer flex-shrink-0"
              >
                Bulk upload
              </button>
              <button
                onClick={() => {
                  resetForm();
                  setAddTestSidebarOpen(true);
                }}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
              >
                Add test
              </button>
            </div>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 border-b border-border">
          <button
            onClick={() => { setActiveTab("tests"); router.replace("/tests", { scroll: false }); }}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === "tests"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Tests
          </button>
          <button
            onClick={() => { setActiveTab("runs"); router.replace("/tests?tab=runs", { scroll: false }); }}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-b-2 -mb-px ${
              activeTab === "runs"
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Runs
          </button>
        </div>

        {/* ── TESTS TAB ── */}
        {activeTab === "tests" && <>

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
            className="w-full h-9 md:h-10 pl-10 pr-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

        {tests.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {tests.length} {tests.length === 1 ? "test" : "tests"}
          </p>
        )}

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
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-sm md:text-base text-red-500 mb-2">
              {testsError}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
              <svg
                className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M9 3h6v2h-1v4.5l4.5 7.5c.5.83.5 1.5-.17 2.17-.67.67-1.34.83-2.33.83H8c-1 0-1.67-.17-2.33-.83-.67-.67-.67-1.34-.17-2.17L10 9.5V5H9V3zm3 8.5L8.5 17h7L12 11.5z" />
              </svg>
            </div>
            <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
              No tests found
            </h3>
            <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center">
              {searchQuery
                ? "No tests match your search"
                : "You haven't created any tests yet"}
            </p>
            <button
              onClick={() => {
                resetForm();
                setAddTestSidebarOpen(true);
              }}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add test
            </button>
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block border border-border rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[40px_1fr_1fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                      selectedTestUuids.size === filteredTests.length &&
                      filteredTests.length > 0
                        ? "bg-foreground border-foreground"
                        : "border-border hover:border-muted-foreground"
                    }`}
                    title="Select all"
                  >
                    {selectedTestUuids.size === filteredTests.length &&
                      filteredTests.length > 0 && (
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
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Name
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Type
                </div>
                <div className="w-16"></div>
              </div>
              {/* Table Rows */}
              {filteredTests.map((test) => (
                <div
                  key={test.uuid}
                  onClick={() => openEditTest(test.uuid)}
                  className="grid grid-cols-[40px_1fr_1fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTestSelection(test.uuid);
                      }}
                      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                        selectedTestUuids.has(test.uuid)
                          ? "bg-foreground border-foreground"
                          : "border-border hover:border-muted-foreground"
                      }`}
                      title="Select test"
                    >
                      {selectedTestUuids.has(test.uuid) && (
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
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {test.name}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {test.type === "response"
                      ? "Next Reply"
                      : test.type === "tool_call"
                      ? "Tool Call"
                      : "—"}
                  </p>
                  <div className="flex items-center gap-1">
                    {/* Play Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openRunTestDialog(test);
                      }}
                      className="group relative w-8 h-8 flex items-center justify-center rounded-lg bg-foreground/90 text-background hover:bg-foreground transition-colors cursor-pointer"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                        <span className="px-3 py-1.5 text-sm font-medium text-gray-900 bg-white rounded-full whitespace-nowrap shadow-lg">
                          Run this test
                        </span>
                        {/* Arrow */}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white"></div>
                      </div>
                    </button>
                    {/* Delete Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(test);
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
                </div>
              ))}
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-3">
              {filteredTests.map((test) => (
                <div
                  key={test.uuid}
                  className="border border-border rounded-lg overflow-hidden bg-background"
                >
                  <div
                    onClick={() => openEditTest(test.uuid)}
                    className="p-4 cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleTestSelection(test.uuid);
                        }}
                        className={`w-5 h-5 mt-0.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors cursor-pointer ${
                          selectedTestUuids.has(test.uuid)
                            ? "bg-foreground border-foreground"
                            : "border-border hover:border-muted-foreground"
                        }`}
                        title="Select test"
                      >
                        {selectedTestUuids.has(test.uuid) && (
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
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground mb-1">
                          {test.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {test.type === "response"
                            ? "Next Reply"
                            : test.type === "tool_call"
                            ? "Tool Call"
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 px-4 pb-3 pt-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openRunTestDialog(test);
                      }}
                      className="flex-1 h-8 flex items-center justify-center gap-2 rounded-md text-xs font-medium text-background bg-foreground hover:opacity-90 transition-opacity"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Run test
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(test);
                      }}
                      className="flex-1 h-8 flex items-center justify-center gap-2 rounded-md text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 transition-colors"
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

        </> /* end Tests tab */}

        {/* ── RUNS TAB ── */}
        {activeTab === "runs" && (
          <>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Type filter */}
              <div className="flex gap-1.5">
                {(["all", "llm-unit-test", "llm-benchmark"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRunsTypeFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      runsTypeFilter === f
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? "All types" : f === "llm-unit-test" ? "Tests" : "Benchmarks"}
                  </button>
                ))}
              </div>

              {/* Status filter */}
              <div className="flex gap-1.5">
                {(["all", "passed", "failed", "error"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRunsStatusFilter(f)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
                      runsStatusFilter === f
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f === "all" ? "All results" : f === "passed" ? "All passed" : f === "failed" ? "All failed" : "Error"}
                  </button>
                ))}
              </div>

              {/* Agent filter */}
              {allRuns.length > 0 && (() => {
                const agents = Array.from(new Map(allRuns.map((r) => [r.agent_id, r.agent_name])).entries());
                if (agents.length <= 1) return null;
                const selectedLabel = runsAgentFilter === "all"
                  ? "All agents"
                  : (agents.find(([id]) => id === runsAgentFilter)?.[1] ?? "All agents");
                return (
                  <div ref={runsAgentDropdownRef} className="relative">
                    <button
                      onClick={() => setRunsAgentDropdownOpen((o) => !o)}
                      className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 text-xs font-medium rounded-md border border-border bg-background text-foreground hover:border-muted-foreground transition-colors cursor-pointer"
                    >
                      {selectedLabel}
                      <svg
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${runsAgentDropdownOpen ? "rotate-180" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>

                    {runsAgentDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-[99]" onClick={() => setRunsAgentDropdownOpen(false)} />
                        <div className="absolute left-0 top-full mt-1.5 bg-background border border-border rounded-xl shadow-xl z-[100] overflow-hidden min-w-[160px]">
                          {([["all", "All agents"], ...agents] as [string, string][]).map(([id, name]) => (
                            <button
                              key={id}
                              onClick={() => { setRunsAgentFilter(id); setRunsAgentDropdownOpen(false); }}
                              className={`w-full px-3.5 py-2 text-left text-xs transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                                runsAgentFilter === id ? "bg-accent text-foreground" : "text-foreground hover:bg-muted"
                              }`}
                            >
                              <span className="truncate">{name}</span>
                              {runsAgentFilter === id && (
                                <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}
            </div>

            {allRunsLoading ? (
              <div className="flex items-center justify-center gap-3 py-8">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
            ) : (() => {
              const isRunning = (r: AllRun) =>
                r.status === "pending" || r.status === "queued" || r.status === "in_progress";
              const isError = (r: AllRun) => r.status === "failed" || r.error;
              const isDone = (r: AllRun) => r.status === "done" && !r.error;
              const isAllPassed = (r: AllRun) => isDone(r) && (r.failed === null || r.failed === 0);
              const isAllFailed = (r: AllRun) => isDone(r) && r.failed !== null && r.failed > 0;

              const filtered = allRuns.filter((r) => {
                if (runsTypeFilter !== "all" && r.type !== runsTypeFilter) return false;
                if (runsAgentFilter !== "all" && r.agent_id !== runsAgentFilter) return false;
                if (runsStatusFilter === "passed" && (!isAllPassed(r) || isRunning(r))) return false;
                if (runsStatusFilter === "failed" && (!isAllFailed(r) || isRunning(r))) return false;
                if (runsStatusFilter === "error" && !isError(r)) return false;
                return true;
              });
              if (filtered.length === 0) {
                return (
                  <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
                      <svg className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 3h6v2h-1v4.5l4.5 7.5c.5.83.5 1.5-.17 2.17-.67.67-1.34.83-2.33.83H8c-1 0-1.67-.17-2.33-.83-.67-.67-.67-1.34-.17-2.17L10 9.5V5H9V3zm3 8.5L8.5 17h7L12 11.5z" />
                      </svg>
                    </div>
                    <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">No runs yet</h3>
                    <p className="text-sm md:text-base text-muted-foreground text-center">
                      {(runsTypeFilter !== "all" || runsAgentFilter !== "all" || runsStatusFilter !== "all")
                        ? "No runs match the selected filters"
                        : "Run tests from an agent to see results here"}
                    </p>
                  </div>
                );
              }
              return (
                <>
                  <p className="text-sm text-muted-foreground">
                    {filtered.length} {filtered.length === 1 ? "run" : "runs"}
                  </p>

                  {/* Desktop Table */}
                  <div className="hidden md:block border border-border rounded-xl overflow-hidden">
                    <div className="grid grid-cols-[1fr_1fr_120px_140px_120px] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                      <div className="text-sm font-medium text-muted-foreground">Name</div>
                      <div className="text-sm font-medium text-muted-foreground">Agent</div>
                      <div className="text-sm font-medium text-muted-foreground">Type</div>
                      <div className="text-sm font-medium text-muted-foreground">Result</div>
                      <div className="text-sm font-medium text-muted-foreground">Updated</div>
                    </div>
                    {filtered.map((run) => (
                      <div
                        key={run.uuid}
                        onClick={() => handleRunClick(run)}
                        className="grid grid-cols-[1fr_1fr_120px_140px_120px] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{run.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{getRunDisplayName(run)}</p>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{run.agent_name}</p>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium w-fit ${
                          run.type === "llm-unit-test"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-purple-500/20 text-purple-400"
                        }`}>
                          {run.type === "llm-unit-test" ? "Test" : "Benchmark"}
                        </span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {run.status === "pending" || run.status === "queued" || run.status === "in_progress" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-500">
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                              </svg>
                              Running
                            </span>
                          ) : run.status === "failed" || run.error ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-500">Error</span>
                          ) : run.type === "llm-unit-test" ? (
                            <>
                              {run.passed !== null && run.passed > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-500">{run.passed} Pass</span>
                              )}
                              {run.failed !== null && run.failed > 0 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-500">{run.failed} Fail</span>
                              )}
                            </>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-500">Complete</span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{formatRelativeTime(run.updated_at)}</p>
                      </div>
                    ))}
                  </div>

                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3">
                    {filtered.map((run) => (
                      <div
                        key={run.uuid}
                        onClick={() => handleRunClick(run)}
                        className="border border-border rounded-xl p-4 bg-background hover:shadow-lg hover:border-foreground/20 transition-all duration-200 cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{run.name}</p>
                            <p className="text-xs text-muted-foreground truncate">{run.agent_name}</p>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                            run.type === "llm-unit-test" ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"
                          }`}>
                            {run.type === "llm-unit-test" ? "Test" : "Benchmark"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {run.status === "pending" || run.status === "queued" || run.status === "in_progress" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-500">
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Running
                              </span>
                            ) : run.status === "failed" || run.error ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-500">Error</span>
                            ) : run.type === "llm-unit-test" ? (
                              <>
                                {run.passed !== null && run.passed > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-500">{run.passed} Pass</span>
                                )}
                                {run.failed !== null && run.failed > 0 && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/20 text-red-500">{run.failed} Fail</span>
                                )}
                              </>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-500">Complete</span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatRelativeTime(run.updated_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
          </>
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
          initialTab={initialTab}
          initialConfig={initialConfig}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen}
        onClose={closeDeleteDialog}
        onConfirm={deleteTest}
        title={testsToDeleteBulk.length > 0 ? "Delete tests" : "Delete test"}
        message={
          testsToDeleteBulk.length > 0
            ? `Are you sure you want to delete ${testsToDeleteBulk.length} test${testsToDeleteBulk.length > 1 ? "s" : ""}?`
            : `Are you sure you want to delete "${testToDelete?.name}"?`
        }
        confirmText="Delete"
        isDeleting={isTestDeleting}
      />

      {/* Run Test Dialog */}
      <RunTestDialog
        isOpen={runTestDialogOpen}
        onClose={() => {
          setRunTestDialogOpen(false);
          setTestToRun(null);
        }}
        testName={testToRun?.name || ""}
        testUuid={testToRun?.uuid || ""}
        onRunTest={handleRunTest}
      />

      {/* Test Runner Dialog */}
      <TestRunnerDialog
        isOpen={testRunnerOpen}
        onClose={() => {
          setTestRunnerOpen(false);
          setTestToRun(null);
        }}
        agentUuid={testRunnerAgentUuid}
        agentName={testRunnerAgentName}
        tests={testToRun ? [testToRun] : []}
      />

      {/* Bulk Upload Modal */}
      <BulkUploadTestsModal
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={fetchTests}
      />

      {/* View Run — Test Runner Dialog (from Runs tab) */}
      {selectedRun && selectedRun.type === "llm-unit-test" && (
        <TestRunnerDialog
          isOpen={viewingRunTest}
          onClose={() => {
            setViewingRunTest(false);
            setSelectedRun(null);
          }}
          agentUuid={selectedRun.agent_id}
          agentName={selectedRun.agent_name}
          tests={
            selectedRun.results?.map((r, i) => ({
              uuid: `run-test-${i}`,
              name: r.name || r.test_case?.name || `Test ${i + 1}`,
              description: "",
              type: "response" as const,
              config: {},
              created_at: "",
              updated_at: "",
            })) || []
          }
          taskId={selectedRun.uuid}
          initialRunStatus={selectedRun.status}
        />
      )}

      {/* View Run — Benchmark Results Dialog (from Runs tab) */}
      {selectedRun && selectedRun.type === "llm-benchmark" && (
        <BenchmarkResultsDialog
          isOpen={viewingRunBenchmark}
          onClose={() => {
            setViewingRunBenchmark(false);
            setSelectedRun(null);
          }}
          agentUuid={selectedRun.agent_id}
          agentName={selectedRun.agent_name}
          testUuids={[]}
          testNames={[]}
          models={[]}
          taskId={selectedRun.uuid}
        />
      )}
    </AppLayout>
  );
}

export default function LLMPage() {
  return (
    <Suspense>
      <LLMPageInner />
    </Suspense>
  );
}
