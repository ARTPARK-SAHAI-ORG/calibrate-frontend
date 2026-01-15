"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import {
  ToolPicker,
  AvailableTool,
  getToolParams,
} from "@/components/ToolPicker";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TestRunnerDialog } from "@/components/TestRunnerDialog";
import { RunTestDialog } from "@/components/RunTestDialog";
import { AddTestDialog, TestConfig } from "@/components/AddTestDialog";

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

// AddTestDialog and related types have been moved to @/components/AddTestDialog

export default function LLMPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
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

  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [testToDelete, setTestToDelete] = useState<TestData | null>(null);
  const [isTestDeleting, setIsTestDeleting] = useState(false);

  // Run test dialog state
  const [runTestDialogOpen, setRunTestDialogOpen] = useState(false);
  const [testToRun, setTestToRun] = useState<TestData | null>(null);

  // Test runner dialog state
  const [testRunnerOpen, setTestRunnerOpen] = useState(false);
  const [testRunnerAgentUuid, setTestRunnerAgentUuid] = useState<string>("");
  const [testRunnerAgentName, setTestRunnerAgentName] = useState<string>("");

  // Fetch tests from backend
  useEffect(() => {
    const fetchTests = async () => {
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
    };

    fetchTests();
  }, [backendAccessToken]);

  // Open delete confirmation dialog
  const openDeleteDialog = (test: TestData) => {
    setTestToDelete(test);
    setDeleteDialogOpen(true);
  };

  // Close delete confirmation dialog
  const closeDeleteDialog = () => {
    if (!isTestDeleting) {
      setDeleteDialogOpen(false);
      setTestToDelete(null);
    }
  };

  // Delete test from backend
  const deleteTest = async () => {
    if (!testToDelete) return;

    try {
      setIsTestDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/tests/${testToDelete.uuid}`, {
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

      // Remove the test from local state
      setTests(tests.filter((test) => test.uuid !== testToDelete.uuid));
      closeDeleteDialog();
    } catch (err) {
      console.error("Error deleting test:", err);
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
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Tests</h1>
            <p className="text-muted-foreground text-base leading-relaxed mt-1">
              Create and manage tests to evaluate your language models.
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setAddTestSidebarOpen(true);
            }}
            className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Add test
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
            placeholder="Search tests"
            className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
          />
        </div>

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
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{testsError}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : filteredTests.length === 0 ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
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
              No tests found
            </h3>
            <p className="text-base text-muted-foreground mb-4">
              {searchQuery
                ? "No tests match your search"
                : "You haven't created any tests yet"}
            </p>
            <button
              onClick={() => {
                resetForm();
                setAddTestSidebarOpen(true);
              }}
              className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Add test
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
                Type
              </div>
              <div className="w-16"></div>
            </div>
            {/* Table Rows */}
            {filteredTests.map((test) => (
              <div
                key={test.uuid}
                onClick={() => openEditTest(test.uuid)}
                className="grid grid-cols-[1fr_1fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
              >
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
                    className="group relative w-8 h-8 flex items-center justify-center rounded-lg bg-transparent text-white hover:bg-[#444] transition-colors cursor-pointer"
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
        title="Delete test"
        message={`Are you sure you want to delete "${testToDelete?.name}"?`}
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
    </AppLayout>
  );
}
