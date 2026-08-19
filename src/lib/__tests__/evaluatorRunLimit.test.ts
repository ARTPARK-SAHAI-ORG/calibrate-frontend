import { evaluatorRunLimitMessage } from "../evaluatorRunLimit";
import { getMaxRowsPerEval } from "@/hooks/useMaxRowsPerEval";

// Relative specifier: jest.mock() does not resolve the "@/" alias.
jest.mock("../../hooks/useMaxRowsPerEval", () => ({
  getMaxRowsPerEval: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: { error: jest.fn() },
}));

const getMax = getMaxRowsPerEval as jest.Mock;

describe("evaluatorRunLimitMessage", () => {
  afterEach(() => jest.clearAllMocks());

  it("returns nothing when the run fits", async () => {
    getMax.mockResolvedValue(20);
    expect(await evaluatorRunLimitMessage("token", 10, 2)).toBeNull();
  });

  it("counts every item once per evaluator", async () => {
    getMax.mockResolvedValue(20);
    // 11 items times 2 evaluators is 22 scores, over a limit of 20.
    expect(await evaluatorRunLimitMessage("token", 11, 2)).toBe(
      "This run would score 22 items, which is over your limit of 20. Pick fewer items or fewer evaluators.",
    );
  });

  it("reads the limit for the signed-in workspace", async () => {
    getMax.mockResolvedValue(5);
    await evaluatorRunLimitMessage("token-1", 1, 1);
    expect(getMax).toHaveBeenCalledWith("token-1");
  });
});
