"use client";
import { reportError } from "@/lib/reportError";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "next-auth/react";
import {
  useAccessToken,
  useMaxRowsPerEval,
  useDialogUrlParam,
  useVerifyConnection,
  useStartTestRun,
} from "@/hooks";
import { getDefaultHeaders, unwrapList } from "@/lib/api";
import { buildTestToRun } from "@/lib/testRun";

import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TestRunnerDialog } from "@/components/TestRunnerDialog";
import { VerifyToRunDialog } from "@/components/VerifyToRunDialog";
import { BenchmarkDialog } from "@/components/BenchmarkDialog";
import { BenchmarkResultsDialog } from "@/components/BenchmarkResultsDialog";
import {
  BenchmarkRerunDialog,
  useBenchmarkRerun,
} from "@/components/BenchmarkRerunDialog";
import {
  makeOptimisticTestRun,
  makeOptimisticBenchmarkRun,
} from "@/lib/optimisticRuns";
import { CompareModelsButton } from "@/components/agent-tabs/CompareModelsButton";
import {
  AddTestDialog,
  TestConfig,
  EvaluatorRefPayload,
  AttachedEvaluatorInit,
  EvaluatorVariableDef,
} from "@/components/AddTestDialog";
import { BulkUploadTestsModal } from "@/components/BulkUploadTestsModal";
import { AgentDefaultsPromptDialog } from "@/components/agent-tabs/AgentDefaultsPromptDialog";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { showLimitToast } from "@/constants/limits";
import { testTypeLabel, getUnitTestBreakdown } from "@/lib/testTypes";
import {
  TestTypeFilter,
  type TestTypeFilterValue,
} from "@/components/TestTypeFilter";
import {
  SearchModeInput,
  matchesSearchMode,
  type SearchMode,
} from "@/components/ui/SearchModeInput";
import {
  readBulkNameConflictMessage,
  readNameConflictMessage,
} from "@/lib/parseBackendError";
import {
  type EvaluatorData,
  fetchAgentEvaluators,
  addEvaluatorsToAgent,
  fetchAllEvaluators,
} from "@/lib/evaluatorApi";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call" | "conversation";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

// Shape returned by GET /tests/{uuid} — same as TestData but with hydrated
// evaluators (joined rows from get_evaluators_for_test()). Used by the
// open-for-edit flow to seed the AddTestDialog.
type TestDetail = TestData & {
  evaluators?: Array<{
    uuid: string;
    name: string;
    description?: string | null;
    slug: string | null;
    variables?: EvaluatorVariableDef[] | null;
    variable_values?: Record<string, string> | null;
  }> | null;
};

type TestRunResult = {
  name?: string; // Test name (used in in-progress responses)
  passed: boolean | null; // null means test is still running
  status?: string; // "passed" | "failed" | ... when present
  error?: string | null; // set when the test errored out before evaluating
  output?: Record<string, any> | null;
  test_case?: {
    name?: string;
    history?: { role: string; content: string }[];
    evaluation?: Record<string, any>;
  } | null;
};

type TestRun = {
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
};

// Helper function to get display name for a test run
function getTestRunDisplayName(run: TestRun): string {
  if (run.type === "llm-benchmark") {
    const modelCount = run.model_results?.length ?? 0;
    return `${modelCount} model${modelCount !== 1 ? "s" : ""}`;
  }

  // For llm-unit-test: always show the test count ("1 test" / "N tests"),
  // including single-test runs (previously these showed the test name).
  const totalTests = run.total_tests ?? run.results?.length ?? 0;
  return `${totalTests} test${totalTests !== 1 ? "s" : ""}`;
}

// Helper function to format relative time (short format)
function formatRelativeTime(dateString: string): string {
  // Handle both formats:
  // - Backend format: "2026-01-18 09:30:00" (UTC without timezone indicator)
  // - ISO format: "2026-01-18T09:30:00.000Z" (from new Date().toISOString())
  let date: Date;
  if (dateString.endsWith("Z") || dateString.includes("+")) {
    // Already has timezone indicator, parse directly
    date = new Date(dateString);
  } else {
    // Backend format: replace space with T and append Z
    date = new Date(dateString.replace(" ", "T") + "Z");
  }
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return "now";
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes} min ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return diffInDays === 1 ? "yesterday" : `${diffInDays}d ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  }

  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}m ago`;
  }

  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}

/**
 * Square check indicator shared by every test checkbox — the attach-existing
 * dropdown (select-all + rows) and the agent tests table (select-all + desktop
 * and mobile rows). Renders only the box and checkmark; the caller owns the
 * click target. Pass `hoverBorder` for the table variant (border highlights on
 * hover) and `className` for layout tweaks like `mt-0.5`.
 */
function TestCheckbox({
  checked,
  hoverBorder = false,
  className = "",
}: {
  checked: boolean;
  hoverBorder?: boolean;
  className?: string;
}) {
  const stateClass = checked
    ? "bg-foreground border-foreground"
    : `border-border${hoverBorder ? " hover:border-muted-foreground" : ""}`;
  return (
    <span
      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${stateClass} ${className}`}
    >
      {checked && (
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
    </span>
  );
}

type TestsTabContentProps = {
  agentUuid: string;
  agentName?: string;
  agentType?: "agent" | "connection";
  connectionVerified?: boolean;
  supportsBenchmark?: boolean;
  benchmarkModelsVerified?: Record<
    string,
    { verified: boolean; verified_at: string; error: string | null }
  >;
  benchmarkProvider?: string;
  /**
   * Called after a connection agent is verified from the run gate, so the
   * parent can clear the unverified state (and re-enable normal runs).
   */
  onConnectionVerified?: () => void;
  /** Switch the agent detail view to the Connection (configuration) tab. */
  onNavigateToConnection?: () => void;
};

export function TestsTabContent({
  agentUuid,
  agentName = "Agent",
  agentType,
  connectionVerified,
  supportsBenchmark,
  benchmarkModelsVerified,
  benchmarkProvider,
  onConnectionVerified,
  onNavigateToConnection,
}: TestsTabContentProps) {
  const backendAccessToken = useAccessToken();
  const maxRowsPerEval = useMaxRowsPerEval();
  // Evaluators currently attached to this agent — used to seed a new test's
  // evaluators and to detect which of a saved test's evaluators are "new" to
  // the agent (so we can offer to add them to the agent's defaults).
  const [agentEvaluators, setAgentEvaluators] = useState<EvaluatorData[]>([]);
  // False until the first load of the agent's evaluators settles. New-test
  // seeding waits on this so it never seeds off an empty (not-yet-loaded) list.
  const [agentEvaluatorsLoaded, setAgentEvaluatorsLoaded] = useState(false);
  // Post-save prompt: evaluators referenced by the just-saved test that aren't
  // yet attached to the agent. Shown on top of the still-open AddTestDialog
  // so the user can dismiss the prompt and continue reviewing the test.
  const [agentDefaultsPrompt, setAgentDefaultsPrompt] = useState<
    { uuid: string; name: string }[] | null
  >(null);
  const [agentDefaultsError, setAgentDefaultsError] = useState<string | null>(
    null,
  );
  const [isAttachingDefaults, setIsAttachingDefaults] = useState(false);
  // Agent tests state (tests attached to the agent)
  const [agentTests, setAgentTests] = useState<TestData[]>([]);
  const [agentTestsLoading, setAgentTestsLoading] = useState(true);
  const [agentTestsError, setAgentTestsError] = useState<string | null>(null);

  // All available tests state
  const [allTests, setAllTests] = useState<TestData[]>([]);
  const [allTestsLoading, setAllTestsLoading] = useState(false);
  // Tracks the eager `/tests` library fetch used by the empty state.
  // Two booleans, deliberately separate:
  //   - `allTestsAttempted`: an attempt has completed (success OR failure).
  //     Used by the retry guard so a failed fetch does not loop —
  //     instead we wait for the user to open the attach-existing
  //     dropdown, which is the natural retry trigger.
  //   - `allTestsFetched`: an attempt SUCCEEDED. Used by the empty
  //     state's copy + Add-test visibility so we only confidently hide
  //     the button when we know the library is empty; on a failed
  //     fetch we leave the button visible (clicking it will re-fetch
  //     via the dropdown's own effect).
  const [allTestsFetched, setAllTestsFetched] = useState(false);
  const [allTestsAttempted, setAllTestsAttempted] = useState(false);

  // UI state
  const [showTestDropdown, setShowTestDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // Filter the attach-existing dropdown by test type (mirrors the agent tests
  // table's `typeFilter`). Reset to "all" whenever the dropdown closes.
  const [dropdownTypeFilter, setDropdownTypeFilter] =
    useState<TestTypeFilterValue>("all");
  // Attach-existing dropdown multi-select. Holds the uuids ticked in the
  // dropdown (distinct from `selectedTestUuids`, which drives the agent
  // tests table's bulk actions). Cleared whenever the dropdown closes.
  const [selectedAvailableUuids, setSelectedAvailableUuids] = useState<
    Set<string>
  >(new Set());
  const [isAddingTests, setIsAddingTests] = useState(false);
  const [testsSearchQuery, setTestsSearchQuery] = useState("");
  const [testsSearchMode, setTestsSearchMode] =
    useState<SearchMode>("contains");
  // Filter the agent's tests by test type. "all" shows both kinds; "response"
  // is Next Reply, "tool_call" is Tool Call. The "select all" checkbox keys
  // off `filteredAgentTests`, so this filter also narrows what gets selected.
  const [typeFilter, setTypeFilter] = useState<TestTypeFilterValue>("all");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Create-test dialog state (single test created in-place from the agent
  // page; submits via POST /tests/bulk with agent_uuids so the new test is
  // auto-attached to this agent in one call).
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [nameConflictError, setNameConflictError] = useState<string | null>(
    null,
  );

  // Bulk-upload modal state (CSV upload; locked to this agent).
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);

  // Open/edit-test state. When `editingTestUuid` is set, the AddTestDialog is
  // in edit mode: it submits via PUT /tests/{uuid}. Otherwise (and when
  // createDialogOpen is true) it's in create mode and submits via the bulk
  // endpoint with agent_uuids: [agentUuid].
  const [editingTestUuid, setEditingTestUuid] = useState<string | null>(null);
  const [isLoadingTest, setIsLoadingTest] = useState(false);
  const [initialTab, setInitialTab] = useState<
    "next-reply" | "tool-invocation" | "conversation" | undefined
  >(undefined);
  const [initialConfig, setInitialConfig] = useState<TestConfig | undefined>(
    undefined,
  );
  const [initialEvaluators, setInitialEvaluators] = useState<
    AttachedEvaluatorInit[] | undefined
  >(undefined);

  // Deep-link the open test to `?testId=<uuid>` so a reload re-opens it, the
  // URL can be shared, and the Back button closes the dialog. `openEditTest` /
  // `closeTestDialogAfterSave` are defined below; the closures only run from
  // the hook's effect after mount, so the forward references are safe.
  const { setParam: setTestIdParam } = useDialogUrlParam({
    param: "testId",
    enabled: !!backendAccessToken,
    onOpen: (uuid) => openEditTest(uuid),
    onClose: () => closeTestDialogAfterSave(),
  });

  // Selection state for bulk operations
  const [selectedTestUuids, setSelectedTestUuids] = useState<Set<string>>(
    new Set(),
  );

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testToDelete, setTestToDelete] = useState<TestData | null>(null);
  const [testsToDeleteBulk, setTestsToDeleteBulk] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  /**
   * "remove": detach test from this agent only (DELETE /agent-tests).
   * "permanent": delete the test record itself (DELETE /tests/{uuid}); affects all agents.
   */
  const [deleteMode, setDeleteMode] = useState<"remove" | "permanent">(
    "remove",
  );

  // Test runner dialog state. The run is started here (not by the dialog), so
  // `testRunTaskId` holds the uuid the backend returned and the dialog only
  // displays that run.
  const [testRunnerOpen, setTestRunnerOpen] = useState(false);
  const [testRunTaskId, setTestRunTaskId] = useState<string | undefined>(
    undefined,
  );
  // Shared start-run call: repeat-click guard, expired-session bail and
  // failure toast all live in the hook.
  const startTestRun = useStartTestRun();
  // Local copy of the hook's in-flight state, read synchronously at the click
  // so a swallowed repeat click can be told apart from a genuine failure.
  const runStartInFlightRef = useRef(false);

  // Verify-to-run gate. When an unverified connection agent tries to run
  // tests, we stash the intended run here and open the verify dialog instead
  // of running (which would just fail against an unverified endpoint).
  const verify = useVerifyConnection();
  const [verifyToRunOpen, setVerifyToRunOpen] = useState(false);
  // Whether the gate is still open, read after the await in
  // `handleVerifyToRun`. State read there would be the stale value captured by
  // the render that started the check, so a run the user had cancelled by
  // closing the dialog would start anyway once the check came back.
  const verifyToRunOpenRef = useRef(false);
  const [pendingRun, setPendingRun] = useState<{
    tests: TestData[];
    runAll: boolean;
    // Side effect the caller wants applied only once the run truly starts,
    // e.g. the bulk action clearing its ticked rows. Carried through the
    // verify gate so a resumed run applies it too.
    onStarted?: () => void;
  } | null>(null);

  // Benchmark dialog state
  const [benchmarkDialogOpen, setBenchmarkDialogOpen] = useState(false);
  // When set, the benchmark dialog is scoped to this subset of tests (the
  // "Compare" bulk action on selected rows). null → compare all linked tests
  // (the header "Compare models" button).
  const [benchmarkTestSubset, setBenchmarkTestSubset] = useState<
    TestData[] | null
  >(null);

  const isConnectionUnverified =
    agentType === "connection" && connectionVerified === false;
  const isBenchmarkDisabled =
    agentType === "connection" && supportsBenchmark !== true;

  // Past test runs state
  const [pastRuns, setPastRuns] = useState<TestRun[]>([]);
  const [pastRunsLoading, setPastRunsLoading] = useState(true);

  // Viewing past run state
  const [selectedPastRun, setSelectedPastRun] = useState<TestRun | null>(null);
  const [viewingTestResults, setViewingTestResults] = useState(false);
  const [viewingBenchmarkResults, setViewingBenchmarkResults] = useState(false);

  // Direct benchmark rerun: starts a fresh benchmark (no picker) with the same
  // models + test subset as a completed run and shows it live.
  const benchmarkRerun = useBenchmarkRerun();

  // Track polling intervals for pending runs
  const pendingRunsPollingRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to track current viewing state for use in polling callbacks
  const viewingTestResultsRef = useRef(false);
  const viewingBenchmarkResultsRef = useRef(false);
  const selectedPastRunRef = useRef<TestRun | null>(null);
  const pastRunsRef = useRef<TestRun[]>([]);

  // Keep refs in sync with state
  useEffect(() => {
    viewingTestResultsRef.current = viewingTestResults;
  }, [viewingTestResults]);

  useEffect(() => {
    viewingBenchmarkResultsRef.current = viewingBenchmarkResults;
  }, [viewingBenchmarkResults]);

  useEffect(() => {
    selectedPastRunRef.current = selectedPastRun;
  }, [selectedPastRun]);

  useEffect(() => {
    pastRunsRef.current = pastRuns;
  }, [pastRuns]);

  // Fetch tests attached to this agent. Exposed as a callback so the
  // create/bulk-upload flows below can refresh the list after the bulk API
  // auto-attaches new tests to this agent.
  const fetchAgentTests = useCallback(async () => {
    if (!backendAccessToken) return;

    try {
      setAgentTestsLoading(true);
      setAgentTestsError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(
        `${backendUrl}/agent-tests/agent/${agentUuid}/tests`,
        {
          method: "GET",
          headers: getDefaultHeaders(backendAccessToken),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch agent tests");
      }

      const data = await response.json();
      setAgentTests(unwrapList<TestData>(data));
    } catch (err) {
      reportError("Error fetching agent tests:", err);
      setAgentTestsError(
        err instanceof Error ? err.message : "Failed to load agent tests",
      );
    } finally {
      setAgentTestsLoading(false);
    }
  }, [agentUuid, backendAccessToken]);

  useEffect(() => {
    if (agentUuid && backendAccessToken) {
      fetchAgentTests();
    }
  }, [agentUuid, backendAccessToken, fetchAgentTests]);

  // Load the agent's attached evaluators (best-effort; failure just means new
  // tests fall back to the default seed and the post-save prompt is skipped).
  const loadAgentEvaluators = useCallback(async () => {
    if (!agentUuid || !backendAccessToken) return;
    try {
      setAgentEvaluators(
        await fetchAgentEvaluators(agentUuid, backendAccessToken),
      );
    } catch (err) {
      reportError("Error fetching agent evaluators:", err);
    } finally {
      // Mark settled even on failure so seeding falls back rather than hanging.
      setAgentEvaluatorsLoaded(true);
    }
  }, [agentUuid, backendAccessToken]);

  useEffect(() => {
    loadAgentEvaluators();
  }, [loadAgentEvaluators]);

  // After a test is created/updated, surface any evaluators it references that
  // aren't yet attached to the agent, so the user can add them to the agent's
  // defaults. Never removes evaluators (deletions on a test are ignored here).
  // Returns true when the prompt is shown (caller should keep AddTestDialog open).
  const maybePromptAgentDefaults = async (
    evaluators: EvaluatorRefPayload[],
  ): Promise<boolean> => {
    if (!backendAccessToken || evaluators.length === 0) return false;
    let attached = new Set(agentEvaluators.map((e) => e.uuid));
    try {
      const fresh = await fetchAgentEvaluators(agentUuid, backendAccessToken);
      attached = new Set(fresh.map((e) => e.uuid));
      setAgentEvaluators(fresh);
    } catch {
      // Fall back to the cached list when the refresh fails.
    }
    const newUuids = Array.from(
      new Set(evaluators.map((e) => e.evaluator_uuid)),
    ).filter((uuid) => !attached.has(uuid));
    if (newUuids.length === 0) return false;
    // Resolve names from a fresh library fetch so inline-created evaluators
    // (not in our cached agent list) still show a friendly label.
    let library: EvaluatorData[] = [];
    try {
      library = await fetchAllEvaluators(backendAccessToken);
    } catch {
      // Names are best-effort; fall back to a generic label below.
    }
    const nameByUuid = new Map(library.map((e) => [e.uuid, e.name]));
    setAgentDefaultsPrompt(
      newUuids.map((uuid) => ({
        uuid,
        name: nameByUuid.get(uuid) ?? "Evaluator",
      })),
    );
    setAgentDefaultsError(null);
    return true;
  };

  // Fetch the user's full /tests library. Triggered from two places: when
  // the attach-existing dropdown opens, and when the agent's tests list
  // is empty (so the empty state can decide whether the Add-test button
  // is meaningful).
  const fetchAllTests = useCallback(async () => {
    if (!backendAccessToken) return;
    try {
      setAllTestsLoading(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests`, {
        method: "GET",
        headers: getDefaultHeaders(backendAccessToken),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch tests");
      }

      const data = await response.json();
      setAllTests(unwrapList<TestData>(data));
      setAllTestsFetched(true);
    } catch (err) {
      reportError("Error fetching tests:", err);
    } finally {
      setAllTestsLoading(false);
      // Mark the attempt complete regardless of outcome so the empty-
      // state retry effect doesn't fire again as soon as
      // `allTestsLoading` flips back to false. A failed fetch will be
      // retried only when the user opens the attach-existing dropdown.
      setAllTestsAttempted(true);
    }
  }, [backendAccessToken]);

  // (1) Fetch when the attach-existing dropdown opens.
  useEffect(() => {
    if (showTestDropdown && backendAccessToken) {
      fetchAllTests();
    }
  }, [showTestDropdown, backendAccessToken, fetchAllTests]);

  // (2) Fetch when the agent's tests list is known to be empty, so the
  // empty state can decide whether to show the Add-test button. Gated
  // on `allTestsAttempted` so a failure doesn't trigger a tight retry
  // loop — see comment on the state declarations above.
  useEffect(() => {
    if (
      !agentTestsLoading &&
      agentTests.length === 0 &&
      !allTestsAttempted &&
      !allTestsLoading &&
      backendAccessToken
    ) {
      fetchAllTests();
    }
  }, [
    agentTestsLoading,
    agentTests.length,
    allTestsAttempted,
    allTestsLoading,
    backendAccessToken,
    fetchAllTests,
  ]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowTestDropdown(false);
        setSearchQuery("");
        setDropdownTypeFilter("all");
        setSelectedAvailableUuids(new Set());
      }
    };

    if (showTestDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTestDropdown]);

  // Fetch past test runs
  useEffect(() => {
    const fetchPastRuns = async () => {
      if (!backendAccessToken) return;

      try {
        setPastRunsLoading(true);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(
          `${backendUrl}/agent-tests/agent/${agentUuid}/runs`,
          {
            method: "GET",
            headers: getDefaultHeaders(backendAccessToken),
          },
        );

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          // Silently handle errors for past runs - it's not critical
          reportError("Failed to fetch past runs");
          return;
        }

        const data = await response.json();
        setPastRuns(unwrapList<TestRun>(data));
      } catch (err) {
        reportError("Error fetching past runs:", err);
      } finally {
        setPastRunsLoading(false);
      }
    };

    if (agentUuid && backendAccessToken) {
      fetchPastRuns();
    }
  }, [agentUuid, backendAccessToken]);

  // Poll pending runs (excluding the one being viewed in dialog)
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl || !backendAccessToken) return;

    // Clear existing polling interval
    if (pendingRunsPollingRef.current) {
      clearInterval(pendingRunsPollingRef.current);
      pendingRunsPollingRef.current = null;
    }

    const pollPendingRuns = async () => {
      // Get the ID of the run currently being viewed in the dialog (use refs for current values)
      const viewingRunId =
        (viewingTestResultsRef.current || viewingBenchmarkResultsRef.current) &&
        selectedPastRunRef.current
          ? selectedPastRunRef.current.uuid
          : null;

      // Find pending runs that need polling (excluding the one being viewed)
      // Use ref to get current pastRuns to avoid stale closure
      const pendingRuns = pastRunsRef.current.filter(
        (run) =>
          (run.status === "pending" ||
            run.status === "queued" ||
            run.status === "in_progress") &&
          run.uuid !== viewingRunId,
      );

      // If no pending runs to poll, skip this poll cycle
      if (pendingRuns.length === 0) return;

      for (const run of pendingRuns) {
        // Double-check if this run is now being viewed in dialog
        if (
          (viewingTestResultsRef.current ||
            viewingBenchmarkResultsRef.current) &&
          selectedPastRunRef.current?.uuid === run.uuid
        ) {
          continue;
        }

        try {
          const endpoint =
            run.type === "llm-unit-test"
              ? `${backendUrl}/agent-tests/run/${run.uuid}`
              : `${backendUrl}/agent-tests/benchmark/${run.uuid}`;

          const response = await fetch(endpoint, {
            method: "GET",
            headers: getDefaultHeaders(backendAccessToken),
          });

          if (!response.ok) continue;

          const result = await response.json();

          // Update the run in pastRuns
          setPastRuns((prev) =>
            prev.map((r) => {
              if (r.uuid !== run.uuid) return r;

              if (run.type === "llm-unit-test") {
                return {
                  ...r,
                  status: result.status,
                  total_tests: result.total_tests ?? r.total_tests,
                  passed: result.passed ?? r.passed,
                  failed: result.failed ?? r.failed,
                  results: result.results ?? r.results,
                  updated_at: new Date().toISOString(),
                };
              } else {
                return {
                  ...r,
                  status: result.status,
                  model_results: result.model_results ?? r.model_results,
                  updated_at: new Date().toISOString(),
                };
              }
            }),
          );
        } catch (err) {
          reportError(`Error polling run ${run.uuid}:`, err);
          // Mark this specific run as failed
          setPastRuns((prev) =>
            prev.map((r) =>
              r.uuid === run.uuid
                ? {
                    ...r,
                    status: "failed",
                    updated_at: new Date().toISOString(),
                  }
                : r,
            ),
          );
        }
      }
    };

    // Start polling every 3 seconds
    pollPendingRuns(); // Poll immediately on mount/dependency change
    pendingRunsPollingRef.current = setInterval(
      pollPendingRuns,
      POLLING_INTERVAL_MS,
    );

    return () => {
      if (pendingRunsPollingRef.current) {
        clearInterval(pendingRunsPollingRef.current);
        pendingRunsPollingRef.current = null;
      }
    };
  }, [
    backendAccessToken,
    viewingTestResults,
    viewingBenchmarkResults,
    selectedPastRun,
  ]);

  // Filter out tests already attached to the agent
  const agentTestUuids = new Set(agentTests.map((t) => t.uuid));
  const availableTests = allTests.filter(
    (test) => !agentTestUuids.has(test.uuid),
  );

  // Filter available tests by type AND search query. Both apply together (AND),
  // so the select-all checkbox — which keys off `filteredAvailableTests` — only
  // picks rows matching the active type filter and query.
  const filteredAvailableTests = availableTests.filter((test) => {
    if (dropdownTypeFilter !== "all" && test.type !== dropdownTypeFilter)
      return false;
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return test.name.toLowerCase().includes(q);
  });

  // True when every currently-visible (filtered) dropdown row is selected;
  // drives the select-all header's checked state.
  const allFilteredAvailableSelected =
    filteredAvailableTests.length > 0 &&
    filteredAvailableTests.every((test) =>
      selectedAvailableUuids.has(test.uuid),
    );

  // Filter agent tests by search query AND test type. Both filters apply
  // together (AND). The type filter also constrains the select-all checkbox
  // since it operates on `filteredAgentTests`.
  const filteredAgentTests = agentTests.filter((test) => {
    if (typeFilter !== "all" && test.type !== typeFilter) return false;
    const q = testsSearchQuery.trim();
    if (!q) return true;
    return matchesSearchMode(test.name, q, testsSearchMode);
  });

  // Toggle a single test's selection in the attach-existing dropdown.
  const toggleAvailableTest = (uuid: string) => {
    setSelectedAvailableUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  // Select-all toggle scoped to the *filtered* dropdown list, so when a
  // search query narrows the dropdown only those rows get selected.
  const toggleSelectAllAvailable = () => {
    const filteredUuids = filteredAvailableTests.map((t) => t.uuid);
    const allFilteredSelected =
      filteredUuids.length > 0 &&
      filteredUuids.every((uuid) => selectedAvailableUuids.has(uuid));
    setSelectedAvailableUuids((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredUuids.forEach((uuid) => next.delete(uuid));
      } else {
        filteredUuids.forEach((uuid) => next.add(uuid));
      }
      return next;
    });
  };

  // Attach all selected tests to the agent in a single request. The
  // /agent-tests endpoint accepts an array of test_uuids, so a multi-select
  // add is one POST rather than one per test.
  const handleAddSelectedTests = async () => {
    if (selectedAvailableUuids.size === 0) return;
    try {
      setIsAddingTests(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const testUuids = Array.from(selectedAvailableUuids);
      const response = await fetch(`${backendUrl}/agent-tests`, {
        method: "POST",
        headers: {
          ...getDefaultHeaders(backendAccessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agent_uuid: agentUuid,
          test_uuids: testUuids,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to add tests to agent");
      }

      // Refetch the agent's tests instead of locally splicing them in, so the
      // table reflects the backend's ordering rather than a hardcoded
      // top/bottom placement.
      setShowTestDropdown(false);
      setSearchQuery("");
      setDropdownTypeFilter("all");
      setSelectedAvailableUuids(new Set());
      await fetchAgentTests();
    } catch (err) {
      reportError("Error adding tests to agent:", err);
    } finally {
      setIsAddingTests(false);
    }
  };

  // Create a single test in-place from this agent's Tests tab and
  // auto-attach it to the agent in one call by going through the bulk
  // endpoint with `agent_uuids: [agentUuid]`. The bulk API atomically
  // creates the test and best-effort links it to the agent (per
  // .cursor/rules/app-details.md); partial-link failures surface as
  // `warnings` in the response, which we treat as a soft success.
  const createTestForAgent = async (
    config: TestConfig,
    evaluators: EvaluatorRefPayload[],
    options?: { runAfterSave?: boolean },
  ) => {
    setValidationAttempted(true);
    if (!newTestName.trim()) return;
    // Kept for the run-after-save display name; the run itself keys off the
    // uuid the create call returns.
    const targetName = newTestName.trim();

    try {
      setIsCreating(true);
      setCreateError(null);
      setNameConflictError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const evalType = config.evaluation.type;
      const usesEvaluators =
        evalType === "response" || evalType === "conversation";
      const testItem: {
        name: string;
        conversation_history: TestConfig["history"];
        evaluators?: EvaluatorRefPayload[];
        tool_calls?: NonNullable<TestConfig["evaluation"]["tool_calls"]>;
      } = {
        name: newTestName.trim(),
        conversation_history: config.history,
      };
      if (usesEvaluators) {
        testItem.evaluators = evaluators;
      } else {
        testItem.tool_calls = config.evaluation.tool_calls ?? [];
      }

      const response = await fetch(`${backendUrl}/tests/bulk`, {
        method: "POST",
        headers: {
          ...getDefaultHeaders(backendAccessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: config.evaluation.type,
          tests: [testItem],
          agent_uuids: [agentUuid],
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        // Friendly fixed message instead of the backend's verbatim
        // "Test names already exist: <name>" (plural reads awkwardly
        // for a single-test create dialog).
        const conflict = await readBulkNameConflictMessage(response);
        if (conflict) {
          setNameConflictError("A test with this name already exists");
          setIsCreating(false);
          return;
        }
        throw new Error("Failed to create test");
      }

      // Bulk endpoint creates the test atomically but links it best-effort.
      // If linking to this agent failed, the test is in the user's library
      // but won't show up in this agent's list — refresh anyway (it's still
      // a no-op for the agent table) but surface the warning and keep the
      // dialog open so the user knows they need to retry the attach.
      // POST /tests/bulk returns { uuids, count, message, warnings }.
      const result = (await response.json().catch(() => null)) as {
        uuids?: string[] | null;
        warnings?: string[] | null;
      } | null;
      await fetchAgentTests();
      if (result?.warnings && result.warnings.length > 0) {
        setCreateError(
          `Test created but could not be attached to this agent: ${result.warnings.join("; ")}`,
        );
        setIsCreating(false);
        return;
      }
      // "Create and run": skip the agent-defaults prompt and run the new test
      // straight away, using the uuid the create call returned (linking to
      // this agent already succeeded — warnings are handled above).
      const newUuid = result?.uuids?.[0];
      if (options?.runAfterSave && newUuid) {
        setNewTestName("");
        setValidationAttempted(false);
        closeTestDialogAfterSave();
        runSavedTest(
          buildTestToRun({
            uuid: newUuid,
            name: targetName,
            type: config.evaluation.type,
            config,
          }),
        );
        return;
      }
      const prompted = usesEvaluators
        ? await maybePromptAgentDefaults(evaluators)
        : false;
      if (!prompted) {
        setNewTestName("");
        setValidationAttempted(false);
        closeTestDialogAfterSave();
      }
    } catch (err) {
      reportError("Error creating test:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to create test",
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Reset all edit/create-related state. Called when closing the dialog.
  const resetTestDialog = () => {
    setTestIdParam(null);
    setEditingTestUuid(null);
    setIsLoadingTest(false);
    setInitialTab(undefined);
    setInitialConfig(undefined);
    setInitialEvaluators(undefined);
    setNewTestName("");
    setValidationAttempted(false);
    setCreateError(null);
    setNameConflictError(null);
  };

  const closeTestDialogAfterSave = () => {
    setCreateDialogOpen(false);
    resetTestDialog();
  };

  // Add the "Past runs" row for a run we just started. Takes the tests
  // explicitly, from the click that started the run.
  const addOptimisticTestRun = (taskId: string, tests: TestData[]) => {
    const newRun: TestRun = makeOptimisticTestRun(
      taskId,
      tests,
      new Date().toISOString(),
    );
    setPastRuns((prev) => [newRun, ...prev]);
    // Polling is handled by the useEffect that watches pastRuns for pending items
  };

  // Actually start the run, then hand the returned uuid to the test runner.
  // Starting the run belongs here, at the click, rather than inside the dialog:
  // a dialog effect watching props fired the same POST over and over.
  const beginRun = async (
    tests: TestData[],
    runAll: boolean,
    // The caller's own side effect, e.g. the bulk action clearing its ticked
    // rows. Named apart from the hook's `onStarted` option below.
    onRunStarted?: () => void,
  ) => {
    // Mirrors the hook's own in-flight guard. A repeat click while the first
    // start is still open is swallowed there and reported as a failed start,
    // so bail before touching the dialog: otherwise the repeat click would
    // close the window the first click legitimately opened.
    if (runStartInFlightRef.current) return;
    runStartInFlightRef.current = true;

    // Open on the click rather than on the response, so the most common action
    // in the product reacts immediately. Clearing the previous run's uuid at
    // the same moment keeps the dialog from briefly showing the last run.
    setTestRunTaskId(undefined);
    setTestRunnerOpen(true);

    try {
      const started = await startTestRun({
        agentUuid,
        tests,
        runAllLinked: runAll,
        onStarted: (taskId) => {
          setTestRunTaskId(taskId);
          addOptimisticTestRun(taskId, tests);
          onRunStarted?.();
        },
      });
      // No run exists (expired session or a failure the hook already toasted),
      // so close the window again instead of leaving it spinning forever.
      if (!started) {
        setTestRunnerOpen(false);
        setTestRunTaskId(undefined);
      }
    } finally {
      runStartInFlightRef.current = false;
    }
  };

  // Single gate for every run entry point (header "Run all", bulk "Run",
  // per-row play, "Save and run", rerun). Enforces the per-run row limit and,
  // for an unverified connection agent, diverts into the verify-to-run flow
  // instead of starting a run that would fail against an unverified endpoint.
  // Anything that passes the guards goes on to `beginRun`, which starts the
  // run and opens the test runner on its uuid.
  const startRun = async (
    tests: TestData[],
    runAll: boolean,
    onStarted?: () => void,
  ): Promise<void> => {
    if (tests.length === 0) return;
    if (tests.length > maxRowsPerEval) {
      showLimitToast(
        `You can only run up to ${maxRowsPerEval} tests at a time.`,
      );
      return;
    }
    if (isConnectionUnverified) {
      verify.dismiss();
      setPendingRun({ tests, runAll, onStarted });
      setVerifyToRunOpen(true);
      verifyToRunOpenRef.current = true;
      return;
    }
    await beginRun(tests, runAll, onStarted);
  };

  // "Verify" pressed in the run gate: verify the saved agent, then either
  // resume the pending run (success) or leave the failure showing so the user
  // can jump to the connection settings.
  const handleVerifyToRun = async () => {
    const success = await verify.verifySavedAgent(agentUuid);
    if (!success) return;
    // The agent really is verified now, so record that even if the user closed
    // the dialog while the check was running. Only the run is abandoned.
    onConnectionVerified?.();
    const stillOpen = verifyToRunOpenRef.current;
    verifyToRunOpenRef.current = false;
    setVerifyToRunOpen(false);
    const resumed = pendingRun;
    setPendingRun(null);
    // Closing during the check cancels the run, so do not resume it.
    if (!stillOpen || !resumed) return;
    await beginRun(resumed.tests, resumed.runAll, resumed.onStarted);
  };

  const closeVerifyToRun = () => {
    setVerifyToRunOpen(false);
    verifyToRunOpenRef.current = false;
    setPendingRun(null);
    verify.dismiss();
  };

  const goToConnectionSettings = () => {
    closeVerifyToRun();
    onNavigateToConnection?.();
  };

  // Open the test runner for a single just-saved test. Backing the dialog's
  // "Save and run" shortcut, it mirrors the row-level play action (run one
  // specific test, not the whole linked set).
  const runSavedTest = (test: TestData) => {
    startRun([test], false);
  };

  // Test is already saved when this prompt is shown. Declining (Not now / X)
  // keeps the test but skips updating the agent's default evaluators.
  const dismissAgentDefaultsPrompt = () => {
    if (isAttachingDefaults) return;
    setAgentDefaultsPrompt(null);
    setAgentDefaultsError(null);
    closeTestDialogAfterSave();
  };

  const confirmAddAgentDefaults = async () => {
    if (!agentDefaultsPrompt || !backendAccessToken) return;
    try {
      setIsAttachingDefaults(true);
      setAgentDefaultsError(null);
      // Add-only, single call: the prompt already holds just the evaluators
      // not yet on the agent; existing links are left intact.
      await addEvaluatorsToAgent(
        agentUuid,
        agentDefaultsPrompt.map((ev) => ev.uuid),
        backendAccessToken,
      );
      await loadAgentEvaluators();
      setAgentDefaultsPrompt(null);
      setAgentDefaultsError(null);
      closeTestDialogAfterSave();
    } catch (err) {
      reportError("Error adding evaluators to agent defaults:", err);
      setAgentDefaultsError(
        err instanceof Error
          ? err.message
          : "Failed to update default evaluators",
      );
    } finally {
      setIsAttachingDefaults(false);
    }
  };

  // Fetch a test's details by UUID and open the dialog in edit mode.
  // Hydrates the same shape the standalone /tests page uses, so the dialog
  // can be reused as-is.
  const openEditTest = async (uuid: string) => {
    try {
      setIsLoadingTest(true);
      setEditingTestUuid(uuid);
      setCreateDialogOpen(true);
      setCreateError(null);
      setNameConflictError(null);
      // Reflect the open test in the URL (shareable / reload-stable).
      setTestIdParam(uuid);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests/${uuid}`, {
        method: "GET",
        headers: getDefaultHeaders(backendAccessToken),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch test details");
      }

      const testData: TestDetail = await response.json();

      setNewTestName(testData.name || "");
      setInitialTab(
        testData.type === "tool_call"
          ? "tool-invocation"
          : testData.type === "conversation"
            ? "conversation"
            : "next-reply",
      );
      if (testData.config) {
        setInitialConfig(testData.config as TestConfig);
      }
      if (Array.isArray(testData.evaluators)) {
        setInitialEvaluators(
          testData.evaluators.map((e) => ({
            evaluator_uuid: e.uuid,
            name: e.name,
            description: e.description ?? null,
            slug: e.slug,
            variables: Array.isArray(e.variables) ? e.variables : [],
            variable_values: e.variable_values ?? null,
          })),
        );
      } else {
        setInitialEvaluators([]);
      }
    } catch (err) {
      reportError("Error fetching test:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load test",
      );
      // Drop a stale/invalid testId from the URL so a shared or reloaded link
      // to a missing test doesn't keep re-opening the error on every load.
      setTestIdParam(null);
    } finally {
      setIsLoadingTest(false);
    }
  };

  // Open the create dialog pre-filled from an existing test. Editing is left
  // off (editingTestUuid stays null) so submitting creates a brand-new test
  // via POST /tests/bulk — nothing is persisted until the user submits.
  const openDuplicateTest = async (test: TestData) => {
    try {
      setIsLoadingTest(true);
      setEditingTestUuid(null);
      setCreateDialogOpen(true);
      setCreateError(null);
      setNameConflictError(null);
      setValidationAttempted(false);

      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests/${test.uuid}`, {
        method: "GET",
        headers: getDefaultHeaders(backendAccessToken),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to fetch test details");
      }

      const testData: TestDetail = await response.json();

      setNewTestName(`Copy of ${testData.name || test.name}`);
      setInitialTab(
        testData.type === "tool_call" ? "tool-invocation" : "next-reply",
      );
      if (testData.config) {
        setInitialConfig(testData.config as TestConfig);
      }
      if (Array.isArray(testData.evaluators)) {
        setInitialEvaluators(
          testData.evaluators.map((e) => ({
            evaluator_uuid: e.uuid,
            name: e.name,
            description: e.description ?? null,
            slug: e.slug,
            variables: Array.isArray(e.variables) ? e.variables : [],
            variable_values: e.variable_values ?? null,
          })),
        );
      } else {
        setInitialEvaluators([]);
      }
    } catch (err) {
      reportError("Error duplicating test:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to load test",
      );
    } finally {
      setIsLoadingTest(false);
    }
  };

  // Update an existing test via PUT /tests/{uuid}. The test's agent links
  // are not touched here — this only edits the test itself.
  const updateTest = async (
    config: TestConfig,
    evaluators: EvaluatorRefPayload[],
    options?: { runAfterSave?: boolean },
  ) => {
    setValidationAttempted(true);
    if (!newTestName.trim() || !editingTestUuid) return;
    // Capture before closeTestDialogAfterSave resets the edit state below.
    const targetUuid = editingTestUuid;
    const targetName = newTestName.trim();

    try {
      setIsCreating(true);
      setCreateError(null);
      setNameConflictError(null);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Mirror the standalone tests page: send `evaluators` for next-reply
      // and conversation tests so the pivot set is replaced; omit it for
      // tool-invocation tests so existing links are left untouched.
      const body: {
        name: string;
        type: "response" | "tool_call" | "conversation";
        config: TestConfig;
        evaluators?: EvaluatorRefPayload[];
      } = {
        name: newTestName.trim(),
        type: config.evaluation.type,
        config: config,
      };
      if (
        config.evaluation.type === "response" ||
        config.evaluation.type === "conversation"
      ) {
        body.evaluators = evaluators;
      }

      const response = await fetch(`${backendUrl}/tests/${editingTestUuid}`, {
        method: "PUT",
        headers: {
          ...getDefaultHeaders(backendAccessToken),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        // PUT /tests/{uuid} returns 409 for name conflicts (single-test
        // contract), not the 400 used by /tests/bulk.
        const conflict = await readNameConflictMessage(response);
        if (conflict) {
          setNameConflictError("A test with this name already exists");
          setIsCreating(false);
          return;
        }
        throw new Error("Failed to update test");
      }

      await fetchAgentTests();
      // "Save and run" takes priority: skip the agent-defaults prompt and go
      // straight to running the just-saved test. We already hold its uuid
      // (the open test's id), so run it directly — no list lookup needed.
      if (options?.runAfterSave) {
        closeTestDialogAfterSave();
        runSavedTest(
          buildTestToRun({
            uuid: targetUuid,
            name: targetName,
            type: config.evaluation.type,
            config,
          }),
        );
        return;
      }
      const prompted =
        config.evaluation.type === "response" ||
        config.evaluation.type === "conversation"
          ? await maybePromptAgentDefaults(evaluators)
          : false;
      if (!prompted) {
        closeTestDialogAfterSave();
      }
    } catch (err) {
      reportError("Error updating test:", err);
      setCreateError(
        err instanceof Error ? err.message : "Failed to update test",
      );
    } finally {
      setIsCreating(false);
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
    if (selectedTestUuids.size === filteredAgentTests.length) {
      setSelectedTestUuids(new Set());
    } else {
      setSelectedTestUuids(new Set(filteredAgentTests.map((t) => t.uuid)));
    }
  };

  // Open delete confirmation dialog (single)
  const openDeleteDialog = (
    test: TestData,
    mode: "remove" | "permanent" = "remove",
  ) => {
    setTestToDelete(test);
    setTestsToDeleteBulk([]);
    setDeleteMode(mode);
    setDeleteDialogOpen(true);
  };

  // Open bulk delete confirmation dialog
  const openBulkDeleteDialog = (mode: "remove" | "permanent" = "remove") => {
    if (selectedTestUuids.size === 0) return;
    setTestToDelete(null);
    setTestsToDeleteBulk(Array.from(selectedTestUuids));
    setDeleteMode(mode);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isDeleting) {
      setDeleteDialogOpen(false);
      setTestToDelete(null);
      setTestsToDeleteBulk([]);
      setDeleteMode("remove");
    }
  };

  // Handle clicking on a past run row
  const handlePastRunClick = (run: TestRun) => {
    setSelectedPastRun(run);
    if (run.type === "llm-unit-test") {
      setViewingTestResults(true);
    } else {
      setViewingBenchmarkResults(true);
    }
  };

  // Rerun a completed test run as a fresh run of the same tests, swapping the
  // view dialog for the live new-run dialog.
  const handleRerunTests = (tests: TestData[]) => {
    setViewingTestResults(false);
    setSelectedPastRun(null);
    startRun(tests, false);
  };

  // Rerun a completed benchmark with the same models and test subset, swapping
  // the view dialog for a fresh live benchmark (skips the model picker).
  const handleRerunBenchmark = (
    models: string[],
    testUuids: string[],
    testNames: string[],
  ) => {
    setViewingBenchmarkResults(false);
    setSelectedPastRun(null);
    benchmarkRerun.start({
      agentUuid,
      agentName,
      models,
      testUuids,
      testNames,
    });
  };

  // Handle when a new benchmark is created. Models aren't known here (the
  // picker owns them), so the row shows "0 models" until the poller fills it in.
  const handleBenchmarkCreated = (taskId: string) => {
    const newRun: TestRun = makeOptimisticBenchmarkRun(
      taskId,
      [],
      new Date().toISOString(),
    );
    setPastRuns((prev) => [newRun, ...prev]);
    // Polling is handled by the useEffect that watches pastRuns for pending items
  };

  // Callback when a run completes from the TestRunnerDialog
  const handleRunStatusUpdate = useCallback(
    (
      taskId: string,
      status: string,
      results?: TestRunResult[],
      passed?: number | null,
      failed?: number | null,
    ) => {
      setPastRuns((prev) =>
        prev.map((run) => {
          if (run.uuid !== taskId) return run;
          return {
            ...run,
            status,
            results: results ?? run.results,
            passed: passed ?? run.passed,
            failed: failed ?? run.failed,
            updated_at: new Date().toISOString(),
          };
        }),
      );
    },
    [],
  );

  // Remove test(s) from agent OR delete them permanently from the user's
  // entire test library, depending on `deleteMode`.
  const handleRemoveTest = async () => {
    const uuidsToRemove =
      testsToDeleteBulk.length > 0
        ? testsToDeleteBulk
        : testToDelete
          ? [testToDelete.uuid]
          : [];
    if (uuidsToRemove.length === 0) return;

    try {
      setIsDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      // Track which uuids the backend actually deleted in permanent mode —
      // tests not owned by the caller are skipped server-side.
      let actuallyDeleted: string[] = uuidsToRemove;

      if (deleteMode === "permanent") {
        // Single bulk call: handles 1 or many uuids; backend soft-deletes the
        // test rows and cascades to every agent_tests link.
        const response = await fetch(
          `${backendUrl}/agent-tests/bulk-delete-tests`,
          {
            method: "POST",
            headers: {
              ...getDefaultHeaders(backendAccessToken),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agent_uuid: agentUuid,
              test_uuids: uuidsToRemove,
            }),
          },
        );

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to delete test(s)");
        }

        const data: {
          deleted_count: number;
          deleted_test_uuids?: string[];
        } = await response.json();
        actuallyDeleted = data.deleted_test_uuids ?? uuidsToRemove;
      } else {
        for (const uuid of uuidsToRemove) {
          const response = await fetch(`${backendUrl}/agent-tests`, {
            method: "DELETE",
            headers: {
              ...getDefaultHeaders(backendAccessToken),
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              agent_uuid: agentUuid,
              test_uuid: uuid,
            }),
          });

          if (response.status === 401) {
            await signOut({ callbackUrl: "/login" });
            return;
          }

          if (!response.ok) {
            throw new Error("Failed to remove test from agent");
          }
        }
      }

      const removedSet = new Set(actuallyDeleted);
      setAgentTests((prev) => prev.filter((t) => !removedSet.has(t.uuid)));
      // When deleting permanently, also drop the test from the "all tests"
      // dropdown so it doesn't reappear as available to add.
      if (deleteMode === "permanent") {
        setAllTests((prev) => prev.filter((t) => !removedSet.has(t.uuid)));
      }
      setSelectedTestUuids(new Set());
      closeDeleteDialog();
    } catch (err) {
      reportError(
        deleteMode === "permanent"
          ? "Error deleting test(s):"
          : "Error removing test(s) from agent:",
        err,
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // The three test-creation entry points get their own fixed tint so they
  // read as distinct actions in every layout: header bar and both empty
  // states use the same colour mapping regardless of which other buttons
  // are present. Hue palette is picked to avoid colliding with the
  // Share/Public/Copy-link (purple/blue/amber) and Export (teal) actions.
  //
  //   Add test (attach existing) → indigo
  //   Create test               → emerald (pink read as "danger" — swapped)
  //   Bulk upload               → orange
  const ADD_TEST_BUTTON_CLASS =
    "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-indigo-500/12 border-indigo-500/45 text-indigo-950 dark:text-indigo-100 hover:bg-indigo-500/22 dark:hover:bg-indigo-500/18";
  const CREATE_TEST_BUTTON_CLASS =
    "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18";
  const BULK_UPLOAD_BUTTON_CLASS =
    "h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-orange-500/12 border-orange-500/45 text-orange-950 dark:text-orange-100 hover:bg-orange-500/22 dark:hover:bg-orange-500/18";

  const renderNewTestButtons = () => (
    <>
      <button
        type="button"
        data-tour="tests-create"
        onClick={() => {
          setNewTestName("");
          setValidationAttempted(false);
          setCreateError(null);
          setNameConflictError(null);
          setCreateDialogOpen(true);
        }}
        className={CREATE_TEST_BUTTON_CLASS}
      >
        Create test
      </button>
      <button
        type="button"
        onClick={() => setBulkUploadOpen(true)}
        className={BULK_UPLOAD_BUTTON_CLASS}
      >
        Bulk upload
      </button>
    </>
  );

  const renderAddTestControl = () => (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setShowTestDropdown(!showTestDropdown)}
        type="button"
        className={ADD_TEST_BUTTON_CLASS}
      >
        Add test
      </button>
      {showTestDropdown && (
        <div className="absolute top-full left-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
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
                    d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tests"
                className="w-full h-9 pl-9 pr-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                autoFocus
              />
            </div>
            {/* Type filter — narrows the list (and select-all) to one test
                type. Changing it drops selections that no longer match so the
                "Add N tests" count stays in step with what's visible. */}
            <TestTypeFilter
              size="sm"
              className="mt-2"
              value={dropdownTypeFilter}
              onChange={(value) => {
                setDropdownTypeFilter(value);
                setSelectedAvailableUuids((prev) => {
                  if (prev.size === 0) return prev;
                  const next = new Set<string>();
                  for (const t of availableTests) {
                    if (!prev.has(t.uuid)) continue;
                    if (value !== "all" && t.type !== value) continue;
                    next.add(t.uuid);
                  }
                  return next;
                });
              }}
            />
          </div>
          {/* Select-all header — scoped to the filtered list so a search
              query narrows what "select all" picks. */}
          {!allTestsLoading && filteredAvailableTests.length > 0 && (
            <button
              type="button"
              onClick={toggleSelectAllAvailable}
              className="w-full flex items-center gap-2.5 px-4 py-2 border-b border-border hover:bg-muted/50 transition-colors cursor-pointer text-left"
            >
              <TestCheckbox checked={allFilteredAvailableSelected} />
              <span className="text-sm font-medium text-foreground">
                Select all
                {searchQuery ? " matching" : ""}
              </span>
            </button>
          )}
          <div className="max-h-64 overflow-y-auto">
            {allTestsLoading ? (
              <div className="flex items-center justify-center py-8">
                <svg
                  className="w-5 h-5 animate-spin text-muted-foreground"
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
            ) : availableTests.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  All tests have been added to this agent
                </p>
              </div>
            ) : filteredAvailableTests.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No tests found</p>
              </div>
            ) : (
              filteredAvailableTests.map((test) => {
                const checked = selectedAvailableUuids.has(test.uuid);
                return (
                  <button
                    key={test.uuid}
                    type="button"
                    onClick={() => toggleAvailableTest(test.uuid)}
                    className="w-full flex items-start gap-2.5 px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer border-b border-border last:border-b-0"
                  >
                    <TestCheckbox checked={checked} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground truncate">
                        {test.name}
                      </span>
                      <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                        {testTypeLabel(test.type)}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
          {/* Footer — confirm the multi-select. Hidden when there's nothing
              to attach so the empty/loading states stand alone. */}
          {!allTestsLoading && availableTests.length > 0 && (
            <div className="p-3 border-t border-border">
              <button
                type="button"
                onClick={handleAddSelectedTests}
                disabled={selectedAvailableUuids.size === 0 || isAddingTests}
                className="w-full h-9 rounded-md text-sm font-medium bg-foreground text-background transition-opacity cursor-pointer hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAddingTests
                  ? "Adding..."
                  : selectedAvailableUuids.size > 0
                    ? `Add ${selectedAvailableUuids.size} ${
                        selectedAvailableUuids.size === 1 ? "test" : "tests"
                      }`
                    : "Add tests"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const pastRunsPanel = (
    <div className="w-full lg:w-[400px] xl:w-[560px] flex-shrink-0 border border-border rounded-xl overflow-hidden">
      <div className="px-3 md:px-4 py-2 md:py-3">
        <h3 className="text-sm md:text-base font-semibold text-foreground">
          Past runs
        </h3>
      </div>

      <div className="overflow-y-auto max-h-[300px] lg:max-h-[500px]">
        {pastRunsLoading ? (
          <div className="flex items-center justify-center py-6 md:py-8">
            <svg
              className="w-5 h-5 animate-spin text-muted-foreground"
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
        ) : pastRuns.length === 0 ? (
          <div className="py-6 md:py-8 text-center">
            <p className="text-xs md:text-sm text-muted-foreground">
              No test runs yet
            </p>
          </div>
        ) : (
          pastRuns.map((run) => (
            <div
              key={run.uuid}
              onClick={() => handlePastRunClick(run)}
              className="flex flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_5.75rem_5rem_9.25rem] sm:items-start sm:justify-items-stretch gap-2 sm:gap-2 xl:grid-cols-[minmax(0,1fr)_6.25rem_5.75rem_11.5rem] xl:gap-3 px-3 md:px-4 py-2 md:py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2 sm:block min-w-0">
                <span
                  className="text-xs md:text-sm font-medium text-foreground block min-w-0 truncate"
                  title={getTestRunDisplayName(run)}
                >
                  {getTestRunDisplayName(run)}
                </span>
                <span className="sm:hidden text-xs text-muted-foreground">
                  {formatRelativeTime(run.updated_at)}
                </span>
              </div>
              <span
                className={`hidden sm:flex sm:w-full sm:min-w-0 sm:items-center sm:justify-center px-2 py-0.5 rounded text-xs font-medium ${
                  run.type === "llm-unit-test"
                    ? "bg-blue-500/20 text-blue-400"
                    : "bg-purple-500/20 text-purple-400"
                }`}
              >
                {run.type === "llm-unit-test" ? "Test" : "Benchmark"}
              </span>
              <span className="hidden sm:block sm:w-full sm:min-w-0 text-sm text-muted-foreground text-right tabular-nums">
                {formatRelativeTime(run.updated_at)}
              </span>
              <div className="flex flex-wrap items-center sm:justify-end gap-2 sm:justify-self-end">
                {run.status === "pending" ||
                run.status === "queued" ||
                run.status === "in_progress" ? (
                  <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/20 text-yellow-500">
                    <svg
                      className="w-3 h-3 animate-spin mr-1"
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
                    Running
                  </span>
                ) : run.type === "llm-unit-test" ? (
                  (() => {
                    // Prefer a per-test breakdown so a run whose tests errored
                    // out shows "N Success / N Fail / N Error" instead of a
                    // single blanket "Error" pill. Fall back to the run-level
                    // status only when there are no usable results.
                    const breakdown = getUnitTestBreakdown(run.results);
                    if (!breakdown) {
                      return run.status === "failed" ? (
                        <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500">
                          Error
                        </span>
                      ) : (
                        <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500">
                          Complete
                        </span>
                      );
                    }
                    return (
                      <>
                        {breakdown.passed > 0 && (
                          <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500">
                            {breakdown.passed} Success
                          </span>
                        )}
                        {breakdown.failed > 0 && (
                          <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500">
                            {breakdown.failed} Fail
                          </span>
                        )}
                        {breakdown.errored > 0 && (
                          <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-500">
                            {breakdown.errored} Error
                          </span>
                        )}
                      </>
                    );
                  })()
                ) : run.status === "failed" ? (
                  <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500">
                    Error
                  </span>
                ) : (
                  <span className="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500">
                    Complete
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header — only shown when the agent has at least one test
          attached. Split into two groups: page-level "act on the tests"
          actions (Run all / Compare models) on the left, and "add more
          tests" actions (Add / Create / Bulk upload) on the right.
          Multi-select bulk actions (Run / Remove / Delete subset) live
          above the table in their own toolbar, not here. */}
      {agentTests.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
          {/* Left group: act-on-the-tests buttons. */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {/* Run all tests — sky tint, "play" semantic. */}
            <button
              data-tour="tests-run-all"
              onClick={() => startRun(agentTests, true)}
              className="h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border transition-colors flex items-center gap-2 bg-sky-500/12 border-sky-500/45 text-sky-950 dark:text-sky-100 hover:bg-sky-500/22 dark:hover:bg-sky-500/18 cursor-pointer"
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
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                />
              </svg>
              <span className="hidden sm:inline">Run all tests</span>
              <span className="sm:hidden">Run all</span>
            </button>

            {/* Compare models — amber tint, "analyse" semantic. */}
            <CompareModelsButton
              size="header"
              label={
                <>
                  <span className="hidden sm:inline">Compare models</span>
                  <span className="sm:hidden">Compare</span>
                </>
              }
              isConnectionUnverified={isConnectionUnverified}
              isBenchmarkDisabled={isBenchmarkDisabled}
              onClick={() => {
                setBenchmarkTestSubset(null);
                setBenchmarkDialogOpen(true);
              }}
            />
          </div>

          {/* Right group: add-more-tests buttons. */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {renderAddTestControl()}
            {/* Create test / Bulk upload (new tests, auto-attached to this agent) */}
            {renderNewTestButtons()}
          </div>
        </div>
      )}

      {/* Tests List / Loading / Error / Empty State */}
      {/* Keep the spinner up not just while the agent's tests load, but also
          — when the agent has no tests — until the `/tests` library prefetch
          settles. The empty state's "Add test" affordance depends on that
          prefetch (which only starts once we know the agent list is empty),
          so showing the empty state before it resolves makes it briefly look
          like there are no tests available to add. */}
      {agentTestsLoading ||
      (!agentTestsError && agentTests.length === 0 && !allTestsAttempted) ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <div className="flex items-center gap-3">
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
        </div>
      ) : agentTestsError ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <p className="text-sm md:text-base text-red-500 mb-2">
            {agentTestsError}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm md:text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : agentTests.length === 0 &&
        !pastRunsLoading &&
        pastRuns.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
          <div className="w-12 md:w-14 h-12 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
            <svg
              className="w-7 h-7 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 3h6v2h-1v4.5l4.5 7.5c.5.83.5 1.5-.17 2.17-.67.67-1.34.83-2.33.83H8c-1 0-1.67-.17-2.33-.83-.67-.67-.67-1.34-.17-2.17L10 9.5V5H9V3zm3 8.5L8.5 17h7L12 11.5z" />
            </svg>
          </div>
          <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
            No tests attached
          </h3>
          <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center max-w-md">
            This agent doesn&apos;t have any tests attached to it.
            {allTestsFetched && allTests.length === 0
              ? " Create a new test or upload tests from a CSV file to get started."
              : " Add an existing test or create a new one."}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
            {/* Only show the attach-existing button when the user actually
                has tests to attach — otherwise the dropdown is empty and
                the affordance is misleading. */}
            {/* Hide Add-test only when we've confirmed the library is
                empty. On a fetch failure (`allTestsAttempted && !allTestsFetched`)
                leave it visible — clicking it re-fetches via the
                dropdown's own effect. */}
            {(allTests.length > 0 || (allTestsAttempted && !allTestsFetched)) &&
              renderAddTestControl()}
            {renderNewTestButtons()}
          </div>
        </div>
      ) : agentTests.length === 0 ? (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 border border-border rounded-xl p-6 md:p-10 flex flex-col items-center justify-center bg-muted/20 min-h-[220px] md:min-h-[280px]">
              <div className="w-12 md:w-14 h-12 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
                <svg
                  className="w-7 h-7 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path d="M9 3h6v2h-1v4.5l4.5 7.5c.5.83.5 1.5-.17 2.17-.67.67-1.34.83-2.33.83H8c-1 0-1.67-.17-2.33-.83-.67-.67-.67-1.34-.17-2.17L10 9.5V5H9V3zm3 8.5L8.5 17h7L12 11.5z" />
                </svg>
              </div>
              <h3 className="text-base md:text-lg font-semibold text-foreground mb-1 text-center">
                No tests attached
              </h3>
              <p className="text-sm md:text-base text-muted-foreground text-center max-w-md mb-0">
                This agent doesn&apos;t have any tests linked right now.
                {allTestsFetched && allTests.length === 0
                  ? " Create a new test or upload tests in bulk."
                  : " Add an existing test or create a new one."}
              </p>
              <div className="flex flex-wrap justify-center gap-2 md:gap-3 mt-3 md:mt-4 w-full">
                {/* Hide Add-test only when we've confirmed the library is
                empty. On a fetch failure (`allTestsAttempted && !allTestsFetched`)
                leave it visible — clicking it re-fetches via the
                dropdown's own effect. */}
                {(allTests.length > 0 ||
                  (allTestsAttempted && !allTestsFetched)) &&
                  renderAddTestControl()}
                {renderNewTestButtons()}
              </div>
            </div>
          </div>
          {pastRunsPanel}
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row gap-4 md:gap-6">
          {/* Left Panel - Tests Table */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search input with inline match-mode selector — full width so
                long test names have room to wrap; the type filter sits below
                it on its own row. */}
            <SearchModeInput
              value={testsSearchQuery}
              onChange={setTestsSearchQuery}
              mode={testsSearchMode}
              onModeChange={setTestsSearchMode}
              placeholder="Search tests"
              className="mb-3 md:mb-4"
            />
            {/* Type filter — iOS-style segmented control. Visually
                differentiated from the action buttons in the page header
                (rectangular, h-9/h-10, foreground/border styling) by
                using a muted pill track with smaller rounded chips, a
                leading "Filter" label, and a softer height. Sits on its
                own row below the search bar. */}
            <div className="flex items-center gap-2 mb-3 md:mb-4">
              <svg
                className="w-3.5 h-3.5 text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 4.5h18M6 12h12M10.5 19.5h3"
                />
              </svg>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Type
              </span>
              <TestTypeFilter
                value={typeFilter}
                onChange={(value) => {
                  setTypeFilter(value);
                  // Drop any selection that no longer matches the new
                  // filter so the bulk-action counts don't drift from
                  // what's visible.
                  setSelectedTestUuids((prev) => {
                    if (prev.size === 0) return prev;
                    const next = new Set<string>();
                    for (const t of agentTests) {
                      if (!prev.has(t.uuid)) continue;
                      if (value !== "all" && t.type !== value) continue;
                      next.add(t.uuid);
                    }
                    return next;
                  });
                }}
              />
            </div>

            <p className="text-sm text-muted-foreground mb-3 md:mb-4">
              {filteredAgentTests.length}{" "}
              {filteredAgentTests.length === 1 ? "test" : "tests"}
            </p>

            {/* Bulk-action toolbar — sits immediately above the table when
                at least one row is selected. Modelled on the same pattern
                as the human-alignment items table so the two surfaces
                feel consistent: a muted strip with an "N selected"
                count on the left and unprefixed action buttons on the
                right (count is on the strip, not duplicated per button). */}
            {selectedTestUuids.size > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-md border border-border bg-muted/30 px-3 py-2 mb-3 md:mb-4">
                <span className="text-sm">
                  <span className="font-medium">{selectedTestUuids.size}</span>{" "}
                  {selectedTestUuids.size === 1 ? "test" : "tests"} selected
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelectedTestUuids(new Set())}
                    className="h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => openBulkDeleteDialog("remove")}
                    title="Detach from this agent only — the test stays in your library"
                    className="h-8 px-3 rounded-md text-sm font-medium border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                  <button
                    onClick={() => openBulkDeleteDialog("permanent")}
                    title="Permanently delete from your test library"
                    className="h-8 px-3 rounded-md text-sm font-medium bg-red-700 text-white hover:bg-red-800 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                  <CompareModelsButton
                    size="bulk"
                    label="Compare"
                    isConnectionUnverified={isConnectionUnverified}
                    isBenchmarkDisabled={isBenchmarkDisabled}
                    onClick={() => {
                      const selected = agentTests.filter((t) =>
                        selectedTestUuids.has(t.uuid),
                      );
                      if (selected.length === 0) return;
                      setBenchmarkTestSubset(selected);
                      setBenchmarkDialogOpen(true);
                      setSelectedTestUuids(new Set());
                    }}
                  />
                  <button
                    onClick={() => {
                      const selected = agentTests.filter((t) =>
                        selectedTestUuids.has(t.uuid),
                      );
                      if (selected.length === 0) return;
                      // Keep the ticked rows if the run was diverted (verify
                      // gate, row limit); they clear once a run really starts,
                      // including after a resume from the verify gate.
                      startRun(selected, false, () =>
                        setSelectedTestUuids(new Set()),
                      );
                    }}
                    className="h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background transition-opacity flex items-center gap-1.5 hover:opacity-90 cursor-pointer"
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
                        d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"
                      />
                    </svg>
                    Run
                  </button>
                </div>
              </div>
            )}

            {/* Tests Table */}
            {filteredAgentTests.length === 0 ? (
              <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
                <p className="text-sm md:text-base text-muted-foreground">
                  No tests match your search
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block border border-border rounded-xl overflow-hidden">
                  {/* The list scrolls on its own so the search, filters, and
                      surrounding page chrome stay in place for long test
                      lists; the header is pinned to the top via `sticky` and
                      given an opaque background so rows don't show through. */}
                  <div className="overflow-y-auto max-h-[60vh]">
                    {/* Table Header */}
                    <div className="grid grid-cols-[40px_minmax(0,1fr)_120px_auto_auto_auto] gap-4 px-4 py-2 border-b border-border bg-background sticky top-0 z-10">
                      <div className="flex items-center">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="cursor-pointer"
                          title="Select all"
                        >
                          <TestCheckbox
                            checked={
                              selectedTestUuids.size ===
                                filteredAgentTests.length &&
                              filteredAgentTests.length > 0
                            }
                            hoverBorder
                          />
                        </button>
                      </div>
                      <div className="text-sm font-medium text-muted-foreground">
                        Name
                      </div>
                      <div className="text-sm font-medium text-muted-foreground">
                        Type
                      </div>
                      <div className="w-8"></div>
                      <div className="w-8"></div>
                      <div className="w-8"></div>
                    </div>
                    {/* Table Body */}
                    {filteredAgentTests.map((test) => (
                      <div
                        key={test.uuid}
                        onClick={() => openEditTest(test.uuid)}
                        className="grid grid-cols-[40px_minmax(0,1fr)_120px_auto_auto_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                      >
                        {/* Checkbox */}
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTestSelection(test.uuid);
                            }}
                            className="cursor-pointer"
                            title="Select test"
                          >
                            <TestCheckbox
                              checked={selectedTestUuids.has(test.uuid)}
                              hoverBorder
                            />
                          </button>
                        </div>
                        {/* Name Column */}
                        <div className="flex items-center min-w-0">
                          <span className="text-sm font-medium text-foreground overflow-x-auto whitespace-nowrap">
                            {test.name}
                          </span>
                        </div>
                        {/* Type Column with Icon */}
                        <div className="flex items-center gap-2">
                          {test.type === "tool_call" ? (
                            <svg
                              className="w-4 h-4 text-muted-foreground flex-shrink-0"
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
                          ) : (
                            <svg
                              className="w-4 h-4 text-muted-foreground flex-shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                          <span className="text-sm text-muted-foreground">
                            {testTypeLabel(test.type)}
                          </span>
                        </div>
                        {/* Run Button */}
                        <div className="flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRun([test], false);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                            title="Run test"
                          >
                            <svg
                              className="w-4 h-4"
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
                          </button>
                        </div>
                        {/* Duplicate Button — opens the create dialog pre-filled
                          from this test; nothing is saved until submit. */}
                        <div className="flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDuplicateTest(test);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                            title="Duplicate test"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                              />
                            </svg>
                          </button>
                        </div>
                        {/* Delete Button — opens a dialog whose checkbox upgrades the
                          remove-from-agent action to a permanent library delete. */}
                        <div className="flex items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteDialog(test, "remove");
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete test"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
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
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden space-y-3 overflow-y-auto max-h-[60vh]">
                  {filteredAgentTests.map((test) => (
                    <div
                      key={test.uuid}
                      onClick={() => openEditTest(test.uuid)}
                      className="border border-border rounded-xl p-3 bg-background hover:bg-muted/20 transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTestSelection(test.uuid);
                            }}
                            className="mt-0.5 cursor-pointer"
                            title="Select test"
                          >
                            <TestCheckbox
                              checked={selectedTestUuids.has(test.uuid)}
                              hoverBorder
                            />
                          </button>
                          <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-medium text-foreground truncate">
                              {test.name}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {testTypeLabel(test.type)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startRun([test], false);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                            title="Run test"
                          >
                            <svg
                              className="w-4 h-4"
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
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDuplicateTest(test);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
                            title="Duplicate test"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openDeleteDialog(test, "remove");
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                            title="Delete test"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.5}
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
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {pastRunsPanel}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={
          deleteDialogOpen && (!!testToDelete || testsToDeleteBulk.length > 0)
        }
        onClose={closeDeleteDialog}
        onConfirm={handleRemoveTest}
        title={
          deleteMode === "permanent"
            ? testsToDeleteBulk.length > 0
              ? "Delete tests permanently"
              : "Delete test"
            : testsToDeleteBulk.length > 0
              ? "Remove tests"
              : "Remove test"
        }
        message={
          deleteMode === "permanent"
            ? testsToDeleteBulk.length > 0
              ? `Are you sure you want to permanently delete ${testsToDeleteBulk.length} test${testsToDeleteBulk.length > 1 ? "s" : ""} from your library? This will remove them from every agent and cannot be undone.`
              : `Permanently deleting this test will remove it from every agent that uses it and cannot be undone.`
            : testsToDeleteBulk.length > 0
              ? `Are you sure you want to remove ${testsToDeleteBulk.length} test${testsToDeleteBulk.length > 1 ? "s" : ""} from this agent?`
              : `Are you sure you want to remove this test from this agent? It will stay in your test library and on any other agents that use it.`
        }
        // Keep confirmText a single word — the dialog auto-suffixes "ing..." while
        // submitting by stripping a trailing 'e', which only works on one-token labels.
        confirmText={deleteMode === "permanent" ? "Delete" : "Remove"}
        isDeleting={isDeleting}
        extraContent={
          // Checkbox only on single-test deletes. Bulk deletes still pick their
          // mode from the two top-bar buttons.
          testToDelete && testsToDeleteBulk.length === 0 ? (
            <label className="flex items-start gap-2.5 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteMode === "permanent"}
                onChange={(e) =>
                  setDeleteMode(e.target.checked ? "permanent" : "remove")
                }
                disabled={isDeleting}
                className="mt-0.5 w-4 h-4 accent-red-600 cursor-pointer flex-shrink-0 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-foreground">
                Also delete this test permanently from my test library
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Removes the test from every agent that uses it
                </span>
              </span>
            </label>
          ) : null
        }
      />

      {/* Create/edit test dialog. In create mode, submits via POST
          /tests/bulk with agent_uuids: [agentUuid] so the new test
          auto-attaches to this agent in one call. In edit mode (when
          editingTestUuid is set), submits via PUT /tests/{uuid}. */}
      {createDialogOpen && (
        <AddTestDialog
          isOpen={createDialogOpen}
          onClose={() => {
            setCreateDialogOpen(false);
            resetTestDialog();
          }}
          isEditing={!!editingTestUuid}
          isLoading={isLoadingTest}
          isCreating={isCreating}
          createError={createError}
          nameError={nameConflictError}
          testName={newTestName}
          setTestName={(name) => {
            setNewTestName(name);
            if (nameConflictError) setNameConflictError(null);
          }}
          validationAttempted={validationAttempted}
          onSubmit={editingTestUuid ? updateTest : createTestForAgent}
          initialTab={initialTab}
          initialConfig={initialConfig}
          initialEvaluators={initialEvaluators}
          agentEvaluatorUuids={agentEvaluators.map((e) => e.uuid)}
          agentEvaluatorsPending={!agentEvaluatorsLoaded}
          onRun={() => {
            // Run the already-saved version of the test being edited (the
            // "run directly" / "discard and run" path). Build the run target
            // from the open test's uuid — no list lookup — then close and run.
            if (!editingTestUuid) return;
            const runTest = buildTestToRun({
              uuid: editingTestUuid,
              name: newTestName.trim(),
              type: initialConfig?.evaluation.type ?? "response",
              config: initialConfig ?? {},
            });
            closeTestDialogAfterSave();
            runSavedTest(runTest);
          }}
        />
      )}

      {/* Shown on top of the still-open AddTestDialog after a successful save.
          The test is already persisted; this only asks about agent defaults. */}
      {agentDefaultsPrompt && agentDefaultsPrompt.length > 0 && (
        <AgentDefaultsPromptDialog
          evaluators={agentDefaultsPrompt}
          isSaving={isAttachingDefaults}
          error={agentDefaultsError}
          onDismiss={dismissAgentDefaultsPrompt}
          onConfirm={confirmAddAgentDefaults}
        />
      )}

      {/* Bulk-upload modal locked to this agent. The agent picker is
          hidden and `agent_uuids: [agentUuid]` is sent with the upload. */}
      <BulkUploadTestsModal
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          fetchAgentTests();
        }}
        lockedAgentUuid={agentUuid}
      />

      {/* Test Runner Dialog */}
      <TestRunnerDialog
        isOpen={testRunnerOpen}
        onClose={() => {
          setTestRunnerOpen(false);
          setTestRunTaskId(undefined);
        }}
        agentName={agentName}
        taskId={testRunTaskId}
        onRerun={handleRerunTests}
      />

      {/* Verify-to-run gate for unverified connection agents. */}
      <VerifyToRunDialog
        isOpen={verifyToRunOpen}
        agentName={agentName}
        isVerifying={verify.isVerifying}
        error={verify.verifyError}
        sampleResponse={verify.verifySampleResponse}
        onVerify={handleVerifyToRun}
        onGoToConnection={goToConnectionSettings}
        onClose={closeVerifyToRun}
      />

      {/* Benchmark Dialog */}
      <BenchmarkDialog
        isOpen={benchmarkDialogOpen}
        onClose={() => {
          setBenchmarkDialogOpen(false);
          setBenchmarkTestSubset(null);
        }}
        agentUuid={agentUuid}
        agentName={agentName}
        tests={benchmarkTestSubset ?? agentTests}
        onBenchmarkCreated={handleBenchmarkCreated}
        agentType={agentType}
        benchmarkModelsVerified={benchmarkModelsVerified}
        benchmarkProvider={benchmarkProvider}
      />

      {/* View Past Test Results Dialog */}
      {selectedPastRun && selectedPastRun.type === "llm-unit-test" && (
        <TestRunnerDialog
          isOpen={viewingTestResults}
          onClose={() => {
            setViewingTestResults(false);
            setSelectedPastRun(null);
          }}
          agentName={agentName}
          taskId={selectedPastRun.uuid}
          initialRunStatus={selectedPastRun.status}
          onStatusUpdate={handleRunStatusUpdate}
          onRerun={handleRerunTests}
        />
      )}

      {/* View Past Benchmark Results Dialog */}
      {selectedPastRun && selectedPastRun.type === "llm-benchmark" && (
        <BenchmarkResultsDialog
          isOpen={viewingBenchmarkResults}
          onClose={() => {
            setViewingBenchmarkResults(false);
            setSelectedPastRun(null);
          }}
          agentUuid={agentUuid}
          agentName={agentName}
          testUuids={[]}
          testNames={[]}
          models={[]}
          taskId={selectedPastRun.uuid}
          onRerun={handleRerunBenchmark}
        />
      )}

      {/* Direct Benchmark Rerun Dialog — fresh benchmark of the same models and
          test subset, skipping the model picker. */}
      <BenchmarkRerunDialog
        config={benchmarkRerun.config}
        rerunKey={benchmarkRerun.key}
        onClose={benchmarkRerun.clear}
        onBenchmarkCreated={(taskId) => handleBenchmarkCreated(taskId)}
        onRerun={benchmarkRerun.start}
      />
    </div>
  );
}
