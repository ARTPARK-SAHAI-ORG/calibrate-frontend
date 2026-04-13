"use client";

import React, { useState, useEffect, useRef } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import {
  TestCaseOutput,
  TestCaseData,
  StatusIcon,
  CloseIcon,
  SpinnerIcon,
  TestDetailView as SharedTestDetailView,
  EmptyStateView,
  TestStats,
  EvaluationCriteriaPanel,
} from "./test-results/shared";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { useHideFloatingButton } from "@/components/AppLayout";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ChatMessage = {
  role: "user" | "agent" | "tool";
  content: string;
  tool_name?: string;
  tool_args?: Record<string, any>;
};

type TestResult = {
  test: TestData;
  status: "pending" | "queued" | "running" | "passed" | "failed";
  chatHistory?: ChatMessage[];
  output?: TestCaseOutput;
  testCase?: TestCaseData;
  reasoning?: string;
  evaluation?: {
    passed: boolean;
    message?: string;
    details?: Record<string, any>;
  };
  error?: string;
};

type TestCaseResult = {
  test_uuid?: string;
  test_name?: string;
  name?: string; // Test name from in-progress API response
  status?: "passed" | "failed" | "error";
  passed?: boolean | null; // null means test is still running
  reasoning?: string;
  output?: TestCaseOutput | null;
  test_case?: TestCaseData | null;
  chat_history?: ChatMessage[];
  evaluation?: {
    passed: boolean;
    message?: string;
    details?: Record<string, any>;
  };
  error?: string;
};

type TestRunStatusResponse = {
  task_id: string;
  status: string;
  total_tests?: number;
  passed?: number;
  failed?: number;
  results?: TestCaseResult[];
  results_s3_prefix?: string;
  error?: string;
};

type TestRunnerDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
  tests: TestData[];
  taskId?: string; // If provided, view existing run results instead of starting a new run
  onRunCreated?: (taskId: string) => void; // Called when a new run is created
  initialRunStatus?: string; // Initial status of the run (for viewing past runs)
  onStatusUpdate?: (
    taskId: string,
    status: string,
    results?: {
      name?: string;
      passed: boolean | null;
      test_case?: { name?: string } | null;
    }[],
    passed?: number | null,
    failed?: number | null,
  ) => void; // Called when run status changes (for coordinated polling)
};

export function TestRunnerDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  tests,
  taskId,
  onRunCreated,
  initialRunStatus,
  onStatusUpdate,
}: TestRunnerDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const backendAccessToken = useAccessToken();
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [selectedTestUuid, setSelectedTestUuid] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<
    "queued" | "in_progress" | "done" | "failed"
  >("queued");
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Debug: Log when selectedTestUuid changes
  useEffect(() => {
    console.log("selectedTestUuid changed to:", selectedTestUuid);
    console.log(
      "testResults:",
      testResults.map((r) => ({ uuid: r.test.uuid, name: r.test.name })),
    );
  }, [selectedTestUuid, testResults]);

  // Start polling when dialog opens with a taskId (viewing existing run)
  useEffect(() => {
    // Clear any existing polling interval first
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    if (!isOpen || !taskId || !backendAccessToken) {
      return;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    // Initialize state for viewing existing run
    setSelectedTestUuid(null);
    setCurrentTaskId(taskId);

    const isInProgress =
      initialRunStatus === "pending" ||
      initialRunStatus === "queued" ||
      initialRunStatus === "in_progress";

    setIsRunning(isInProgress);

    if (initialRunStatus === "done" || initialRunStatus === "completed") {
      setTestResults([]);
      setRunStatus("done");
    } else if (tests.length > 0) {
      setTestResults(tests.map((test) => ({ test, status: "running" })));
      setRunStatus("in_progress");
    } else {
      setTestResults([]);
      setRunStatus("queued");
    }

    // Always fetch once immediately
    pollTaskStatus(taskId, backendUrl);

    // Start polling - will stop itself when status is done/completed/failed
    pollingIntervalRef.current = setInterval(() => {
      pollTaskStatus(taskId, backendUrl);
    }, POLLING_INTERVAL_MS);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, taskId, backendAccessToken]);

  // Start new test run when dialog opens without taskId
  useEffect(() => {
    if (!isOpen || taskId || tests.length === 0) {
      return;
    }

    setSelectedTestUuid(null);
    setCurrentTaskId(null);
    const initialResults: TestResult[] = tests.map((test) => ({
      test,
      status: "pending",
    }));
    setTestResults(initialResults);

    setTimeout(() => {
      runAllTests(initialResults);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, taskId, tests]);

  const pollTaskStatus = async (taskId: string, backendUrl: string) => {
    try {
      const response = await fetch(`${backendUrl}/agent-tests/run/${taskId}`, {
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
        throw new Error("Failed to poll task status");
      }

      const result: TestRunStatusResponse = await response.json();

      // Update overall run status
      if (
        result.status === "queued" ||
        result.status === "in_progress" ||
        result.status === "done" ||
        result.status === "completed" ||
        result.status === "failed"
      ) {
        setRunStatus(
          result.status === "completed"
            ? "done"
            : (result.status as "queued" | "in_progress" | "done" | "failed"),
        );
      }

      // Update test results based on polling response
      setTestResults((prev) => {
        // Helper to determine test status from API result
        const getTestStatus = (
          apiResult: TestCaseResult,
        ): "passed" | "failed" | "running" => {
          // If passed is null, the test is still running
          if (apiResult.passed === null || apiResult.passed === undefined) {
            return "running";
          }
          return apiResult.passed === true || apiResult.status === "passed"
            ? "passed"
            : "failed";
        };

        // If we're viewing a past run and have no previous results, build from API response
        if (prev.length === 0 && result.results && result.results.length > 0) {
          return result.results.map((apiResult, index) => {
            const testStatus = getTestStatus(apiResult);
            // Get test name from name (in-progress), test_case.name, or test_name field
            const testName =
              apiResult.name ||
              apiResult.test_case?.name ||
              apiResult.test_name ||
              "Unknown Test";
            // Generate a unique fallback UUID using index if test_uuid is missing
            const testUuid =
              apiResult.test_uuid || `generated-${index}-${testName}`;
            return {
              test: {
                uuid: testUuid,
                name: testName,
                description: "",
                type: "response" as const,
                config: {},
                created_at: "",
                updated_at: "",
              },
              status: testStatus,
              chatHistory: apiResult.chat_history,
              output: apiResult.output ?? undefined,
              testCase: apiResult.test_case ?? undefined,
              reasoning: apiResult.reasoning,
              evaluation:
                testStatus !== "running"
                  ? (apiResult.evaluation ?? {
                      passed: testStatus === "passed",
                    })
                  : undefined,
              error: apiResult.error,
            };
          });
        }

        // Try to match by test_uuid first, if no match found, update by index or name
        const updatedResults: TestResult[] = prev.map((r, index) => {
          // First try to find by UUID in results
          let apiResult = result.results?.find(
            (res) => res.test_uuid === r.test.uuid,
          );

          // If no UUID match, try to find by test name (check both name and test_name)
          if (!apiResult) {
            apiResult = result.results?.find(
              (res) =>
                res.test_name === r.test.name || res.name === r.test.name,
            );
          }

          // If still no match and index is within range, use index-based matching
          if (!apiResult && result.results && index < result.results.length) {
            apiResult = result.results[index];
          }

          if (apiResult) {
            const testStatus = getTestStatus(apiResult);
            return {
              ...r,
              status: testStatus,
              chatHistory: apiResult.chat_history,
              output: apiResult.output ?? undefined,
              testCase: apiResult.test_case ?? undefined,
              reasoning: apiResult.reasoning,
              evaluation:
                testStatus !== "running"
                  ? (apiResult.evaluation ?? {
                      passed: testStatus === "passed",
                    })
                  : undefined,
              error: apiResult.error,
            };
          }

          // If overall status is in_progress and test is still queued/pending, mark as running
          if (
            result.status === "in_progress" &&
            (r.status === "queued" || r.status === "pending")
          ) {
            return { ...r, status: "running" };
          }

          return r;
        });
        return updatedResults;
      });

      // Notify parent of status update (for coordinated polling)
      // Only notify if there's a status change worth reporting (not for initial fetch of completed runs)
      if (onStatusUpdate && taskId && isRunning) {
        const apiResults = result.results?.map((r: TestCaseResult) => ({
          name: r.name || r.test_case?.name,
          passed: r.passed ?? null,
          test_case: r.test_case,
        }));
        onStatusUpdate(
          taskId,
          result.status,
          apiResults,
          result.passed,
          result.failed,
        );
      }

      // Check if polling should stop
      if (
        result.status === "completed" ||
        result.status === "failed" ||
        result.status === "done"
      ) {
        setIsRunning(false);
        setCurrentTaskId(null);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        // If there's an overall error, update remaining pending tests
        if (result.error) {
          setTestResults((prev) =>
            prev.map((r) =>
              r.status === "pending" || r.status === "running"
                ? { ...r, status: "failed", error: result.error }
                : r,
            ),
          );
        }
      }
    } catch (error) {
      console.error("Error polling task status:", error);
      setRunStatus("failed");
      setIsRunning(false);
      setCurrentTaskId(null);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  const runAllTests = async (initialResults: TestResult[]) => {
    setIsRunning(true);

    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      console.error("BACKEND_URL environment variable is not set");
      setIsRunning(false);
      return;
    }

    // Set all tests to queued initially
    setRunStatus("queued");
    setTestResults((prev) => prev.map((r) => ({ ...r, status: "queued" })));

    try {
      // Collect all test UUIDs
      const testUuids = initialResults.map((r) => r.test.uuid);

      // Make batch API call
      const response = await fetch(
        `${backendUrl}/agent-tests/agent/${agentUuid}/run`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            test_uuids: testUuids,
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to start test run");
      }

      const result: TestRunStatusResponse = await response.json();
      const newTaskId = result.task_id;
      setCurrentTaskId(newTaskId);

      // Notify parent about the new run
      if (onRunCreated) {
        onRunCreated(newTaskId);
      }

      // Start polling immediately
      pollingIntervalRef.current = setInterval(() => {
        pollTaskStatus(newTaskId, backendUrl);
      }, POLLING_INTERVAL_MS);

      // Also poll immediately to get the first result
      pollTaskStatus(newTaskId, backendUrl);
    } catch (error) {
      console.error("Error starting test run:", error);
      setTestResults((prev) =>
        prev.map((r) => ({
          ...r,
          status: "failed",
          error:
            error instanceof Error ? error.message : "Failed to start test run",
        })),
      );
      setIsRunning(false);
    }
  };

  const retryTest = async (testUuid: string) => {
    const testResult = testResults.find((r) => r.test.uuid === testUuid);
    if (!testResult) return;

    // Update status to running
    setTestResults((prev) =>
      prev.map((r) =>
        r.test.uuid === testUuid
          ? { ...r, status: "running", error: undefined }
          : r,
      ),
    );

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      setTestResults((prev) =>
        prev.map((r) =>
          r.test.uuid === testUuid
            ? {
                ...r,
                status: "failed",
                error: "BACKEND_URL environment variable is not set",
              }
            : r,
        ),
      );
      return;
    }

    try {
      // Make API call for single test retry
      const response = await fetch(
        `${backendUrl}/agent-tests/agent/${agentUuid}/run`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            test_uuids: [testUuid],
          }),
        },
      );

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to retry test");
      }

      const result: TestRunStatusResponse = await response.json();

      // Poll for this single test result
      const pollSingleTest = async () => {
        try {
          const pollResponse = await fetch(
            `${backendUrl}/agent-tests/run/${result.task_id}`,
            {
              method: "GET",
              headers: {
                accept: "application/json",
                "ngrok-skip-browser-warning": "true",
                Authorization: `Bearer ${backendAccessToken}`,
              },
            },
          );

          if (pollResponse.status === 401) {
            await signOut({ callbackUrl: "/login" });
            return;
          }

          if (!pollResponse.ok) {
            throw new Error("Failed to poll task status");
          }

          const pollResult: TestRunStatusResponse = await pollResponse.json();

          if (
            pollResult.status === "completed" ||
            pollResult.status === "done" ||
            pollResult.status === "failed"
          ) {
            const apiResult = pollResult.results?.find(
              (res) => res.test_uuid === testUuid,
            );
            if (apiResult) {
              setTestResults((prev) =>
                prev.map((r) =>
                  r.test.uuid === testUuid
                    ? {
                        ...r,
                        status:
                          apiResult.status === "passed" ? "passed" : "failed",
                        chatHistory: apiResult.chat_history,
                        evaluation: apiResult.evaluation,
                        error: apiResult.error,
                      }
                    : r,
                ),
              );
            } else if (pollResult.error) {
              setTestResults((prev) =>
                prev.map((r) =>
                  r.test.uuid === testUuid
                    ? { ...r, status: "failed", error: pollResult.error }
                    : r,
                ),
              );
            }
          } else {
            // Continue polling
            setTimeout(pollSingleTest, POLLING_INTERVAL_MS);
          }
        } catch (error) {
          setTestResults((prev) =>
            prev.map((r) =>
              r.test.uuid === testUuid
                ? {
                    ...r,
                    status: "failed",
                    error:
                      error instanceof Error ? error.message : "Test failed",
                  }
                : r,
            ),
          );
        }
      };

      // Start polling for single test
      if (
        result.status === "in_progress" ||
        result.status === "pending" ||
        result.status === "queued"
      ) {
        setTimeout(pollSingleTest, POLLING_INTERVAL_MS);
      } else if (result.status === "completed" || result.status === "done") {
        const apiResult = result.results?.find(
          (res) => res.test_uuid === testUuid,
        );
        if (apiResult) {
          setTestResults((prev) =>
            prev.map((r) =>
              r.test.uuid === testUuid
                ? {
                    ...r,
                    status: apiResult.status === "passed" ? "passed" : "failed",
                    chatHistory: apiResult.chat_history,
                    evaluation: apiResult.evaluation,
                    error: apiResult.error,
                  }
                : r,
            ),
          );
        }
      }
    } catch (error) {
      setTestResults((prev) =>
        prev.map((r) =>
          r.test.uuid === testUuid
            ? {
                ...r,
                status: "failed",
                error: error instanceof Error ? error.message : "Test failed",
              }
            : r,
        ),
      );
    }
  };

  const retryAllFailed = async () => {
    const failedTests = testResults.filter((r) => r.status === "failed");
    if (failedTests.length === 0) return;

    setIsRunning(true);

    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      console.error("BACKEND_URL environment variable is not set");
      setIsRunning(false);
      return;
    }

    // Set failed tests to running
    setTestResults((prev) =>
      prev.map((r) =>
        r.status === "failed"
          ? { ...r, status: "running", error: undefined }
          : r,
      ),
    );

    try {
      const testUuids = failedTests.map((r) => r.test.uuid);

      const response = await fetch(
        `${backendUrl}/agent-tests/agent/${agentUuid}/run`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
          body: JSON.stringify({
            test_uuids: testUuids,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to retry failed tests");
      }

      const result: TestRunStatusResponse = await response.json();
      setCurrentTaskId(result.task_id);

      if (
        result.status === "in_progress" ||
        result.status === "pending" ||
        result.status === "queued"
      ) {
        pollingIntervalRef.current = setInterval(() => {
          pollTaskStatus(result.task_id, backendUrl);
        }, POLLING_INTERVAL_MS);
      } else if (result.status === "completed" || result.status === "done") {
        if (result.results && result.results.length > 0) {
          setTestResults((prev) =>
            prev.map((r) => {
              const apiResult = result.results?.find(
                (res) => res.test_uuid === r.test.uuid,
              );
              if (apiResult) {
                return {
                  ...r,
                  status: apiResult.status === "passed" ? "passed" : "failed",
                  chatHistory: apiResult.chat_history,
                  evaluation: apiResult.evaluation,
                  error: apiResult.error,
                };
              }
              return r;
            }),
          );
        }
        setIsRunning(false);
      }
    } catch (error) {
      console.error("Error retrying failed tests:", error);
      setTestResults((prev) =>
        prev.map((r) =>
          r.status === "running"
            ? {
                ...r,
                status: "failed",
                error:
                  error instanceof Error
                    ? error.message
                    : "Failed to retry tests",
              }
            : r,
        ),
      );
      setIsRunning(false);
    }
  };

  const retryAll = async () => {
    // Reset all tests to pending
    setTestResults((prev) =>
      prev.map((r) => ({ ...r, status: "pending", error: undefined })),
    );

    const resetResults = testResults.map((r) => ({
      ...r,
      status: "pending" as const,
    }));
    await runAllTests(resetResults);
  };

  const selectedResult = testResults.find(
    (r) => r.test.uuid === selectedTestUuid,
  );

  // Debug: Log selectedResult
  useEffect(() => {
    console.log(
      "selectedResult:",
      selectedResult
        ? { name: selectedResult.test.name, status: selectedResult.status }
        : null,
    );
  }, [selectedResult]);

  const passedTests = testResults.filter((r) => r.status === "passed");
  const failedTests = testResults.filter((r) => r.status === "failed");
  const queuedTests = testResults.filter((r) => r.status === "queued");
  const runningTests = testResults.filter((r) => r.status === "running");
  const pendingTests = testResults.filter((r) => r.status === "pending");

  // Check if the entire run errored (all tests have errors, none have real results)
  const isOverallError =
    runStatus === "failed" &&
    testResults.length > 0 &&
    testResults.every((r) => r.error);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-0 md:p-4">
      <div className="bg-background rounded-none md:rounded-xl w-full max-w-7xl h-full md:h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Test Status for {agentName}
          </h2>
          <div className="flex items-center gap-3">
            {/* Passed/Failed counts - desktop only */}
            {!isOverallError &&
              testResults.length > 0 &&
              (passedTests.length > 0 || failedTests.length > 0) && (
                <div className="hidden md:block">
                  <TestStats
                    passedCount={passedTests.length}
                    failedCount={failedTests.length}
                  />
                </div>
              )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Overall Error State - replaces split panel */}
        {isOverallError ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-md text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <svg
                  className="w-5 h-5 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <span className="font-medium text-red-500">
                  Something went wrong
                </span>
              </div>
              <p className="text-sm text-red-400">
                We&apos;re looking into it. Please reach out to us if this issue
                persists.
              </p>
            </div>
          </div>
        ) : (
          /* Content - Split panel */
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - Test List */}
            <div
              className={`w-full md:w-80 border-r border-border flex flex-col overflow-hidden ${
                selectedTestUuid ? "hidden md:flex" : "flex"
              }`}
            >
              <div className="flex-1 overflow-y-auto">
                {/* Failed Tests - Always shown first */}
                {failedTests.length > 0 && (
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500"></div>
                      Failed ({failedTests.length})
                    </h3>
                    <div className="space-y-1">
                      {failedTests.map((result) => (
                        <TestListItem
                          key={result.test.uuid}
                          result={result}
                          isSelected={selectedTestUuid === result.test.uuid}
                          onSelect={() => setSelectedTestUuid(result.test.uuid)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Passed Tests */}
                {passedTests.length > 0 && (
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      Passed ({passedTests.length})
                    </h3>
                    <div className="space-y-1">
                      {passedTests.map((result) => (
                        <TestListItem
                          key={result.test.uuid}
                          result={result}
                          isSelected={selectedTestUuid === result.test.uuid}
                          onSelect={() => setSelectedTestUuid(result.test.uuid)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Queued Tests */}
                {queuedTests.length > 0 && (
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                      Queued ({queuedTests.length})
                    </h3>
                    <div className="space-y-1">
                      {queuedTests.map((result) => (
                        <TestListItem
                          key={result.test.uuid}
                          result={result}
                          isSelected={selectedTestUuid === result.test.uuid}
                          onSelect={() => setSelectedTestUuid(result.test.uuid)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Running Tests */}
                {runningTests.length > 0 && (
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                      Running ({runningTests.length})
                    </h3>
                    <div className="space-y-1">
                      {runningTests.map((result) => (
                        <TestListItem
                          key={result.test.uuid}
                          result={result}
                          isSelected={selectedTestUuid === result.test.uuid}
                          onSelect={() => setSelectedTestUuid(result.test.uuid)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Pending Tests */}
                {pendingTests.length > 0 && (
                  <div className="p-4">
                    <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                      Pending ({pendingTests.length})
                    </h3>
                    <div className="space-y-1">
                      {pendingTests.map((result) => (
                        <TestListItem
                          key={result.test.uuid}
                          result={result}
                          isSelected={selectedTestUuid === result.test.uuid}
                          onSelect={() => setSelectedTestUuid(result.test.uuid)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Middle Panel - Conversation History */}
            <div
              className={`flex-1 ${
                selectedTestUuid ? "flex" : "hidden md:flex"
              } flex-col overflow-hidden`}
            >
              {selectedResult ? (
                <>
                  {/* Mobile Back Button */}
                  <div className="md:hidden px-4 py-3 border-b border-border flex-shrink-0">
                    <button
                      onClick={() => setSelectedTestUuid(null)}
                      className="flex items-center gap-2 text-sm text-foreground hover:text-muted-foreground transition-colors"
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
                          d="M15 19l-7-7 7-7"
                        />
                      </svg>
                      Back to tests
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <LocalTestDetailView result={selectedResult} />
                  </div>
                </>
              ) : (
                <EmptyStateView message="Select a test to view details" />
              )}
            </div>

            {/* Right Panel - Evaluation Criteria (only after test completes) */}
            {selectedResult &&
              (selectedResult.status === "passed" ||
                selectedResult.status === "failed") && (
                <div className="hidden md:flex w-72 border-l border-border flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto">
                    <EvaluationCriteriaPanel
                      evaluation={selectedResult.testCase?.evaluation}
                      testType={selectedResult.testCase?.evaluation?.type}
                    />
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}

// Test List Item Component
function TestListItem({
  result,
  isSelected,
  onSelect,
}: {
  result: TestResult;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const handleClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("TestListItem clicked:", result.test.name, result.test.uuid);
    onSelect();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onTouchEnd={handleClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isSelected ? "bg-muted" : "hover:bg-muted/50"
      }`}
    >
      <StatusIcon status={result.status} />
      <span className="text-sm text-foreground truncate">
        {result.test.name}
      </span>
    </button>
  );
}

// Local Test Detail View Component with error/pending/running state handling
function LocalTestDetailView({ result }: { result: TestResult }) {
  if (result.status === "pending") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Test is pending</p>
      </div>
    );
  }

  if (result.status === "queued") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Test is queued</p>
      </div>
    );
  }

  if (result.status === "running") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3">
          <SpinnerIcon className="w-5 h-5 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Running test</p>
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
              />
            </svg>
            <span className="font-medium text-red-500">
              Something went wrong
            </span>
          </div>
          <p className="text-sm text-red-400">
            We&apos;re looking into it. Please reach out to us if this issue
            persists.
          </p>
        </div>
      </div>
    );
  }

  // Use shared component for main content
  return (
    <SharedTestDetailView
      history={result.testCase?.history || []}
      output={result.output}
      passed={result.evaluation?.passed ?? false}
      reasoning={result.reasoning}
    />
  );
}
