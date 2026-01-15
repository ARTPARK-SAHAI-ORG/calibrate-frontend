"use client";

import React, { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TestRunnerDialog } from "@/components/TestRunnerDialog";
import { BenchmarkDialog } from "@/components/BenchmarkDialog";

type TestData = {
  uuid: string;
  name: string;
  description: string;
  type: "response" | "tool_call";
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type TestsTabContentProps = {
  agentUuid: string;
  agentName?: string;
};

export function TestsTabContent({
  agentUuid,
  agentName = "Agent",
}: TestsTabContentProps) {
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  // Agent tests state (tests attached to the agent)
  const [agentTests, setAgentTests] = useState<TestData[]>([]);
  const [agentTestsLoading, setAgentTestsLoading] = useState(true);
  const [agentTestsError, setAgentTestsError] = useState<string | null>(null);

  // All available tests state
  const [allTests, setAllTests] = useState<TestData[]>([]);
  const [allTestsLoading, setAllTestsLoading] = useState(false);

  // UI state
  const [showTestDropdown, setShowTestDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [testsSearchQuery, setTestsSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testToDelete, setTestToDelete] = useState<TestData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Test runner dialog state
  const [testRunnerOpen, setTestRunnerOpen] = useState(false);

  // Benchmark dialog state
  const [benchmarkDialogOpen, setBenchmarkDialogOpen] = useState(false);

  // Fetch tests attached to this agent
  useEffect(() => {
    const fetchAgentTests = async () => {
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
          throw new Error("Failed to fetch agent tests");
        }

        const data: TestData[] = await response.json();
        setAgentTests(data);
      } catch (err) {
        console.error("Error fetching agent tests:", err);
        setAgentTestsError(
          err instanceof Error ? err.message : "Failed to load agent tests"
        );
      } finally {
        setAgentTestsLoading(false);
      }
    };

    if (agentUuid && backendAccessToken) {
      fetchAgentTests();
    }
  }, [agentUuid, backendAccessToken]);

  // Fetch all available tests when dropdown opens
  useEffect(() => {
    if (showTestDropdown && backendAccessToken) {
      const fetchTests = async () => {
        try {
          setAllTestsLoading(true);
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
          setAllTests(data);
        } catch (err) {
          console.error("Error fetching tests:", err);
        } finally {
          setAllTestsLoading(false);
        }
      };

      fetchTests();
    }
  }, [showTestDropdown, backendAccessToken]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setShowTestDropdown(false);
        setSearchQuery("");
      }
    };

    if (showTestDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showTestDropdown]);

  // Filter out tests already attached to the agent
  const agentTestUuids = new Set(agentTests.map((t) => t.uuid));
  const availableTests = allTests.filter(
    (test) => !agentTestUuids.has(test.uuid)
  );

  // Filter available tests based on search query
  const filteredAvailableTests = availableTests.filter(
    (test) =>
      test.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (test.description &&
        test.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Filter agent tests based on search query
  const filteredAgentTests = agentTests.filter(
    (test) =>
      test.name.toLowerCase().includes(testsSearchQuery.toLowerCase()) ||
      (test.description &&
        test.description.toLowerCase().includes(testsSearchQuery.toLowerCase()))
  );

  // Add test to agent
  const handleSelectTest = async (test: TestData) => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

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
          test_uuids: [test.uuid],
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to add test to agent");
      }

      // Add the test to local state
      setAgentTests((prev) => [...prev, test]);
      setShowTestDropdown(false);
      setSearchQuery("");
    } catch (err) {
      console.error("Error adding test to agent:", err);
    }
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (test: TestData) => {
    setTestToDelete(test);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isDeleting) {
      setDeleteDialogOpen(false);
      setTestToDelete(null);
    }
  };

  // Remove test from agent
  const handleRemoveTest = async () => {
    if (!testToDelete) return;

    try {
      setIsDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/agent-tests`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          agent_uuid: agentUuid,
          test_uuid: testToDelete.uuid,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to remove test from agent");
      }

      // Remove the test from local state
      setAgentTests((prev) => prev.filter((t) => t.uuid !== testToDelete.uuid));
      closeDeleteDialog();
    } catch (err) {
      console.error("Error removing test from agent:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header with Add button - only show when there are tests */}
      {agentTests.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowTestDropdown(!showTestDropdown)}
                className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Add test
              </button>

              {/* Test Selection Dropdown */}
              {showTestDropdown && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
                  {/* Search Input */}
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
                  </div>

                  {/* Tests List */}
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
                        <p className="text-sm text-muted-foreground">
                          No tests found
                        </p>
                      </div>
                    ) : (
                      filteredAvailableTests.map((test) => (
                        <button
                          key={test.uuid}
                          onClick={() => handleSelectTest(test)}
                          className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer border-b border-border last:border-b-0"
                        >
                          <p className="text-sm font-medium text-foreground truncate">
                            {test.name}
                          </p>
                          {test.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {test.description}
                            </p>
                          )}
                          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                            {test.type === "tool_call"
                              ? "Tool Call"
                              : "Next Reply"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setTestRunnerOpen(true)}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer flex items-center gap-2"
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
              Run all tests
            </button>
            <button
              onClick={() => setBenchmarkDialogOpen(true)}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer flex items-center gap-2"
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
                  d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605"
                />
              </svg>
              Compare models
            </button>
          </div>
        </div>
      )}

      {/* Tests List / Loading / Error / Empty State */}
      {agentTestsLoading ? (
        <div className="flex-1 border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
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
        <div className="flex-1 border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
          <p className="text-base text-red-500 mb-2">{agentTestsError}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : agentTests.length === 0 ? (
        <div className="flex-1 border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
          <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
            <svg
              className="w-7 h-7 text-muted-foreground"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M9 3h6v2h-1v4.5l4.5 7.5c.5.83.5 1.5-.17 2.17-.67.67-1.34.83-2.33.83H8c-1 0-1.67-.17-2.33-.83-.67-.67-.67-1.34-.17-2.17L10 9.5V5H9V3zm3 8.5L8.5 17h7L12 11.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">
            No tests attached
          </h3>
          <p className="text-base text-muted-foreground mb-4 text-center max-w-md">
            This agent doesn&apos;t have any tests attached to it.
          </p>
          <div className="flex items-center gap-3">
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowTestDropdown(!showTestDropdown)}
                className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Add test
              </button>

              {/* Test Selection Dropdown */}
              {showTestDropdown && (
                <div className="absolute top-full left-0 mt-2 w-80 bg-background border border-border rounded-lg shadow-lg z-50">
                  {/* Search Input */}
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
                  </div>

                  {/* Tests List */}
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
                    ) : filteredAvailableTests.length === 0 ? (
                      <div className="py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          {searchQuery
                            ? "No tests found"
                            : "No tests available"}
                        </p>
                      </div>
                    ) : (
                      filteredAvailableTests.map((test) => (
                        <button
                          key={test.uuid}
                          onClick={() => handleSelectTest(test)}
                          className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors cursor-pointer border-b border-border last:border-b-0"
                        >
                          <p className="text-sm font-medium text-foreground truncate">
                            {test.name}
                          </p>
                          {test.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                              {test.description}
                            </p>
                          )}
                          <span className="inline-block mt-1 px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
                            {test.type === "tool_call"
                              ? "Tool Call"
                              : "Next Reply"}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Search Input */}
          <div className="relative mb-4">
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
              value={testsSearchQuery}
              onChange={(e) => setTestsSearchQuery(e.target.value)}
              placeholder="Search tests"
              className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          {/* Tests Table */}
          {filteredAgentTests.length === 0 ? (
            <div className="flex-1 border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <p className="text-base text-muted-foreground">
                No tests match your search
              </p>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                <div className="text-sm font-medium text-muted-foreground">
                  Name
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Type
                </div>
                <div className="w-8"></div>
              </div>
              {/* Table Body */}
              {filteredAgentTests.map((test) => (
                <div
                  key={test.uuid}
                  className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Name Column */}
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-foreground">
                      {test.name}
                    </div>
                  </div>
                  {/* Type Column */}
                  <div className="flex items-center">
                    <p className="text-sm text-muted-foreground">
                      {test.type === "tool_call" ? "Tool Call" : "Next Reply"}
                    </p>
                  </div>
                  {/* Delete Button */}
                  <div className="flex items-center">
                    <button
                      onClick={() => openDeleteDialog(test)}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Remove test from agent"
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
          )}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={deleteDialogOpen && !!testToDelete}
        onClose={closeDeleteDialog}
        onConfirm={handleRemoveTest}
        title="Remove test"
        message={`Are you sure you want to remove "${testToDelete?.name}" from this agent?`}
        confirmText="Remove"
        isDeleting={isDeleting}
      />

      {/* Test Runner Dialog */}
      <TestRunnerDialog
        isOpen={testRunnerOpen}
        onClose={() => setTestRunnerOpen(false)}
        agentUuid={agentUuid}
        agentName={agentName}
        tests={agentTests}
      />

      {/* Benchmark Dialog */}
      <BenchmarkDialog
        isOpen={benchmarkDialogOpen}
        onClose={() => setBenchmarkDialogOpen(false)}
        agentUuid={agentUuid}
        agentName={agentName}
        tests={agentTests}
      />
    </div>
  );
}
