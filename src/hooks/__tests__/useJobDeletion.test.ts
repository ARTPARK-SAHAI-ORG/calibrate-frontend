/**
 * Unit tests for useJobDeletion — the shared selection + delete logic behind
 * the STT/TTS evaluation lists. Covers: only finished jobs are selectable,
 * select-all, single vs bulk delete routing, the 400 all-or-nothing rejection,
 * 401 sign-out, and generic failures.
 */
import { renderHook, act } from "@testing-library/react";
import { signOut } from "next-auth/react";
import { useJobDeletion } from "@/hooks/useJobDeletion";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockSignOut = signOut as jest.Mock;
const mockReportError = reportError as jest.Mock;

type Job = { uuid: string; status: string };
const jobs: Job[] = [
  { uuid: "done-1", status: "done" },
  { uuid: "failed-1", status: "failed" },
  { uuid: "queued-1", status: "queued" },
  { uuid: "running-1", status: "in_progress" },
];

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000";
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

function setup(onDeleted: jest.Mock = jest.fn()) {
  const utils = renderHook(() =>
    useJobDeletion<Job>({ jobs, onDeleted, accessToken: "tok" }),
  );
  return { ...utils, onDeleted };
}

describe("selection", () => {
  it("only lets finished jobs be selected", () => {
    const { result } = setup();

    // Finished job → enabled, no tooltip.
    const doneProps = result.current.jobCheckboxProps(jobs[0]);
    expect(doneProps.disabled).toBe(false);
    expect(doneProps.tooltip).toBeUndefined();

    // Toggling a finished job selects it.
    act(() => doneProps.onToggle());
    expect(result.current.selectedJobUuids.has("done-1")).toBe(true);
  });

  it("disables queued/in-progress jobs with a status-specific tooltip", () => {
    const { result } = setup();

    const queued = result.current.jobCheckboxProps(jobs[2]);
    expect(queued.disabled).toBe(true);
    expect(queued.tooltip).toMatch(/Queued/);

    const running = result.current.jobCheckboxProps(jobs[3]);
    expect(running.disabled).toBe(true);
    expect(running.tooltip).toMatch(/In-progress/);

    // Toggling a non-finished job is a no-op.
    act(() => queued.onToggle());
    expect(result.current.selectedJobUuids.size).toBe(0);
  });

  it("opens and closes the delete dialog, clearing any error", () => {
    const { result } = setup();

    act(() => result.current.openDeleteDialog(jobs[0]));
    expect(result.current.deleteDialogOpen).toBe(true);

    act(() => result.current.closeDeleteDialog());
    expect(result.current.deleteDialogOpen).toBe(false);
    expect(result.current.deleteError).toBeNull();
  });

  it("select-all picks only the finished jobs, then clears", () => {
    const { result } = setup();

    act(() => result.current.toggleSelectAll());
    expect(result.current.selectedJobUuids.size).toBe(2);
    expect(result.current.allSelected).toBe(true);
    expect(result.current.hasBulkDeletableJobs).toBe(true);

    act(() => result.current.toggleSelectAll());
    expect(result.current.selectedJobUuids.size).toBe(0);
    expect(result.current.allSelected).toBe(false);
  });
});

describe("bulk delete", () => {
  it("issues one DELETE /jobs with the selected uuids and prunes them", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deleted_count: 2 }),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.toggleSelectAll());
    act(() => result.current.openBulkDeleteDialog());
    await act(async () => {
      await result.current.deleteJobs();
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/jobs",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ job_uuids: ["done-1", "failed-1"] }),
      }),
    );
    expect(onDeleted).toHaveBeenCalledWith(["done-1", "failed-1"]);
    expect(result.current.selectedJobUuids.size).toBe(0);
    expect(result.current.deleteDialogOpen).toBe(false);
  });

  it("falls back to the server message when 400 lists no blockers", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ detail: { message: "Server said no." } }),
    }) as unknown as typeof fetch;
    const { result } = setup();

    act(() => result.current.toggleSelectAll());
    act(() => result.current.openBulkDeleteDialog());
    await act(async () => {
      await result.current.deleteJobs();
    });

    expect(result.current.deleteError).toBe("Server said no.");
  });

  it("surfaces a 400 rejection and deletes nothing", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        detail: {
          message: "blocked",
          active: ["running-1"],
          not_found: ["ghost"],
        },
      }),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.toggleSelectAll());
    act(() => result.current.openBulkDeleteDialog());
    await act(async () => {
      await result.current.deleteJobs();
    });

    expect(onDeleted).not.toHaveBeenCalled();
    expect(result.current.deleteError).toMatch(/still running/);
    expect(result.current.deleteError).toMatch(/no longer available/);
    // Dialog stays open so the user can read the reason.
    expect(result.current.deleteDialogOpen).toBe(true);
  });
});

describe("single delete", () => {
  it("issues DELETE /jobs/{uuid} without a body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.openDeleteDialog(jobs[0]));
    await act(async () => {
      await result.current.deleteJobs();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "http://localhost:8000/jobs/done-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.body).toBeUndefined();
    expect(onDeleted).toHaveBeenCalledWith(["done-1"]);
  });
});

describe("auth + errors", () => {
  it("signs the user out on 401", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.openDeleteDialog(jobs[0]));
    await act(async () => {
      await result.current.deleteJobs();
    });

    expect(mockSignOut).toHaveBeenCalled();
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("reports and surfaces a generic error when the request throws", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("network")) as unknown as typeof fetch;
    const { result, onDeleted } = setup();

    act(() => result.current.openDeleteDialog(jobs[0]));
    await act(async () => {
      await result.current.deleteJobs();
    });

    expect(mockReportError).toHaveBeenCalled();
    expect(result.current.deleteError).toMatch(/Something went wrong/);
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
