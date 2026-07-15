/**
 * Render tests for the STT evaluations list.
 *
 * Focus: the slim, flat `JobListItem` the list now consumes — top-level
 * `providers` / `language` / `sample_count` (read via `unwrapList` off the
 * `{ items }` envelope), plus the empty-value fallbacks. `AppLayout` and the
 * dataset-management hook are stubbed so the test exercises only the list rows.
 */
import React from "react";
import { render, screen, waitFor, setupUser } from "@/test-utils";
import STTPage from "../page";

// The page chrome isn't under test — render children straight through.
// `useHideFloatingButton` is re-exported from here and used by the delete
// dialog, so stub it too.
jest.mock("../../../components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHideFloatingButton: () => {},
}));

// The datasets list the page validates job links against. Populated per test;
// the page reads it straight from useDatasetManagement (already fetched on
// mount), so no per-dataset GET /datasets/{id} is issued.
let mockDatasets: { uuid: string; name: string }[] = [];

// Provide a token so fetchJobs runs, and neutral dataset-tab state. Keep the
// real useJobDeletion (selection + delete logic) so the list rows render.
jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "test-token",
  useDatasetManagement: () => ({
    datasets: mockDatasets,
    datasetsLoading: false,
    datasetsError: null,
    showCreateModal: false,
    setShowCreateModal: jest.fn(),
    newDatasetName: "",
    setNewDatasetName: jest.fn(),
    isCreating: false,
    deleteDatasetId: null,
    setDeleteDatasetId: jest.fn(),
    isDeletingDataset: false,
    fetchDatasets: jest.fn(),
    handleDeleteDataset: jest.fn(),
    handleCreateDataset: jest.fn(),
  }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000";
  mockDatasets = [{ uuid: "ds-1", name: "Hindi set" }];
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

function mockJobsResponse(items: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ items, total: items.length, limit: null, offset: 0 }),
  }) as unknown as typeof fetch;
}

describe("STT evaluations list", () => {
  it("renders flat provider, language and sample_count fields for a populated job", async () => {
    mockJobsResponse([
      {
        uuid: "job-1",
        type: "stt-eval",
        status: "done",
        providers: ["deepgram", "openai"],
        language: "english",
        sample_count: 3,
        dataset_id: "ds-1",
        dataset_name: "Hindi set",
        created_at: "2026-07-15 10:00:00",
        updated_at: "2026-07-15 10:00:00",
      },
    ]);

    render(<STTPage />);

    // Provider pills come from the flat `providers` array (desktop + mobile).
    expect(await screen.findAllByText("Deepgram")).not.toHaveLength(0);
    expect(screen.getAllByText("OpenAI").length).toBeGreaterThan(0);
    // Language cell reads the flat `language` field, title-cased.
    expect(screen.getAllByText("English").length).toBeGreaterThan(0);
    // Samples cell reads the precomputed `sample_count`.
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    // Linked dataset name renders.
    expect(screen.getAllByText("Hindi set").length).toBeGreaterThan(0);
  });

  it("falls back to em dash / zero when provider, language and count are absent", async () => {
    mockJobsResponse([
      {
        uuid: "job-2",
        type: "stt-eval",
        status: "queued",
        // providers, language, sample_count intentionally omitted
        dataset_id: null,
        dataset_name: null,
        created_at: "2026-07-15 09:00:00",
        updated_at: "2026-07-15 09:00:00",
      },
    ]);

    render(<STTPage />);

    // Empty language -> "—"; missing providers -> "—" / "No providers".
    expect(await screen.findAllByText("—")).not.toHaveLength(0);
    // Missing sample_count -> 0.
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("strips the dataset link when the job points at a since-deleted dataset", async () => {
    // The job references ds-gone, which is NOT in the loaded datasets list.
    mockDatasets = [{ uuid: "ds-1", name: "Hindi set" }];
    mockJobsResponse([
      {
        uuid: "job-3",
        type: "stt-eval",
        status: "done",
        providers: ["openai"],
        language: "english",
        sample_count: 2,
        dataset_id: "ds-gone",
        dataset_name: "Deleted set",
        created_at: "2026-07-15 10:00:00",
        updated_at: "2026-07-15 10:00:00",
      },
    ]);

    render(<STTPage />);

    // Row renders, but the stale dataset name is nulled out.
    expect(await screen.findAllByText("OpenAI")).not.toHaveLength(0);
    expect(screen.queryByText("Deleted set")).not.toBeInTheDocument();
  });

  it("validates datasets in memory without any per-dataset fetch", async () => {
    mockDatasets = [{ uuid: "ds-1", name: "Hindi set" }];
    mockJobsResponse([
      {
        uuid: "job-1",
        type: "stt-eval",
        status: "done",
        providers: ["openai"],
        language: "english",
        sample_count: 1,
        dataset_id: "ds-1",
        dataset_name: "Hindi set",
        created_at: "2026-07-15 10:00:00",
        updated_at: "2026-07-15 10:00:00",
      },
    ]);

    render(<STTPage />);

    // Linked dataset stays visible because ds-1 is in the loaded list.
    expect(await screen.findAllByText("Hindi set")).not.toHaveLength(0);
    // Only the single /jobs list call is made — no GET /datasets/{id} probes.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/jobs?job_type=stt",
      expect.anything(),
    );
  });

  it("shows the empty state when no jobs come back", async () => {
    mockJobsResponse([]);

    render(<STTPage />);

    expect(await screen.findByText("No evaluations yet")).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    render(<STTPage />);

    await waitFor(() =>
      expect(screen.getByText("Failed to fetch STT jobs")).toBeInTheDocument(),
    );
  });

  it("deletes a finished evaluation via its row action and removes the row", async () => {
    const user = setupUser();
    mockJobsResponse([
      {
        uuid: "job-1",
        type: "stt-eval",
        status: "done",
        providers: ["openai"],
        language: "english",
        sample_count: 1,
        dataset_id: null,
        dataset_name: null,
        created_at: "2026-07-15 10:00:00",
        updated_at: "2026-07-15 10:00:00",
      },
    ]);

    render(<STTPage />);
    // Row is present (desktop + mobile both render the provider pill).
    expect(await screen.findAllByText("OpenAI")).not.toHaveLength(0);

    // Trash icon → confirmation dialog → confirm. The mocked fetch answers the
    // DELETE with ok:true, so onDeleted prunes the row.
    await user.click(screen.getAllByRole("button", { name: "Delete evaluation" })[0]);
    await user.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("OpenAI")).not.toBeInTheDocument(),
    );
  });
});
