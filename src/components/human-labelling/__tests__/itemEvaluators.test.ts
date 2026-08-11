import { act, renderHook } from "@/test-utils";
import {
  bulkUpdateItemEvaluators,
  effectiveEvaluatorIds,
  filterEvaluatorsForItem,
  isCustomisedItem,
  seedItemEvaluatorIds,
  useItemEvaluatorSelection,
} from "../itemEvaluators";
import { apiClient } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({ apiClient: jest.fn() }));

const mockedApiClient = apiClient as jest.MockedFunction<typeof apiClient>;

const TASK_IDS = ["tone", "accuracy", "politeness"];

describe("effectiveEvaluatorIds", () => {
  it("falls back to the task's list when the item has none", () => {
    expect(effectiveEvaluatorIds({ evaluator_ids: null }, TASK_IDS)).toEqual(
      TASK_IDS,
    );
  });

  it("falls back to the task's list for a missing item", () => {
    expect(effectiveEvaluatorIds(null, TASK_IDS)).toEqual(TASK_IDS);
    expect(effectiveEvaluatorIds(undefined, TASK_IDS)).toEqual(TASK_IDS);
  });

  it("uses the item's own list when it has one", () => {
    expect(
      effectiveEvaluatorIds(
        { evaluator_ids: ["tone"], effective_evaluator_ids: ["tone"] },
        TASK_IDS,
      ),
    ).toEqual(["tone"]);
  });

  it("drops an evaluator the task no longer has", () => {
    // The saved list is never rewritten when the task drops an evaluator, so a
    // stale id can still arrive. It must not be rendered or sent back.
    expect(
      effectiveEvaluatorIds(
        { evaluator_ids: ["tone", "gone"], effective_evaluator_ids: ["tone", "gone"] },
        TASK_IDS,
      ),
    ).toEqual(["tone"]);
  });

  it("returns an empty list when nothing survives", () => {
    expect(
      effectiveEvaluatorIds({ effective_evaluator_ids: ["gone"] }, TASK_IDS),
    ).toEqual([]);
  });
});

describe("isCustomisedItem", () => {
  it("is true only when a list was saved", () => {
    expect(isCustomisedItem({ evaluator_ids: ["tone"] })).toBe(true);
    expect(isCustomisedItem({ evaluator_ids: [] })).toBe(true);
    expect(isCustomisedItem({ evaluator_ids: null })).toBe(false);
    expect(isCustomisedItem({})).toBe(false);
    expect(isCustomisedItem(null)).toBe(false);
  });
});

describe("filterEvaluatorsForItem", () => {
  const evaluators = [
    { uuid: "tone", name: "Tone" },
    { uuid: "accuracy", name: "Accuracy" },
    { uuid: "politeness", name: "Politeness" },
  ];

  it("keeps everything when the item has no list", () => {
    expect(filterEvaluatorsForItem(evaluators, null)).toEqual(evaluators);
    expect(filterEvaluatorsForItem(evaluators, undefined)).toEqual(evaluators);
  });

  it("keeps the task's order, not the order of the ids", () => {
    expect(
      filterEvaluatorsForItem(evaluators, ["politeness", "tone"]),
    ).toEqual([
      { uuid: "tone", name: "Tone" },
      { uuid: "politeness", name: "Politeness" },
    ]);
  });

  it("ignores an id that is not on the task", () => {
    expect(filterEvaluatorsForItem(evaluators, ["tone", "gone"])).toEqual([
      { uuid: "tone", name: "Tone" },
    ]);
  });
});

describe("seedItemEvaluatorIds", () => {
  it("uses every task evaluator when the item follows the task", () => {
    expect(seedItemEvaluatorIds(TASK_IDS, null)).toEqual(TASK_IDS);
    expect(seedItemEvaluatorIds(TASK_IDS, undefined)).toEqual(TASK_IDS);
  });

  it("keeps the item's own list, in the task's order", () => {
    expect(seedItemEvaluatorIds(TASK_IDS, ["politeness", "tone"])).toEqual([
      "tone",
      "politeness",
    ]);
  });

  it("drops an id the task no longer has", () => {
    expect(seedItemEvaluatorIds(TASK_IDS, ["tone", "gone"])).toEqual(["tone"]);
  });

  it("falls back to every task evaluator when nothing survives", () => {
    expect(seedItemEvaluatorIds(TASK_IDS, ["gone"])).toEqual(TASK_IDS);
    expect(seedItemEvaluatorIds(TASK_IDS, [])).toEqual(TASK_IDS);
  });
});

describe("useItemEvaluatorSelection", () => {
  const taskEvaluators = TASK_IDS.map((uuid) => ({ uuid }));

  const setup = (initial?: string[] | null) =>
    renderHook(() => useItemEvaluatorSelection(taskEvaluators, initial, true));

  it("starts on the task's list, unchanged and not customised", () => {
    const { result } = setup(null);
    expect(result.current.selectedIds).toEqual(TASK_IDS);
    expect(result.current.isCustomised).toBe(false);
    expect(result.current.changed).toBe(false);
    expect(result.current.submitValue).toBeUndefined();
    expect(result.current.canSubmit).toBe(true);
  });

  it("reports the narrowed list once the user picks fewer", () => {
    const { result } = setup(null);
    act(() => result.current.select(["tone"]));
    expect(result.current.isCustomised).toBe(true);
    expect(result.current.changed).toBe(true);
    expect(result.current.submitValue).toEqual(["tone"]);
  });

  it("reports null once the selection is the task's whole list again", () => {
    const { result } = setup(["tone"]);
    act(() => result.current.select(TASK_IDS));
    expect(result.current.isCustomised).toBe(false);
    expect(result.current.submitValue).toBeNull();
  });

  it("reports nothing when the user ends back where they started", () => {
    const { result } = setup(["tone"]);
    act(() => result.current.select(["tone", "accuracy"]));
    act(() => result.current.select(["tone"]));
    expect(result.current.changed).toBe(false);
    expect(result.current.submitValue).toBeUndefined();
  });

  it("follows the task again on request", () => {
    const { result } = setup(["tone"]);
    act(() => result.current.followTask());
    expect(result.current.selectedIds).toEqual(TASK_IDS);
    expect(result.current.submitValue).toBeNull();
  });

  it("blocks submitting with nothing picked", () => {
    const { result } = setup(null);
    act(() => result.current.select([]));
    expect(result.current.canSubmit).toBe(false);
  });

  it("allows submitting when the task has no evaluators at all", () => {
    const { result } = renderHook(() =>
      useItemEvaluatorSelection([], null, true),
    );
    expect(result.current.canSubmit).toBe(true);
    expect(result.current.submitValue).toBeUndefined();
  });

  it("re-seeds when the dialog is reopened", () => {
    const { result, rerender } = renderHook(
      ({ isOpen }: { isOpen: boolean }) =>
        useItemEvaluatorSelection(taskEvaluators, ["tone"], isOpen),
      { initialProps: { isOpen: true } },
    );
    act(() => result.current.select(TASK_IDS));
    rerender({ isOpen: false });
    rerender({ isOpen: true });
    expect(result.current.selectedIds).toEqual(["tone"]);
    expect(result.current.changed).toBe(false);
  });
});

describe("bulkUpdateItemEvaluators", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
  });

  it("posts the chosen items and returns how many changed", async () => {
    mockedApiClient.mockResolvedValue({ updated_count: 40 });
    const count = await bulkUpdateItemEvaluators(
      "task-1",
      "token-1",
      "remove",
      ["politeness"],
      { item_ids: ["item-1", "item-2"] },
    );
    expect(count).toBe(40);
    expect(mockedApiClient).toHaveBeenCalledWith(
      "/annotation-tasks/task-1/items/evaluators",
      "token-1",
      {
        method: "POST",
        body: {
          action: "remove",
          evaluator_ids: ["politeness"],
          item_ids: ["item-1", "item-2"],
        },
      },
    );
  });

  it("passes a select-all scope through with its search", async () => {
    mockedApiClient.mockResolvedValue({ updated_count: 7 });
    await bulkUpdateItemEvaluators("task-1", "token-1", "add", ["tone"], {
      select_all: true,
      q: "refund",
    });
    expect(mockedApiClient).toHaveBeenCalledWith(
      "/annotation-tasks/task-1/items/evaluators",
      "token-1",
      {
        method: "POST",
        body: {
          action: "add",
          evaluator_ids: ["tone"],
          select_all: true,
          q: "refund",
        },
      },
    );
  });

  it("reads a missing count as zero", async () => {
    mockedApiClient.mockResolvedValue({});
    await expect(
      bulkUpdateItemEvaluators("task-1", "token-1", "add", ["tone"], {
        select_all: true,
      }),
    ).resolves.toBe(0);
  });
});
