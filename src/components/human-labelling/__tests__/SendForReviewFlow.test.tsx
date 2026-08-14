import { render, screen, setupUser, waitFor } from "@/test-utils";
import { SendForReviewFlow } from "../SendForReviewFlow";
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

const allInTask = new Set(["item-1", "item-2", "item-3"]);

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
  return render(
    <SendForReviewFlow
      accessToken="tok"
      taskUuid="task-1"
      visibleItems={items}
      taskItemIds={allInTask}
      evaluators={evaluators}
      {...props}
    />,
  );
}

const sendButton = () =>
  screen.getByRole("button", { name: /Send for review/ });

/** The single job-create call the flow makes. */
const createCall = () =>
  mockedApiClient.mock.calls.find(
    (c) => c[0] === "/annotation-tasks/task-1/jobs",
  );

async function waitForCreateCall() {
  await waitFor(() => expect(createCall()).toBeDefined());
}

describe("SendForReviewFlow", () => {
  beforeEach(() => {
    mockedApiClient.mockReset();
  });

  it("counts only the items still on the task on the button", () => {
    renderFlow({ taskItemIds: new Set(["item-1", "item-3"]) });
    expect(
      screen.getByRole("button", { name: "Send for review 2" }),
    ).toBeInTheDocument();
  });

  it("uses the singular for one item", () => {
    renderFlow({ taskItemIds: new Set(["item-2"]) });
    expect(
      screen.getByRole("button", { name: "Send for review 1" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when none of the items shown are still on the task", () => {
    const { container } = renderFlow({ taskItemIds: new Set<string>() });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no items on screen", () => {
    const { container } = renderFlow({ visibleItems: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there is no signed-in user yet", () => {
    const { container } = renderFlow({ accessToken: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the task is not known yet", () => {
    const { container } = renderFlow({ taskUuid: "" });
    expect(container).toBeEmptyDOMElement();
  });

  it("says how many items were removed from the task and cannot be sent", () => {
    renderFlow({ taskItemIds: new Set(["item-1"]) });
    expect(sendButton()).toHaveAttribute(
      "title",
      "Send the 1 item shown to annotators. 2 more were removed from this task and cannot be sent.",
    );
  });

  it("uses the singular when one item was removed from the task", () => {
    renderFlow({ taskItemIds: new Set(["item-1", "item-2"]) });
    expect(sendButton()).toHaveAttribute(
      "title",
      "Send the 2 items shown to annotators. 1 more was removed from this task and cannot be sent.",
    );
  });

  it("says nothing about removed items when every item can be sent", () => {
    renderFlow();
    expect(sendButton()).toHaveAttribute(
      "title",
      "Send the 3 items shown to annotators",
    );
  });

  it("creates a job from the items still on the task and reports it back", async () => {
    const user = setupUser();
    mockApi();
    renderFlow({ taskItemIds: new Set(["item-1", "item-3"]) });

    await user.click(sendButton());
    expect(await screen.findByText("Assign annotators")).toBeInTheDocument();

    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitForCreateCall();
    const call = createCall()!;
    expect(call[1]).toBe("tok");
    expect(call[2].method).toBe("POST");
    expect(call[2].body).toEqual({
      annotator_ids: ["a-1"],
      item_ids: ["item-1", "item-3"],
    });

    expect(await screen.findByText("1 new job created")).toBeInTheDocument();
    expect(screen.queryByText("Assign annotators")).not.toBeInTheDocument();
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

    await user.click(sendButton());
    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("checkbox", { name: "Show all labels" }));
    await user.click(screen.getByRole("checkbox", { name: /Fluency/ }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    await waitForCreateCall();
    expect(createCall()![2].body).toEqual({
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

    await user.click(sendButton());
    await user.click(await screen.findByRole("checkbox", { name: "Alice" }));
    await user.click(screen.getByRole("button", { name: "Assign" }));

    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(screen.getByText("Assign annotators")).toBeInTheDocument();
  });
});
