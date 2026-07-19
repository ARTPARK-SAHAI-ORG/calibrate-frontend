import { signOut } from "next-auth/react";
import { toast } from "sonner";
import {
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

const BACKEND_URL = "http://backend.test";
const TOKEN = "test-token";

function jsonResponse(body: any, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body };
}

describe("testRunApi", () => {
  beforeEach(() => {
    (global.fetch as any) = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
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
