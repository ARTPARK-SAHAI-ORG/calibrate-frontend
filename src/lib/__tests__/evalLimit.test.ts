import { overEvalLimit } from "@/lib/evalLimit";
import { apiPost } from "@/lib/api";
import { getMaxRowsPerEval } from "@/hooks/useMaxRowsPerEval";
import { reportError } from "@/lib/reportError";
import { toast } from "sonner";

jest.mock("../api", () => ({ __esModule: true, apiPost: jest.fn() }));
jest.mock("../../hooks/useMaxRowsPerEval", () => ({
  __esModule: true,
  getMaxRowsPerEval: jest.fn(),
}));
jest.mock("../reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));
jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));

const mockPost = apiPost as jest.Mock;
const mockMax = getMaxRowsPerEval as jest.Mock;

describe("overEvalLimit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMax.mockResolvedValue(10);
    mockPost.mockResolvedValue({});
  });

  it("records the hit and returns true when over the limit", async () => {
    await expect(
      overEvalLimit("tok", 30, "tests", "model_comparison"),
    ).resolves.toBe(true);
    expect(toast.error).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith("/org-limits/hits", "tok", {
      limit_name: "max_rows_per_eval",
      kind: "model_comparison",
      requested: 30,
    });
  });

  it("records nothing within the limit", async () => {
    await expect(overEvalLimit("tok", 10, "tests", "test_run")).resolves.toBe(
      false,
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("records nothing when the workspace has no limit", async () => {
    mockMax.mockResolvedValue(null);
    await expect(overEvalLimit("tok", 9999, "rows", "stt")).resolves.toBe(
      false,
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("still returns true, and reports the failure, when recording fails", async () => {
    mockPost.mockRejectedValue(new Error("down"));
    await expect(overEvalLimit("tok", 30, "rows", "tts")).resolves.toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(reportError).toHaveBeenCalledWith(
      "Failed to record limit hit",
      expect.any(Error),
    );
  });

  it("does not wait for the record before answering", async () => {
    mockPost.mockReturnValue(new Promise(() => {}));
    await expect(overEvalLimit("tok", 30, "tests", "test_run")).resolves.toBe(
      true,
    );
  });
});
