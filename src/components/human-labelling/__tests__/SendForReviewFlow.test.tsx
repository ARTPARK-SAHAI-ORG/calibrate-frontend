import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  SendForReviewFlow,
  buildSendForReviewSlot,
  reviewItemLabel,
} from "../SendForReviewFlow";
import { apiClient } from "../../../lib/api";

jest.mock("../../../lib/api", () => ({
  apiClient: jest.fn(),
}));

const mockedApiClient = apiClient as jest.Mock;

const items = [
  { uuid: "item-1", payload: { name: "First item" } },
  { uuid: "item-2", payload: { text: "no name here" } },
  { uuid: "item-3", payload: null },
];

const evaluators = [{ uuid: "ev-1", name: "Correctness" }];

const createdJobs = [
  {
    uuid: "job-1",
    public_token: "tok-1",
    annotator_id: "a-1",
    annotator_name: "Alice",
    item_count: 3,
    status: "pending",
  },
];

/** Answers both calls the flow makes: the annotator list and the job create. */
function mockApi({ createResult }: { createResult?: () => unknown } = {}) {
  mockedApiClient.mockImplementation(async (path: string) => {
    if (path === "/annotators") return [{ uuid: "a-1", name: "Alice" }];
    if (createResult) return createResult();
    return { count: 1, jobs: createdJobs };
  });
}

function renderFlow(
  props: Partial<React.ComponentProps<typeof SendForReviewFlow>> = {},
) {
  const utils = render(
    <SendForReviewFlow
      accessToken="tok"
      taskUuid="task-1"
      items={items}
      evaluators={evaluators}
      {...props}
    />,
  );
  return utils;
}

/** Opens the item picker. */
async function openPicker(user: ReturnType<typeof setupUser>) {
  await user.click(
    screen.getByRole("button", { name: /Send \d+ items? for review/ }),
  );
}

describe("reviewItemLabel", () => {
  it("uses the payload name when it has one", () => {
    expect(
      reviewItemLabel({ uuid: "u", payload: { name: "  Named  " } }, 0),
    ).toBe("Named");
  });

  it("falls back to the position for a blank, missing, or non-object payload", () => {
    expect(reviewItemLabel({ uuid: "u", payload: { name: "   " } }, 0)).toBe(
      "Item 1",
    );
    expect(reviewItemLabel({ uuid: "u", payload: { name: 7 } }, 1)).toBe(
      "Item 2",
    );
    expect(reviewItemLabel({ uuid: "u", payload: {} }, 2)).toBe("Item 3");
    expect(reviewItemLabel({ uuid: "u", payload: null }, 3)).toBe("Item 4");
    expect(reviewItemLabel({ uuid: "u", payload: "text" }, 4)).toBe("Item 5");
  });
});

describe("SendForReviewFlow", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
  });

  it("shows the number of items on the button", () => {
    renderFlow();
    expect(
      screen.getByRole("button", { name: "Send 3 items for review" }),
    ).toBeInTheDocument();
  });

  it("uses the singular for one item", () => {
    renderFlow({ items: [items[0]] });
    expect(
      screen.getByRole("button", { name: "Send 1 item for review" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when there are no items and none were dropped", () => {
    const { container } = renderFlow({ items: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("explains it plainly when every item shown was removed from the task", () => {
    renderFlow({ items: [], droppedCount: 2 });
    expect(
      screen.getByText(
        "2 items were removed from this task, so they cannot be sent for review.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /for review/ }),
    ).not.toBeInTheDocument();
  });

  it("uses the singular when the one item shown was removed from the task", () => {
    renderFlow({ items: [], droppedCount: 1 });
    expect(
      screen.getByText(
        "1 item was removed from this task, so it cannot be sent for review.",
      ),
    ).toBeInTheDocument();
  });

  it("opens the picker with every item ticked", async () => {
    const user = setupUser();
    renderFlow();
    await openPicker(user);

    expect(screen.getByText("Send for review")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).toBeChecked();
    }
  });

  it("labels each item by its name, or by its position when it has none", async () => {
    const user = setupUser();
    renderFlow();
    await openPicker(user);

    expect(screen.getByText("First item")).toBeInTheDocument();
    expect(screen.getByText("Item 2")).toBeInTheDocument();
    expect(screen.getByText("Item 3")).toBeInTheDocument();
  });

  it("drops the count by one when an item is unticked", async () => {
    const user = setupUser();
    renderFlow();
    await openPicker(user);

    await user.click(screen.getByRole("checkbox", { name: "First item" }));
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "Select all" }),
    ).not.toBeChecked();
  });

  it("puts an item back when it is ticked again", async () => {
    const user = setupUser();
    renderFlow();
    await openPicker(user);

    const first = screen.getByRole("checkbox", { name: "First item" });
    await user.click(first);
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
    await user.click(first);
    expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
  });

  it("disables Next after unselecting all, and re-ticks everything on select all", async () => {
    const user = setupUser();
    renderFlow();
    await openPicker(user);

    await user.click(screen.getByRole("checkbox", { name: "Unselect all" }));
    expect(screen.getByText("0 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(screen.getByText("3 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  });

  it("hides the select-all row when there is only one item", async () => {
    const user = setupUser();
    renderFlow({ items: [items[0]] });
    await openPicker(user);
    expect(
      screen.queryByRole("checkbox", { name: /select all/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 of 1 selected")).toBeInTheDocument();
  });

  it("warns about items that were removed from the task", async () => {
    const user = setupUser();
    renderFlow({ droppedCount: 1 });
    await openPicker(user);
    expect(
      screen.getByText(
        "1 item was removed from this task, so it cannot be sent for review.",
      ),
    ).toBeInTheDocument();
  });

  it("uses the plural wording for several dropped items", async () => {
    const user = setupUser();
    renderFlow({ droppedCount: 2 });
    await openPicker(user);
    expect(
      screen.getByText(
        "2 items were removed from this task, so they cannot be sent for review.",
      ),
    ).toBeInTheDocument();
  });

  it("closes the picker on Cancel", async () => {
    const user = setupUser();
    renderFlow();
    await openPicker(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Send for review")).not.toBeInTheDocument();
  });

  it("closes the picker with the close button", async () => {
    const user = setupUser();
    renderFlow();
    await openPicker(user);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Send for review")).not.toBeInTheDocument();
  });

  it("creates jobs from the ticked items and reports them back", async () => {
    const user = setupUser();
    mockApi();
    renderFlow();
    await openPicker(user);

    // Untick the middle item so the created job covers items 1 and 3 only.
    await user.click(screen.getByRole("checkbox", { name: "Item 2" }));
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Assign annotators")).toBeInTheDocument();

    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(
        mockedApiClient.mock.calls.some(
          (c) => c[0] === "/annotation-tasks/task-1/jobs",
        ),
      ).toBe(true),
    );
    const createCall = mockedApiClient.mock.calls.find(
      (c) => c[0] === "/annotation-tasks/task-1/jobs",
    );
    expect(createCall).toBeDefined();
    expect(createCall![1]).toBe("tok");
    expect(createCall![2].method).toBe("POST");
    expect(createCall![2].body).toEqual({
      annotator_ids: ["a-1"],
      item_ids: ["item-1", "item-3"],
    });

    expect(await screen.findByText("1 new job created")).toBeInTheDocument();
    expect(screen.queryByText("Assign annotators")).not.toBeInTheDocument();
  });

  it("keeps the unticked items unticked when going back from the annotator step", async () => {
    const user = setupUser();
    mockApi();
    renderFlow();
    await openPicker(user);

    await user.click(screen.getByRole("checkbox", { name: "Item 2" }));
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Assign annotators")).toBeInTheDocument();

    // Back to the item picker to adjust the choice.
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Send for review")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 selected")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Item 2" })).not.toBeChecked();

    // And the job it creates still leaves that item out.
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(
        mockedApiClient.mock.calls.some(
          (c) => c[0] === "/annotation-tasks/task-1/jobs",
        ),
      ).toBe(true),
    );
    const createCall = mockedApiClient.mock.calls.find(
      (c) => c[0] === "/annotation-tasks/task-1/jobs",
    );
    expect(createCall![2].body.item_ids).toEqual(["item-1", "item-3"]);
  });

  it("sends only the chosen labels when the annotator step narrows them", async () => {
    const user = setupUser();
    mockApi();
    renderFlow({
      evaluators: [
        { uuid: "ev-1", name: "Correctness" },
        { uuid: "ev-2", name: "Fluency" },
      ],
    });
    await openPicker(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("checkbox", { name: "Show all labels" }));
    await user.click(screen.getByRole("checkbox", { name: /Fluency/ }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(
        mockedApiClient.mock.calls.some(
          (c) => c[0] === "/annotation-tasks/task-1/jobs",
        ),
      ).toBe(true),
    );
    const createCall = mockedApiClient.mock.calls.find(
      (c) => c[0] === "/annotation-tasks/task-1/jobs",
    );
    expect(createCall![2].body).toEqual({
      annotator_ids: ["a-1"],
      evaluator_ids: ["ev-1"],
      item_ids: ["item-1", "item-2", "item-3"],
    });
  });

  it("keeps the assign dialog open and shows the error when creating jobs fails", async () => {
    const user = setupUser();
    mockApi({
      createResult: () => {
        throw new Error('Request failed: 500 - {"detail":"Nope"}');
      },
    });
    renderFlow();
    await openPicker(user);
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(screen.getByText("Assign annotators")).toBeInTheDocument();
  });
});

describe("buildSendForReviewSlot", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
  });

  const allInTask = new Set(["item-1", "item-2", "item-3"]);

  it("builds nothing when there is no signed-in user yet", () => {
    expect(
      buildSendForReviewSlot({
        accessToken: null,
        taskUuid: "task-1",
        taskItemIds: allInTask,
        evaluators,
      }),
    ).toBeUndefined();
    expect(
      buildSendForReviewSlot({
        accessToken: "",
        taskUuid: "task-1",
        taskItemIds: allInTask,
        evaluators,
      }),
    ).toBeUndefined();
  });

  it("builds nothing when the task is not known yet", () => {
    expect(
      buildSendForReviewSlot({
        accessToken: "tok",
        taskUuid: "",
        taskItemIds: allInTask,
        evaluators,
      }),
    ).toBeUndefined();
  });

  it("draws nothing at all when there are no items on screen", () => {
    const slot = buildSendForReviewSlot({
      accessToken: "tok",
      taskUuid: "task-1",
      taskItemIds: allInTask,
      evaluators,
    });
    expect(slot).toBeDefined();
    expect(slot!([])).toBeNull();
  });

  it("counts only the items still on the task on the button", () => {
    const slot = buildSendForReviewSlot({
      accessToken: "tok",
      taskUuid: "task-1",
      taskItemIds: new Set(["item-1", "item-3"]),
      evaluators,
    })!;
    render(<>{slot(items)}</>);
    expect(
      screen.getByRole("button", { name: "Send 2 items for review" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Send 3 items for review" }),
    ).not.toBeInTheDocument();
  });

  it("explains it plainly when every item on screen was removed from the task", () => {
    const slot = buildSendForReviewSlot({
      accessToken: "tok",
      taskUuid: "task-1",
      taskItemIds: new Set<string>(),
      evaluators,
    })!;
    render(<>{slot(items)}</>);
    expect(
      screen.getByText(
        "3 items were removed from this task, so they cannot be sent for review.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /for review/ }),
    ).not.toBeInTheDocument();
  });

  it("uses the singular when the one item on screen was removed from the task", () => {
    const slot = buildSendForReviewSlot({
      accessToken: "tok",
      taskUuid: "task-1",
      taskItemIds: new Set<string>(),
      evaluators,
    })!;
    render(<>{slot([items[0]])}</>);
    expect(
      screen.getByText(
        "1 item was removed from this task, so it cannot be sent for review.",
      ),
    ).toBeInTheDocument();
  });

  it("creates a job with only the items still on the task", async () => {
    const user = setupUser();
    mockApi();
    const slot = buildSendForReviewSlot({
      accessToken: "tok",
      taskUuid: "task-1",
      taskItemIds: new Set(["item-1", "item-3"]),
      evaluators,
    })!;
    render(<>{slot(items)}</>);

    await openPicker(user);
    expect(screen.getByText("2 of 2 selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));

    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(
        mockedApiClient.mock.calls.some(
          (c) => c[0] === "/annotation-tasks/task-1/jobs",
        ),
      ).toBe(true),
    );
    const createCall = mockedApiClient.mock.calls.find(
      (c) => c[0] === "/annotation-tasks/task-1/jobs",
    );
    expect(createCall![2].body.item_ids).toEqual(["item-1", "item-3"]);
  });
});
