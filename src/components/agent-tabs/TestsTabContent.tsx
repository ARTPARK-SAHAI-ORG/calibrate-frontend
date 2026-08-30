"use client";
import { reportError } from "@/lib/reportError";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  useAccessToken,
  useAgentTests,
  useMaxRowsPerEval,
  useDialogUrlParam,
  usePageSize,
} from "@/hooks";
import {
  fetchAgentTestsPage,
  fetchAllAgentTests,
  unlinkTestsFromAgent,
} from "@/lib/agentTestsApi";
import { ConfirmDialog, ServerPaginatedListBar } from "@/components/ui";
import {
  SearchModeInput,
  type SearchMode,
} from "@/components/ui/SearchModeInput";
import { getDefaultHeaders, unwrapList } from "@/lib/api";
import { buildTestToRun } from "@/lib/testRun";
import { startTestRunOrNotify } from "@/lib/testRunApi";

import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TestRunnerDialog } from "@/components/TestRunnerDialog";
import { VerifyConnectionDialog } from "@/components/VerifyConnectionDialog";
import { BenchmarkDialog } from "@/components/BenchmarkDialog";
import {
  BenchmarkRerunDialog,
  useBenchmarkRerun,
} from "@/components/BenchmarkRerunDialog";
import { CompareModelsButton } from "@/components/agent-tabs/CompareModelsButton";
import { EnableBenchmarkDialog } from "@/components/agent-tabs/EnableBenchmarkDialog";
import { SpinnerIcon } from "@/components/icons";
import {
  AddTestDialog,
  TestConfig,
  EvaluatorRefPayload,
  AttachedEvaluatorInit,
  EvaluatorVariableDef,
} from "@/components/AddTestDialog";
import { BulkUploadTestsModal } from "@/components/BulkUploadTestsModal";
import type { InputFieldType } from "@/components/CustomFieldsEditor";
import { AgentDefaultsPromptDialog } from "@/components/agent-tabs/AgentDefaultsPromptDialog";
import { useAgentDefaultsPrompt } from "@/hooks/useAgentDefaultsPrompt";
import { showLimitToast } from "@/constants/limits";
import { testTypeLabel } from "@/lib/testTypes";
import {
  TestTypeFilter,
  matchesTestTypeFilter,
  type TestTypeFilterValue,
} from "@/components/TestTypeFilter";
import {
  readBulkNameConflictMessage,
  readNameConflictMessage,
} from "@/lib/parseBackendError";
import { type EvaluatorData, fetchAgentEvaluators } from "@/lib/evaluatorApi";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call" | "conversation" | "general";
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
  // Whether this tab is the one showing. Only the tab on screen acts on
  // `?runId=`, so a run opened here and a run opened on the Evaluations tab
  // can never open two windows for the same run at once.
  isActive?: boolean;
  agentName?: string;
  agentType?: "agent" | "connection";
  connectionVerified?: boolean;
  supportsBenchmark?: boolean;
  benchmarkModelsVerified?: Record<
    string,
    { verified: boolean; verified_at: string; error: string | null }
  >;
  benchmarkProvider?: string;
  // The connection agent's custom fields (config.default_inputs). Forwarded to
  // the test dialog so a test case can override them. Unset for build agents.
  agentDefaultInputs?: Record<string, unknown>;
  // Field-type map for those custom fields (config.default_input_types), so a
  // number field with an empty default still validates as a number.
  agentDefaultInputTypes?: Record<string, InputFieldType>;
  // Called after a passing endpoint check so the parent flips connectionVerified true.
  onConnectionVerified?: () => void;
  // Called when the user opts to fix the connection; parent switches to the Connection tab.
  onGoToConnectionSettings?: () => void;
  // Called when someone turns benchmarking on from here by picking a provider.
  // The parent saves it onto the agent's connection settings. When it is not
  // given, Compare models stays disabled for an agent with benchmarking off.
  onEnableBenchmark?: (provider: string) => void | Promise<void>;
  // Called the moment a run or benchmark is created here. The runs list lives
  // in the Evaluations tab, so the parent uses this to have that tab pick the
  // new one up rather than showing a stale list.
  onRunStarted?: () => void;
  // Called when the run window is closed here. The parent takes the reader to
  // the Evaluations tab, where the run they just watched is listed.
  onRunWindowClosed?: () => void;
  // Called after the agent defaults prompt attaches an evaluator here. The
  // Evaluators tab loads its list once, so the parent uses this to have that
  // tab pick the newly attached evaluator up rather than showing a stale list.
  onAgentDefaultsAttached?: () => void;
  // Whether the agent under test is a conversation agent or a general one.
  // Forwarded to AddTestDialog / BulkUploadTestsModal to shape their evaluator
  // options; both default to "conversation" when unset.
  agentNature?: "conversation" | "general";
};

// Attaching a test that already exists is hidden for now: new tests come from
// Create test and Bulk upload. Flip this to true to bring the control back.
const SHOW_ADD_EXISTING_TEST = false;

// Which test types carry their own evaluators. "response" and "conversation"
// are a conversation agent's; "general" is a general agent's single
// input/output test. Only "tool_call" is judged by its tool calls instead.
// One place, so the create and update paths cannot drift apart.
const carriesEvaluators = (type: string) =>
  type === "response" || type === "conversation" || type === "general";

export function TestsTabContent({
  agentUuid,
  isActive = true,
  agentName = "Agent",
  agentType,
  connectionVerified,
  supportsBenchmark,
  benchmarkModelsVerified,
  benchmarkProvider,
  agentDefaultInputs,
  agentDefaultInputTypes,
  onConnectionVerified,
  onGoToConnectionSettings,
  onEnableBenchmark,
  onRunStarted,
  onRunWindowClosed,
  onAgentDefaultsAttached,
  agentNature,
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
  const agentDefaults = useAgentDefaultsPrompt({
    agentUuid,
    accessToken: backendAccessToken,
    onEvaluatorsRefreshed: setAgentEvaluators,
    onAttached: async () => {
      await loadAgentEvaluators();
      onAgentDefaultsAttached?.();
    },
    // The test is already saved when the prompt shows, so answering it either
    // way is the point at which the test dialog behind it can close.
    onSettled: () => closeTestDialogAfterSave(),
  });
  // The agent's tests, one page at a time. The backend does the paging and
  // the name search, so the count and the pages cover every matching test and
  // not just the ones on screen.
  const [pageSize, setPageSize] = usePageSize();
  // The search runs on the backend, so wait for a pause in typing before
  // asking for a new page.
  const [testsSearchQuery, setTestsSearchQuery] = useState("");
  const [testsSearchMode, setTestsSearchMode] =
    useState<SearchMode>("contains");
  // Which kind of test to list. The backend filters before it cuts the page,
  // so the count and the pages cover every test of that kind.
  const [typeFilter, setTypeFilter] = useState<TestTypeFilterValue>("all");
  const [testsSearch, setTestsSearch] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(
      () => setTestsSearch(testsSearchQuery),
      300,
    );
    return () => window.clearTimeout(handle);
  }, [testsSearchQuery]);
  const {
    items: agentTests,
    total: agentTestsTotal,
    loadedQ: loadedTestsSearch,
    offset: testsOffset,
    isLoading: agentTestsLoading,
    error: agentTestsError,
    refetch: fetchAgentTests,
    goToFirstPage: showFirstTestsPage,
    handleRemoved: handleTestsRemoved,
    hasPrev: hasPrevTestsPage,
    hasNext: hasNextTestsPage,
    prevPage: prevTestsPage,
    nextPage: nextTestsPage,
  } = useAgentTests({
    agentUuid,
    accessToken: backendAccessToken,
    pageSize,
    q: testsSearch,
    qMode: testsSearchMode,
    type: typeFilter,
  });

  // How many tests this agent has in all. `agentTestsTotal` counts only the
  // ones matching the search and the type, so it cannot answer "does this
  // agent have any tests" or "how many would Run all run": both of those are
  // about every linked test. The last count taken with nothing filtered is
  // that number, so it is remembered while a filter is on.
  const isFiltered = typeFilter !== "all" || testsSearch.trim() !== "";
  const linkedTestsTotalRef = useRef(0);
  if (!isFiltered && !agentTestsLoading) {
    linkedTestsTotalRef.current = agentTestsTotal;
  }
  const linkedTestsTotal = isFiltered
    ? linkedTestsTotalRef.current
    : agentTestsTotal;

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
   * "remove": detach test from this agent only
   * (POST /agent-tests/bulk-unlink).
   * "permanent": delete the test record itself (DELETE /tests/{uuid}); affects all agents.
   */
  const [deleteMode, setDeleteMode] = useState<"remove" | "permanent">(
    "remove",
  );

  // Test runner dialog state. The dialog is purely a viewer: it is open when
  // we hold the id of a run that was already created here.
  //
  // The run is named in the address as `?runId=<uuid>`, so a reload reopens
  // the same run and the link can be shared. The Evaluations tab names its own
  // open run the same way; only the tab on screen acts on the param, so a run
  // opened here never opens a second, hidden window there.
  const [openTestRunId, setOpenTestRunId] = useState<string | null>(null);
  const { setParam: setRunIdParam } = useDialogUrlParam({
    param: "runId",
    enabled: isActive,
    onOpen: (uuid) => setOpenTestRunId(uuid),
    onClose: () => setOpenTestRunId(null),
  });
  const openTestRun = (uuid: string) => {
    setOpenTestRunId(uuid);
    setRunIdParam(uuid);
  };
  const closeTestRun = () => {
    setOpenTestRunId(null);
    setRunIdParam(null);
    onRunWindowClosed?.();
  };
  // Key of the run control whose "create run" call is in flight ("all",
  // "bulk", or a test uuid). Non-null disables every run control.
  const [startingRun, setStartingRun] = useState<string | null>(null);
  // Set when a Run was clicked on an unverified connection agent: holds the
  // run the user asked for so it can start once the verify dialog passes.
  const [pendingRun, setPendingRun] = useState<{
    tests: TestData[];
    allLinked: boolean;
    runKey: string;
  } | null>(null);

  // Benchmark dialog state
  const [runAllConfirmOpen, setRunAllConfirmOpen] = useState(false);
  const [benchmarkDialogOpen, setBenchmarkDialogOpen] = useState(false);
  // The tests the benchmark dialog compares the models on: the ticked rows
  // for the "Compare" bulk action, and nothing for the header's "Compare
  // models", which means every test linked to the agent. The backend runs
  // them all when it is sent no test ids, so comparing every test never needs
  // the list itself.
  const [benchmarkTests, setBenchmarkTests] = useState<TestData[]>([]);

  const isConnectionUnverified =
    agentType === "connection" && connectionVerified === false;
  const isBenchmarkDisabled =
    agentType === "connection" && supportsBenchmark !== true;
  // Benchmarking is off, but it can be turned on from here: Compare models
  // stays clickable and asks for the provider first instead of sending the
  // reader to the Connection tab.
  const canEnableBenchmarkHere = isBenchmarkDisabled && !!onEnableBenchmark;
  // Set when Compare models was clicked with benchmarking off: holds the tests
  // to compare so they survive the provider question.
  const [enableBenchmarkOpen, setEnableBenchmarkOpen] = useState(false);

  // Direct benchmark rerun: starts a fresh benchmark (no picker) with the same
  // models + test subset as a completed run and shows it live.
  const benchmarkRerun = useBenchmarkRerun();

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
  const maybePromptAgentDefaults = (
    evaluators: EvaluatorRefPayload[],
  ): Promise<boolean> =>
    agentDefaults.promptFor(
      evaluators.map((e) => e.evaluator_uuid),
      // The cached list keeps the offer alive when the fresh read fails.
      { fallbackAttached: new Set(agentEvaluators.map((e) => e.uuid)) },
    );

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

  // Every test already linked to this agent, for the attach-existing list to
  // leave out. Fetched when that list opens, since the table itself only ever
  // holds one page.
  const [linkedTestUuids, setLinkedTestUuids] = useState<string[]>([]);
  useEffect(() => {
    if (!showTestDropdown || !backendAccessToken) return;
    let cancelled = false;
    fetchAllAgentTests(backendAccessToken, agentUuid)
      .then((tests) => {
        if (!cancelled) setLinkedTestUuids(tests.map((t) => t.uuid));
      })
      .catch((err) => {
        // Worst case the list offers a test that is already linked; adding it
        // again is a no-op on the backend.
        reportError("Error fetching linked tests:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [showTestDropdown, backendAccessToken, agentUuid]);

  // (2) Fetch when the agent's tests list is known to be empty, so the
  // empty state can decide whether to show the Add-test button. Gated
  // on `allTestsAttempted` so a failure doesn't trigger a tight retry
  // loop — see comment on the state declarations above.
  useEffect(() => {
    if (
      !agentTestsLoading &&
      linkedTestsTotal === 0 &&
      !allTestsAttempted &&
      !allTestsLoading &&
      backendAccessToken
    ) {
      fetchAllTests();
    }
  }, [
    agentTestsLoading,
    linkedTestsTotal,
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

  // Filter out tests already attached to the agent. The table shows one page
  // at a time, so the whole linked list is fetched separately here — a test
  // linked but sitting on another page must still be left out.
  const agentTestUuids = new Set(linkedTestUuids);
  const availableTests = allTests.filter(
    (test) => !agentTestUuids.has(test.uuid),
  );

  // Filter available tests by type AND search query. Both apply together (AND),
  // so the select-all checkbox — which keys off `filteredAvailableTests` — only
  // picks rows matching the active type filter and query.
  const filteredAvailableTests = availableTests.filter((test) => {
    if (!matchesTestTypeFilter(test.type, dropdownTypeFilter)) return false;
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

  const testsPageCount =
    pageSize > 0 ? Math.max(1, Math.ceil(agentTestsTotal / pageSize)) : 1;
  const testsCurrentPage = Math.floor(testsOffset / pageSize) + 1;

  // Ticks are per page: the bulk actions can only act on the rows in hand, so
  // leaving them set while the reader turns the page would run or remove
  // fewer tests than the count promises. "Every test matching" is the way to
  // act on more than one page, and it is dropped here too, because a filter
  // change redefines what it stands for.
  useEffect(() => {
    setSelectedTestUuids(new Set());
    setSelectAllMatching(false);
  }, [testsOffset, testsSearch, testsSearchMode, typeFilter, pageSize]);

  /**
   * Every test matching the search and the type is selected, not just the
   * ticked rows on this page. Offered once every row on the page is ticked
   * and there is more than one page. Any per-row tick drops it, since the
   * actions cannot say "all of them except this one".
   */
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const selectedTestCount = selectAllMatching
    ? agentTestsTotal
    : selectedTestUuids.size;

  /**
   * The tests a bulk action should act on. `allLinked` says the action covers
   * every test linked to the agent, which Run and Compare send as no test ids
   * at all; the tests themselves are only fetched when an action needs their
   * ids, which is what Remove needs.
   */
  const selectedTestsForAction = async (): Promise<{
    tests: TestData[];
    allLinked: boolean;
  }> => {
    if (!selectAllMatching) {
      return {
        tests: agentTests.filter((t) => selectedTestUuids.has(t.uuid)),
        allLinked: false,
      };
    }
    if (!isFiltered) return { tests: [], allLinked: true };
    if (!backendAccessToken) return { tests: [], allLinked: false };
    // One page holding every match, so the action names them all.
    const page = await fetchAgentTestsPage(backendAccessToken, {
      agentUuid,
      limit: agentTestsTotal,
      offset: 0,
      q: testsSearch,
      qMode: testsSearchMode,
      type: typeFilter,
    });
    return { tests: unwrapList<TestData>(page), allLinked: false };
  };

  /** The ids a removal should name, fetching them when the reader chose every
   *  test rather than ticking rows. */
  const selectedTestUuidsForRemoval = async (): Promise<string[]> => {
    if (!selectAllMatching) return Array.from(selectedTestUuids);
    if (!backendAccessToken) return [];
    const { tests, allLinked } = await selectedTestsForAction();
    const all = allLinked
      ? await fetchAllAgentTests(backendAccessToken, agentUuid)
      : tests;
    return all.map((t) => t.uuid);
  };

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

  // Reads a plain-language message out of a failed link-tests-to-agent
  // response (POST /agent-tests, or /tests/bulk when it best-effort links
  // to this agent). The backend rejects the whole batch with a 400 when a
  // test's type doesn't match the agent's kind (e.g. a general test on a
  // conversation agent), so we try to recognise that case and word it for a
  // non-technical reader. Anything else, including a body we cannot read,
  // uses `fallback` rather than guessing at a mismatch.
  const readLinkTestsErrorMessage = async (
    response: Response,
    fallback: string,
  ): Promise<string> => {
    const typeMismatchMessage =
      "These tests can't be linked to this agent because their type doesn't match the agent's kind.";
    try {
      const data = (await response.clone().json()) as { detail?: unknown };
      const detail = typeof data?.detail === "string" ? data.detail : "";
      // Only claim a type mismatch when the backend actually says so. An
      // unreadable body (an HTML 502, a gateway timeout) tells us nothing
      // about types, and guessing sends the reader off to change test types
      // over what is really an outage.
      return /type|interaction|kind|nature|mismatch/i.test(detail)
        ? typeMismatchMessage
        : fallback;
    } catch {
      return fallback;
    }
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
        throw new Error(
          await readLinkTestsErrorMessage(
            response,
            "Failed to add tests to agent",
          ),
        );
      }

      // Refetch the agent's tests instead of locally splicing them in, so the
      // table reflects the backend's ordering rather than a hardcoded
      // top/bottom placement.
      setShowTestDropdown(false);
      setSearchQuery("");
      setDropdownTypeFilter("all");
      setSelectedAvailableUuids(new Set());
      // The newest links are at the top of the list, so show the first page.
      await showFirstTestsPage();
    } catch (err) {
      reportError("Error adding tests to agent:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to add tests to agent",
      );
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
      const usesEvaluators = carriesEvaluators(evalType);
      const testItem: {
        name: string;
        input?: string;
        conversation_history?: TestConfig["history"];
        evaluators?: EvaluatorRefPayload[];
        tool_calls?: NonNullable<TestConfig["evaluation"]["tool_calls"]>;
        inputs?: Record<string, unknown>;
      } = {
        name: newTestName.trim(),
        // Exactly one of the two: a general agent's test holds its single
        // input, a conversation agent's holds the history. Sending both, or
        // neither, is rejected by the backend.
        ...(typeof config.input === "string"
          ? { input: config.input }
          : { conversation_history: config.history }),
        ...(config.inputs &&
          Object.keys(config.inputs).length > 0 && { inputs: config.inputs }),
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
        throw new Error(
          await readLinkTestsErrorMessage(response, "Failed to create test"),
        );
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
      // A new test is at the top of the list, so show the first page.
      await showFirstTestsPage();
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

  // The one place a run is started from this tab: create it, show its pending
  // row, then open the dialog on the new run id. Pass `allLinked` to run every
  // test linked to the agent rather than the given subset.
  // `runKey` identifies the control that was clicked ("all", "bulk", or a test
  // uuid) so only that one shows a spinner while every run control is disabled.
  // Returns the new run id, or null if nothing started. Callers use that to
  // hold their state (e.g. keep the bulk selection) until the run is created.
  // Actually create and open the run. No verification check — the gate lives
  // in `launchTestRun` (and in the verify dialog's success handler).
  const startRunNow = async (
    tests: TestData[],
    allLinked = false,
    runKey = "all",
  ): Promise<string | null> => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return null;
    // Creating a run is a real, billed call. Ignore repeat clicks until the
    // in-flight one settles.
    if (startingRun !== null) return null;
    setStartingRun(runKey);
    try {
      const taskId = await startTestRunOrNotify(
        backendUrl,
        backendAccessToken,
        agentUuid,
        allLinked ? null : tests.map((t) => t.uuid),
      );
      if (!taskId) return null;
      onRunStarted?.();
      openTestRun(taskId);
      return taskId;
    } finally {
      setStartingRun(null);
    }
  };

  // The one gate every Run action funnels through. On an unverified connection
  // agent it holds the intent and opens the verify dialog instead of running.
  const launchTestRun = async (
    tests: TestData[],
    allLinked = false,
    runKey = "all",
  ): Promise<string | null> => {
    if (isConnectionUnverified) {
      setPendingRun({ tests, allLinked, runKey });
      return null;
    }
    return startRunNow(tests, allLinked, runKey);
  };

  // Open the test runner for a single just-saved test. Backing the dialog's
  // "Save and run" shortcut, it mirrors the row-level play action (run one
  // specific test, not the whole linked set). Skipped for an unverified
  // connection, matching where the shortcut is offered.
  const runSavedTest = (test: TestData) => {
    if (isConnectionUnverified) return;
    void launchTestRun([test], false, test.uuid);
  };

  // Test is already saved when this prompt is shown. Declining (Not now / X)
  // keeps the test but skips updating the agent's default evaluators.
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
        type: "response" | "tool_call" | "conversation" | "general";
        config: TestConfig;
        evaluators?: EvaluatorRefPayload[];
      } = {
        name: newTestName.trim(),
        type: config.evaluation.type,
        config: config,
      };
      if (carriesEvaluators(config.evaluation.type)) {
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
      const prompted = carriesEvaluators(config.evaluation.type)
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
    if (selectAllMatching) {
      // Leaving "every test matching": no action can say "all except this
      // one", so it collapses to this page's rows minus the one just
      // unticked, all of which were showing as ticked.
      const next = new Set(agentTests.map((t) => t.uuid));
      next.delete(uuid);
      setSelectedTestUuids(next);
      setSelectAllMatching(false);
      return;
    }
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
    if (selectAllMatching || selectedTestUuids.size === agentTests.length) {
      setSelectedTestUuids(new Set());
      setSelectAllMatching(false);
    } else {
      setSelectedTestUuids(new Set(agentTests.map((t) => t.uuid)));
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
  const openBulkDeleteDialog = async (
    mode: "remove" | "permanent" = "remove",
  ) => {
    if (selectedTestCount === 0) return;
    const uuids = await selectedTestUuidsForRemoval();
    if (uuids.length === 0) return;
    setTestToDelete(null);
    setTestsToDeleteBulk(uuids);
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
        // One call for the whole selection, however many were ticked.
        await unlinkTestsFromAgent(
          backendAccessToken as string,
          agentUuid,
          uuidsToRemove,
        );
      }

      const removedSet = new Set(actuallyDeleted);
      handleTestsRemoved(actuallyDeleted.length);
      // When deleting permanently, also drop the test from the "all tests"
      // dropdown so it doesn't reappear as available to add.
      if (deleteMode === "permanent") {
        setAllTests((prev) => prev.filter((t) => !removedSet.has(t.uuid)));
      }
      setSelectedTestUuids(new Set());
      setSelectAllMatching(false);
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

  return (
    <div className="flex flex-col">
      {/* Header — only shown when the agent has at least one test
          attached. Split into two groups: page-level "act on the tests"
          actions (Run all / Compare models) on the left, and "add more
          tests" actions (Add / Create / Bulk upload) on the right.
          Multi-select bulk actions (Run / Remove / Delete subset) live
          above the table in their own toolbar, not here. */}
      {linkedTestsTotal > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 md:mb-6">
          {/* Left group: act-on-the-tests buttons. */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {/* Run all tests — sky tint, "play" semantic. */}
            <div>
              <button
                data-tour="tests-run-all"
                onClick={() => {
                  if (linkedTestsTotal > maxRowsPerEval) {
                    showLimitToast(
                      `You can only run up to ${maxRowsPerEval} tests at a time.`,
                    );
                    return;
                  }
                  setRunAllConfirmOpen(true);
                }}
                disabled={startingRun !== null}
                aria-busy={startingRun === "all"}
                className={`h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border transition-colors flex items-center gap-2 bg-sky-500/12 border-sky-500/45 text-sky-950 dark:text-sky-100 disabled:opacity-50 ${
                  startingRun !== null
                    ? "cursor-not-allowed"
                    : "hover:bg-sky-500/22 dark:hover:bg-sky-500/18 cursor-pointer"
                }`}
              >
                {startingRun === "all" ? (
                  <SpinnerIcon className="w-4 h-4 animate-spin" />
                ) : (
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
                )}
                <span className="hidden sm:inline">Run all tests</span>
                <span className="sm:hidden">Run all</span>
              </button>
            </div>

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
              isBenchmarkDisabled={
                isBenchmarkDisabled && !canEnableBenchmarkHere
              }
              onClick={() => {
                // No tests named means every test linked to the agent.
                setBenchmarkTests([]);
                if (canEnableBenchmarkHere) {
                  setEnableBenchmarkOpen(true);
                  return;
                }
                setBenchmarkDialogOpen(true);
              }}
            />
          </div>

          {/* Right group: add-more-tests buttons. */}
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {SHOW_ADD_EXISTING_TEST && renderAddTestControl()}
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
      (!agentTestsError && linkedTestsTotal === 0 && !allTestsAttempted) ? (
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
      ) : linkedTestsTotal === 0 ? (
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
            {SHOW_ADD_EXISTING_TEST &&
              (allTests.length > 0 ||
                (allTestsAttempted && !allTestsFetched)) &&
              renderAddTestControl()}
            {renderNewTestButtons()}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Left Panel - Tests Table */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Search — the backend matches on the test name, so it covers
                every linked test and not only the page on screen. */}
            <SearchModeInput
              value={testsSearchQuery}
              onChange={setTestsSearchQuery}
              mode={testsSearchMode}
              onModeChange={setTestsSearchMode}
              placeholder="Search tests"
              className="mb-3 md:mb-4"
            />

            {/* Type filter. Like the search, the backend does the filtering,
                so the count and the pages cover every test of that kind. */}
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
              <TestTypeFilter value={typeFilter} onChange={setTypeFilter} />
            </div>

            {/* Bulk-action toolbar — sits immediately above the table when
                at least one row is selected. Modelled on the same pattern
                as the human-alignment items table so the two surfaces
                feel consistent: a muted strip with an "N selected"
                count on the left and unprefixed action buttons on the
                right (count is on the strip, not duplicated per button). */}
            {(selectedTestUuids.size > 0 || selectAllMatching) && (
              <div
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-md border px-3 py-2 mb-3 md:mb-4 transition-colors ${
                  selectAllMatching
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-border bg-muted/30"
                }`}
              >
                <div
                  className={`flex flex-wrap items-center gap-2 text-sm ${
                    selectAllMatching
                      ? "text-amber-700 dark:text-amber-300"
                      : ""
                  }`}
                >
                  <span>
                    <span className="font-medium">{selectedTestCount}</span>{" "}
                    {selectedTestCount === 1 ? "test" : "tests"} selected
                    {selectAllMatching && loadedTestsSearch ? (
                      <span className="opacity-80">
                        {" "}
                        matching &ldquo;{loadedTestsSearch}&rdquo;
                      </span>
                    ) : null}
                  </span>
                  {/* Ticking every row on the page only covers this page, so
                      offer the rest of the list when there is more of it. */}
                  {!selectAllMatching &&
                    agentTests.length > 0 &&
                    selectedTestUuids.size === agentTests.length &&
                    agentTestsTotal > agentTests.length && (
                      <button
                        onClick={() => setSelectAllMatching(true)}
                        className="inline-flex items-center h-7 px-2.5 rounded-md text-xs font-medium border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60 transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Select all {agentTestsTotal} test
                        {agentTestsTotal === 1 ? "" : "s"}
                        {testsSearch ? ` matching "${testsSearch}"` : ""}
                      </button>
                    )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      setSelectedTestUuids(new Set());
                      setSelectAllMatching(false);
                    }}
                    className="h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
                  <button
                    onClick={() => void openBulkDeleteDialog("remove")}
                    title="Detach from this agent only — the test stays in your library"
                    className="h-8 px-3 rounded-md text-sm font-medium border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                  <CompareModelsButton
                    size="bulk"
                    label="Compare"
                    isConnectionUnverified={isConnectionUnverified}
                    isBenchmarkDisabled={
                      isBenchmarkDisabled && !canEnableBenchmarkHere
                    }
                    onClick={async () => {
                      const { tests, allLinked } =
                        await selectedTestsForAction();
                      // No tests named means every test linked to the agent.
                      if (!allLinked && tests.length === 0) return;
                      setBenchmarkTests(allLinked ? [] : tests);
                      if (canEnableBenchmarkHere) {
                        setEnableBenchmarkOpen(true);
                      } else {
                        setBenchmarkDialogOpen(true);
                      }
                      setSelectedTestUuids(new Set());
                      setSelectAllMatching(false);
                    }}
                  />
                  <div>
                    <button
                      onClick={async () => {
                        if (selectedTestCount > maxRowsPerEval) {
                          showLimitToast(
                            `You can only run up to ${maxRowsPerEval} tests at a time.`,
                          );
                          return;
                        }
                        const { tests, allLinked } =
                          await selectedTestsForAction();
                        if (!allLinked && tests.length === 0) return;
                        // Clear the ticks only once the run has started, so the
                        // bar and its spinner stay up during the wait. A failed
                        // run keeps the selection so it can be retried.
                        const taskId = await launchTestRun(
                          tests,
                          allLinked,
                          "bulk",
                        );
                        if (taskId) {
                          setSelectedTestUuids(new Set());
                          setSelectAllMatching(false);
                        }
                      }}
                      disabled={startingRun !== null}
                      aria-busy={startingRun === "bulk"}
                      className={`h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background transition-opacity flex items-center gap-1.5 disabled:opacity-50 ${
                        startingRun !== null
                          ? "cursor-not-allowed"
                          : "hover:opacity-90 cursor-pointer"
                      }`}
                    >
                      {startingRun === "bulk" ? (
                        <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
                      ) : (
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
                      )}
                      Run
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1 pt-1">
              <ServerPaginatedListBar
                total={agentTestsTotal}
                offset={testsOffset}
                loadedCount={agentTests.length}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                currentPage={testsCurrentPage}
                pageCount={testsPageCount}
                onPrev={prevTestsPage}
                onNext={nextTestsPage}
                prevDisabled={!hasPrevTestsPage || agentTestsLoading}
                nextDisabled={!hasNextTestsPage || agentTestsLoading}
                itemNoun="test"
              />

              {/* Tests Table */}
              {agentTests.length === 0 ? (
                <div className="flex-1 border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
                  <p className="text-sm md:text-base text-muted-foreground">
                    {loadedTestsSearch || typeFilter !== "all"
                      ? "No tests match your search"
                      : "No tests attached"}
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
                      <div className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_32px_32px_32px] gap-4 px-4 py-2 border-b border-border bg-background sticky top-0 z-10">
                        <div className="flex items-center">
                          <button
                            type="button"
                            onClick={toggleSelectAll}
                            className="cursor-pointer"
                            title="Select all"
                          >
                            <TestCheckbox
                              checked={
                                selectedTestUuids.size === agentTests.length &&
                                agentTests.length > 0
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
                      {agentTests.map((test) => (
                        <div
                          key={test.uuid}
                          onClick={() => openEditTest(test.uuid)}
                          className="grid grid-cols-[40px_minmax(0,2fr)_minmax(0,1fr)_32px_32px_32px] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
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
                                void launchTestRun([test], false, test.uuid);
                              }}
                              disabled={startingRun !== null}
                              aria-busy={startingRun === test.uuid}
                              className={`w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 ${
                                startingRun !== null
                                  ? "cursor-not-allowed"
                                  : "cursor-pointer"
                              }`}
                              title="Run test"
                            >
                              {startingRun === test.uuid ? (
                                <SpinnerIcon className="w-4 h-4 animate-spin" />
                              ) : (
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
                              )}
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
                    {agentTests.map((test) => (
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
                                void launchTestRun([test], false, test.uuid);
                              }}
                              disabled={startingRun !== null}
                              aria-busy={startingRun === test.uuid}
                              className={`w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50 ${
                                startingRun !== null
                                  ? "cursor-not-allowed"
                                  : "cursor-pointer"
                              }`}
                              title="Run test"
                            >
                              {startingRun === test.uuid ? (
                                <SpinnerIcon className="w-4 h-4 animate-spin" />
                              ) : (
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
                              )}
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
          </div>
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
      />

      {/* Create/edit test dialog. In create mode, submits via POST
          /tests/bulk with agent_uuids: [agentUuid] so the new test
          auto-attaches to this agent in one call. In edit mode (when
          editingTestUuid is set), submits via PUT /tests/{uuid}. */}
      {createDialogOpen && (
        <AddTestDialog
          agentUuid={agentUuid}
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
          agentDefaultInputs={agentDefaultInputs}
          agentDefaultInputTypes={agentDefaultInputTypes}
          agentEvaluatorsPending={!agentEvaluatorsLoaded}
          agentNature={agentNature}
          showRunAfterSave={!isConnectionUnverified}
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
      {agentDefaults.prompt && agentDefaults.prompt.length > 0 && (
        <AgentDefaultsPromptDialog
          evaluators={agentDefaults.prompt}
          isSaving={agentDefaults.isSaving}
          error={agentDefaults.error}
          onDismiss={agentDefaults.dismiss}
          onConfirm={agentDefaults.confirm}
        />
      )}

      {/* Bulk-upload modal locked to this agent. The agent picker is
          hidden and `agent_uuids: [agentUuid]` is sent with the upload. */}
      <BulkUploadTestsModal
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onSuccess={() => {
          // Uploaded tests are at the top of the list.
          void showFirstTestsPage();
        }}
        lockedAgentUuid={agentUuid}
        agentNature={agentNature}
      />

      {/* Test Runner Dialog — one instance for both a just-started run and a
          past run, driven purely by the run id. */}
      {openTestRunId && (
        <TestRunnerDialog
          isOpen
          onClose={closeTestRun}
          agentUuid={agentUuid}
          agentName={agentName}
          taskId={openTestRunId}
          onNewRun={(taskId) => openTestRun(taskId)}
        />
      )}

      {/* Shown when a Run is clicked on an unverified connection agent. On a
          passing check it flips the parent's verified state and starts the
          held run; otherwise it offers a jump to the Connection settings. */}
      {pendingRun && (
        <VerifyConnectionDialog
          isOpen
          agentUuid={agentUuid}
          onClose={() => setPendingRun(null)}
          onVerified={() => {
            const p = pendingRun;
            setPendingRun(null);
            onConnectionVerified?.();
            void startRunNow(p.tests, p.allLinked, p.runKey);
          }}
          onGoToConnectionSettings={() => {
            setPendingRun(null);
            onGoToConnectionSettings?.();
          }}
        />
      )}

      {/* Confirm before starting a run of every linked test. */}
      <ConfirmDialog
        isOpen={runAllConfirmOpen}
        onClose={() => setRunAllConfirmOpen(false)}
        onConfirm={() => {
          setRunAllConfirmOpen(false);
          void launchTestRun(agentTests, true, "all");
        }}
        title="Run every test on this agent"
        message={`${
          isConnectionUnverified
            ? "Your agent's connection is checked first. Once it works, this"
            : "This"
        } will start the evaluation on ${linkedTestsTotal} ${linkedTestsTotal === 1 ? "test" : "tests"}. Each test calls your agent, evaluates its response against the evaluation criteria and reports the metrics.`}
        confirmText="Start the run"
      />

      {/* Provider question, shown when Compare models is used on an agent that
          has benchmarking turned off. Saving it opens the benchmark dialog. */}
      <EnableBenchmarkDialog
        isOpen={enableBenchmarkOpen}
        onClose={() => {
          setEnableBenchmarkOpen(false);
          setBenchmarkTests([]);
        }}
        currentProvider={benchmarkProvider}
        onConfirm={async (provider) => {
          await onEnableBenchmark?.(provider);
          setEnableBenchmarkOpen(false);
          setBenchmarkDialogOpen(true);
        }}
      />

      {/* Benchmark Dialog */}
      <BenchmarkDialog
        isOpen={benchmarkDialogOpen}
        onClose={() => {
          setBenchmarkDialogOpen(false);
          setBenchmarkTests([]);
        }}
        agentUuid={agentUuid}
        agentName={agentName}
        agentNature={agentNature}
        tests={benchmarkTests}
        totalTests={linkedTestsTotal}
        onBenchmarkCreated={() => onRunStarted?.()}
        agentType={agentType}
        benchmarkModelsVerified={benchmarkModelsVerified}
        benchmarkProvider={benchmarkProvider}
      />

      {/* Direct Benchmark Rerun Dialog — fresh benchmark of the same models and
          test subset, skipping the model picker. */}
      <BenchmarkRerunDialog
        config={benchmarkRerun.config}
        rerunKey={benchmarkRerun.key}
        onClose={benchmarkRerun.clear}
        onBenchmarkCreated={() => onRunStarted?.()}
        onRerun={benchmarkRerun.start}
      />
    </div>
  );
}
