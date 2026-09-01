import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
  abortRun,
  abortRunOrNotify,
  clearTestRunCache,
  deleteRun,
  deleteRunOrNotify,
  getCachedTestRun,
  renameRun,
  startTestRun,
  startTestRunOrNotify,
  fetchTestRun,
  isTerminalRunStatus,
  UnauthorizedError,
} from "../testRunApi";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("../reportError", () => ({
  reportError: jest.fn(),
}));

// The workspace limit on how many tests one run may cover. Relative specifier:
// jest.mock() does not resolve the "@/" alias.
const getMaxRowsPerEval = jest.fn(async () => 20);
jest.mock("../../hooks/useMaxRowsPerEval", () => ({
  getMaxRowsPerEval: (...args: unknown[]) => getMaxRowsPerEval(...args),
}));

const BACKEND_URL = "http://backend.test";
const TOKEN = "test-token";

function jsonResponse(body: any, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body };
}

describe("testRunApi", () => {
  beforeEach(() => {
    (global.fetch as any) = jest.fn();
    clearTestRunCache();
  });

  afterEach(() => {
    jest.clearAllMocks();
    getMaxRowsPerEval.mockResolvedValue(20);
    localStorage.clear();
  });

  describe("startTestRun", () => {
    it("sends an empty body when testUuids is null and returns the task id", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-1", status: "in_progress" }),
      );

      const taskId = await startTestRun(BACKEND_URL, TOKEN, "agent-1", null);

      expect(taskId).toBe("task-1");
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${BACKEND_URL}/agent-tests/agent/agent-1/run`);
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({});
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("sends test_uuids when they are provided", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-2", status: "queued" }),
      );

      const taskId = await startTestRun(BACKEND_URL, TOKEN, "agent-1", [
        "t-1",
        "t-2",
      ]);

      expect(taskId).toBe("task-2");
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ test_uuids: ["t-1", "t-2"] });
    });

    it("throws UnauthorizedError on a 401", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );
      await expect(
        startTestRun(BACKEND_URL, TOKEN, "agent-1", null),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws a plain Error on other non-ok responses", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 500),
      );
      await expect(
        startTestRun(BACKEND_URL, TOKEN, "agent-1", null),
      ).rejects.toThrow("Failed to start test run");
      await expect(
        startTestRun(BACKEND_URL, TOKEN, "agent-1", null),
      ).rejects.not.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("startTestRunOrNotify", () => {
    it("returns the new task id on success", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-9" }),
      );

      await expect(
        startTestRunOrNotify(BACKEND_URL, TOKEN, "agent-1", ["t-1"]),
      ).resolves.toBe("task-9");
      expect(signOut).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("signs the user out and returns null on a 401", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );

      await expect(
        startTestRunOrNotify(BACKEND_URL, TOKEN, "agent-1", null),
      ).resolves.toBeNull();
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("blocks a run of more tests than the workspace allows", async () => {
      getMaxRowsPerEval.mockResolvedValue(2);

      await expect(
        startTestRunOrNotify(BACKEND_URL, TOKEN, "agent-1", [
          "t-1",
          "t-2",
          "t-3",
        ]),
      ).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
      // The limit toast carries the contact link, so it is not the plain one.
      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).not.toHaveBeenCalledWith(
        "Could not start the test run. Please try again.",
      );
    });

    it("counts the tests the caller names when the run covers every linked test", async () => {
      getMaxRowsPerEval.mockResolvedValue(2);

      // testUuids is null (run everything linked), so the size comes from the
      // count the caller passes.
      await expect(
        startTestRunOrNotify(BACKEND_URL, TOKEN, "agent-1", null, 5),
      ).resolves.toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("starts a run that is exactly on the limit", async () => {
      getMaxRowsPerEval.mockResolvedValue(2);
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-10" }),
      );

      await expect(
        startTestRunOrNotify(BACKEND_URL, TOKEN, "agent-1", null, 2),
      ).resolves.toBe("task-10");
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("shows an error toast and returns null on any other failure", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 500),
      );

      await expect(
        startTestRunOrNotify(BACKEND_URL, TOKEN, "agent-1", null),
      ).resolves.toBeNull();
      expect(signOut).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Could not start the test run. Please try again.",
      );
    });
  });

  describe("fetchTestRun", () => {
    it("returns the parsed run payload", async () => {
      const payload = {
        task_id: "task-1",
        status: "done",
        results: [{ test_uuid: "t-1", passed: true }],
      };
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(payload));

      await expect(fetchTestRun(BACKEND_URL, TOKEN, "task-1")).resolves.toEqual(
        payload,
      );
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${BACKEND_URL}/agent-tests/run/task-1`);
      expect(init.method).toBe("GET");
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("throws UnauthorizedError on a 401", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );
      await expect(
        fetchTestRun(BACKEND_URL, TOKEN, "task-1"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws a plain Error on other non-ok responses", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 404),
      );
      await expect(fetchTestRun(BACKEND_URL, TOKEN, "task-1")).rejects.toThrow(
        "Failed to fetch test run",
      );
      await expect(
        fetchTestRun(BACKEND_URL, TOKEN, "task-1"),
      ).rejects.not.toBeInstanceOf(UnauthorizedError);
    });
  });

  describe("remembering finished runs", () => {
    const run = (taskId: string, status = "done", name?: string) => ({
      task_id: taskId,
      status,
      name,
      results: [{ test_case_id: "t-1", passed: true }],
    });

    it("keeps a finished run so it can be shown again without a download", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(run("task-1")));

      expect(getCachedTestRun("task-1")).toBeUndefined();
      await fetchTestRun(BACKEND_URL, TOKEN, "task-1");

      expect(getCachedTestRun("task-1")).toEqual(run("task-1"));
      // A second read of the same run still answers from the same copy.
      await fetchTestRun(BACKEND_URL, TOKEN, "task-1");
      expect(getCachedTestRun("task-1")).toEqual(run("task-1"));
    });

    it.each(["queued", "in_progress"])(
      "never keeps a run that is still %s",
      async (status) => {
        (global.fetch as jest.Mock).mockResolvedValue(
          jsonResponse(run("task-1", status)),
        );

        await fetchTestRun(BACKEND_URL, TOKEN, "task-1");

        expect(getCachedTestRun("task-1")).toBeUndefined();
      },
    );

    it("keeps only the three most recent runs", async () => {
      for (const id of ["task-1", "task-2", "task-3", "task-4"]) {
        (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(run(id)));
        await fetchTestRun(BACKEND_URL, TOKEN, id);
      }

      expect(getCachedTestRun("task-1")).toBeUndefined();
      expect(getCachedTestRun("task-2")).toBeDefined();
      expect(getCachedTestRun("task-3")).toBeDefined();
      expect(getCachedTestRun("task-4")).toBeDefined();
    });

    it("forgets a run that has just been renamed, so the old name cannot come back", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse(run("task-1", "done", "Old name")),
      );
      await fetchTestRun(BACKEND_URL, TOKEN, "task-1");
      expect(getCachedTestRun("task-1")?.name).toBe("Old name");

      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-1", name: "New name" }),
      );
      await renameRun(BACKEND_URL, TOKEN, "task-1", "New name");

      expect(getCachedTestRun("task-1")).toBeUndefined();
    });
  });

  describe("renameRun", () => {
    it("sends the trimmed name and returns the name as it now reads", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-1", name: "Regression before v2" }),
      );

      const name = await renameRun(
        BACKEND_URL,
        TOKEN,
        "task-1",
        "  Regression before v2  ",
      );

      expect(name).toBe("Regression before v2");
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${BACKEND_URL}/agent-tests/run/task-1/name`);
      expect(init.method).toBe("PATCH");
      expect(JSON.parse(init.body)).toEqual({ name: "Regression before v2" });
    });

    it("sends null for an empty name and returns the automatic one", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-1", name: "Run 3" }),
      );

      const name = await renameRun(BACKEND_URL, TOKEN, "task-1", "   ");

      expect(name).toBe("Run 3");
      const [, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({ name: null });
    });

    it("throws UnauthorizedError on a 401", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );

      await expect(
        renameRun(BACKEND_URL, TOKEN, "task-1", "New name"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws when the run is not found", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 404),
      );

      await expect(
        renameRun(BACKEND_URL, TOKEN, "task-1", "New name"),
      ).rejects.toThrow("Failed to rename the run");
    });
  });

  describe("abortRun", () => {
    it("posts to the one abort route, for a run and a comparison alike", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-1", status: "done", aborted: true }),
      );

      await abortRun(BACKEND_URL, TOKEN, "task-1");

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${BACKEND_URL}/agent-tests/run/task-1/abort`);
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("throws UnauthorizedError on a 401", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );
      await expect(
        abortRun(BACKEND_URL, TOKEN, "task-1"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws a plain Error when the run has already ended", async () => {
      // The backend answers 400 with "Can only stop a run that is queued or
      // in progress".
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ detail: "Can only stop a run that is queued or in progress" }, false, 400),
      );
      await expect(abortRun(BACKEND_URL, TOKEN, "task-1")).rejects.toThrow(
        "Failed to stop the run",
      );
    });
  });

  describe("abortRunOrNotify", () => {
    it("says the run was stopped", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ task_id: "task-1", status: "done", aborted: true }),
      );

      await expect(
        abortRunOrNotify(BACKEND_URL, TOKEN, "task-1"),
      ).resolves.toBe(true);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("signs the user out on a 401 and says it did not stop", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );

      await expect(
        abortRunOrNotify(BACKEND_URL, TOKEN, "task-1"),
      ).resolves.toBe(false);
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("shows one message on any other failure", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 500),
      );

      await expect(
        abortRunOrNotify(BACKEND_URL, TOKEN, "task-1"),
      ).resolves.toBe(false);
      expect(signOut).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Could not stop the run. Please try again.",
      );
    });
  });

  describe("deleteRun", () => {
    it("deletes through the one job route, for a run and a comparison alike", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ message: "Agent test job deleted successfully" }),
      );

      await deleteRun(BACKEND_URL, TOKEN, "task-1");

      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe(`${BACKEND_URL}/agent-tests/job/task-1`);
      expect(init.method).toBe("DELETE");
      expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    });

    it("throws UnauthorizedError on a 401", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );
      await expect(
        deleteRun(BACKEND_URL, TOKEN, "task-1"),
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it("throws a plain Error when the run is already gone", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({ detail: "Job not found" }, false, 404),
      );
      await expect(deleteRun(BACKEND_URL, TOKEN, "task-1")).rejects.toThrow(
        "Failed to delete the run",
      );
    });
  });

  describe("deleteRunOrNotify", () => {
    it("says the run was deleted", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(jsonResponse({}));

      await expect(
        deleteRunOrNotify(BACKEND_URL, TOKEN, "task-1"),
      ).resolves.toBe(true);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("signs the user out on a 401 and says it did not delete", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 401),
      );

      await expect(
        deleteRunOrNotify(BACKEND_URL, TOKEN, "task-1"),
      ).resolves.toBe(false);
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("shows one message on any other failure", async () => {
      (global.fetch as jest.Mock).mockResolvedValue(
        jsonResponse({}, false, 500),
      );

      await expect(
        deleteRunOrNotify(BACKEND_URL, TOKEN, "task-1"),
      ).resolves.toBe(false);
      expect(signOut).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalledWith(
        "Could not delete the evaluation. Please try again.",
      );
    });
  });

  describe("isTerminalRunStatus", () => {
    it.each(["done", "completed", "failed"])("is true for %s", (status) => {
      expect(isTerminalRunStatus(status)).toBe(true);
    });

    it.each(["queued", "in_progress", "", "running"])(
      "is false for %s",
      (status) => {
        expect(isTerminalRunStatus(status)).toBe(false);
      },
    );
  });
});
