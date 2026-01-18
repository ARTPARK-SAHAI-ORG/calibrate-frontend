"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  TestCaseOutput,
  TestCaseData,
  StatusIcon,
  CloseIcon,
  SpinnerIcon,
  TestDetailView as SharedTestDetailView,
  EmptyStateView,
  TestStats,
} from "./test-results/shared";

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
  status?: "passed" | "failed" | "error";
  passed?: boolean;
  output?: TestCaseOutput;
  test_case?: TestCaseData;
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
};

export function TestRunnerDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  tests,
  taskId,
  onRunCreated,
}: TestRunnerDialogProps) {
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [selectedTestUuid, setSelectedTestUuid] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runStatus, setRunStatus] = useState<
    "queued" | "in_progress" | "done" | "failed"
  >("queued");
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Initialize test results and start running tests when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTestUuid(null);

      if (taskId) {
        // View existing run - poll the task immediately
        setIsRunning(true);
        setCurrentTaskId(taskId);
        setTestResults([]); // Will be populated from API response
        setRunStatus("queued");

        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (backendUrl) {
          // Start polling immediately for existing task
          pollingIntervalRef.current = setInterval(() => {
            pollTaskStatus(taskId, backendUrl);
          }, 2000);
          pollTaskStatus(taskId, backendUrl);
        }
      } else if (tests.length > 0) {
        // Start a new run
      const initialResults: TestResult[] = tests.map((test) => ({
        test,
        status: "pending",
      }));
      setTestResults(initialResults);
      setCurrentTaskId(null);

      // Start running tests immediately after dialog opens
      // Use setTimeout to ensure state is set before running
      setTimeout(() => {
        runAllTests(initialResults);
      }, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tests, taskId]);

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
            : (result.status as "queued" | "in_progress" | "done" | "failed")
        );
      }

      // Update test results based on polling response
      setTestResults((prev) => {
        // If we're viewing a past run and have no previous results, build from API response
        if (prev.length === 0 && result.results && result.results.length > 0) {
          return result.results.map((apiResult) => {
            const isPassed =
              apiResult.passed === true || apiResult.status === "passed";
            // Get test name from test_case.name (API response) or test_name field
            const testName =
              apiResult.test_case?.name ||
              apiResult.test_name ||
              "Unknown Test";
            return {
              test: {
                uuid: apiResult.test_uuid || "",
                name: testName,
                description: "",
                type: "response" as const,
                config: {},
                created_at: "",
                updated_at: "",
              },
              status: isPassed ? ("passed" as const) : ("failed" as const),
              chatHistory: apiResult.chat_history,
              output: apiResult.output,
              testCase: apiResult.test_case,
              evaluation: apiResult.evaluation ?? { passed: isPassed },
              error: apiResult.error,
            };
          });
        }

        // Try to match by test_uuid first, if no match found, update by index
        const updatedResults: TestResult[] = prev.map((r, index) => {
          // First try to find by UUID in results
          let apiResult = result.results?.find(
            (res) => res.test_uuid === r.test.uuid
          );

          // If no UUID match, try to find by test name
          if (!apiResult) {
            apiResult = result.results?.find(
              (res) => res.test_name === r.test.name
            );
          }

          // If still no match and index is within range, use index-based matching
          if (!apiResult && result.results && index < result.results.length) {
            apiResult = result.results[index];
          }

          if (apiResult) {
            // Check both `passed` boolean and `status` string for compatibility
            const isPassed =
              apiResult.passed === true || apiResult.status === "passed";
            const newStatus: "passed" | "failed" = isPassed
              ? "passed"
              : "failed";
            return {
              ...r,
              status: newStatus,
              chatHistory: apiResult.chat_history,
              output: apiResult.output,
              testCase: apiResult.test_case,
              evaluation: apiResult.evaluation ?? { passed: isPassed },
              error: apiResult.error,
            };
          }

          // If overall status is in_progress and test is still queued, mark as running
          if (result.status === "in_progress" && r.status === "queued") {
            return { ...r, status: "running" };
          }

          return r;
        });
        return updatedResults;
      });

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
                : r
            )
          );
        }
      }
    } catch (error) {
      console.error("Error polling task status:", error);
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
        }
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
      }, 2000);

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
        }))
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
          : r
      )
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
            : r
        )
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
        }
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
            }
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
              (res) => res.test_uuid === testUuid
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
                    : r
                )
              );
            } else if (pollResult.error) {
              setTestResults((prev) =>
                prev.map((r) =>
                  r.test.uuid === testUuid
                    ? { ...r, status: "failed", error: pollResult.error }
                    : r
                )
              );
            }
          } else {
            // Continue polling
            setTimeout(pollSingleTest, 2000);
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
                : r
            )
          );
        }
      };

      // Start polling for single test
      if (
        result.status === "in_progress" ||
        result.status === "pending" ||
        result.status === "queued"
      ) {
        setTimeout(pollSingleTest, 2000);
      } else if (result.status === "completed" || result.status === "done") {
        const apiResult = result.results?.find(
          (res) => res.test_uuid === testUuid
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
                : r
            )
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
            : r
        )
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
          : r
      )
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
        }
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
        }, 2000);
      } else if (result.status === "completed" || result.status === "done") {
        if (result.results && result.results.length > 0) {
          setTestResults((prev) =>
            prev.map((r) => {
              const apiResult = result.results?.find(
                (res) => res.test_uuid === r.test.uuid
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
            })
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
            : r
        )
      );
      setIsRunning(false);
    }
  };

  const retryAll = async () => {
    // Reset all tests to pending
    setTestResults((prev) =>
      prev.map((r) => ({ ...r, status: "pending", error: undefined }))
    );

    const resetResults = testResults.map((r) => ({
      ...r,
      status: "pending" as const,
    }));
    await runAllTests(resetResults);
  };

  const selectedResult = testResults.find(
    (r) => r.test.uuid === selectedTestUuid
  );

  const passedTests = testResults.filter((r) => r.status === "passed");
  const failedTests = testResults.filter((r) => r.status === "failed");
  const queuedTests = testResults.filter((r) => r.status === "queued");
  const runningTests = testResults.filter((r) => r.status === "running");
  const pendingTests = testResults.filter((r) => r.status === "pending");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Test Status for {agentName}
          </h2>
          <div className="flex items-center gap-3">
            {/* Passed/Failed counts */}
            {testResults.length > 0 &&
              (passedTests.length > 0 || failedTests.length > 0) && (
                <TestStats
                  passedCount={passedTests.length}
                  failedCount={failedTests.length}
                />
              )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Panel - Test List */}
          <div className="w-80 border-r border-border flex flex-col overflow-hidden">
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

          {/* Right Panel - Test Details */}
          <div className="flex-1 overflow-y-auto">
            {selectedResult ? (
              <LocalTestDetailView result={selectedResult} />
            ) : (
              <EmptyStateView message="Select a test to view details" />
            )}
          </div>
        </div>
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
  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isSelected ? "bg-muted" : "hover:bg-muted/50"
      }`}
    >
      <StatusIcon status={result.status} />
      <span className="text-sm text-foreground truncate">
        {result.test.name}
      </span>
    </div>
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
          <p className="text-muted-foreground">Running test...</p>
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-6">
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
            <span className="font-medium text-red-500">Error</span>
          </div>
          <p className="text-sm text-red-400">{result.error}</p>
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
    />
  );
}
