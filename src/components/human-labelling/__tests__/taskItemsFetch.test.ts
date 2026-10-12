import {
  latestRequestGuard,
  waitForTaskEvaluators,
} from "../taskItemsFetch";

describe("waitForTaskEvaluators", () => {
  it("waits while score filters need the task's evaluators", () => {
    expect(waitForTaskEvaluators(1, false, false)).toBe(true);
  });

  it("does not wait without score filters or once the task is here", () => {
    expect(waitForTaskEvaluators(0, false, false)).toBe(false);
    expect(waitForTaskEvaluators(1, true, true)).toBe(false);
  });

  it("stops waiting when the task request failed", () => {
    expect(waitForTaskEvaluators(1, false, true)).toBe(false);
  });
});

describe("latestRequestGuard", () => {
  it("only the latest request stays current", () => {
    const guard = latestRequestGuard();
    const first = guard.start();
    expect(first()).toBe(true);
    const second = guard.start();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
});
