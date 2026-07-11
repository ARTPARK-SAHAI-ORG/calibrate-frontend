import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  AnnotationJobView,
  jobStatusLabel,
  jobStatusPillClass,
  type AnnotationJobMeta,
} from "../AnnotationJobView";

// jsdom doesn't implement scrollIntoView; the shared conversation renderer
// (TestDetailView, used by LlmItemPane) calls it to keep the latest message
// in view.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

const confettiMock = jest.fn();
jest.mock("canvas-confetti", () => ({
  __esModule: true,
  default: (...args: unknown[]) => confettiMock(...args),
}));

jest.mock("../../../lib/api", () => ({
  getBackendUrl: () => "https://backend.example.com",
}));

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const evaluators = [
  {
    uuid: "ev-1",
    name: "Correctness",
    description: "Is the answer right",
    evaluator_type: "custom",
    output_type: "binary" as const,
  },
  {
    uuid: "ev-2",
    name: "Quality",
    description: "How good",
    evaluator_type: "custom",
    output_type: "rating" as const,
    scale_min: 1,
    scale_max: 5,
  },
];

const items = [
  {
    id: 1,
    uuid: "item-1",
    task_id: "task-1",
    payload: { name: "Item One", chat_history: [], agent_response: "hi" },
    created_at: "2024-01-01",
    deleted_at: null,
  },
  {
    id: 2,
    uuid: "item-2",
    task_id: "task-1",
    payload: { name: "Item Two", chat_history: [], agent_response: "bye" },
    created_at: "2024-01-02",
    deleted_at: null,
  },
];

function jobResponse(overrides: Record<string, unknown> = {}) {
  return {
    job: {
      uuid: "job-1",
      status: "pending",
      created_at: "2024-01-01",
      completed_at: null,
      is_public: false,
      view_token: null,
    },
    annotator: { uuid: "ann-1", name: "Alice" },
    task: { uuid: "task-1", name: "My Task", type: "llm" },
    evaluators,
    items,
    annotations: [],
    read_only: false,
    ...overrides,
  };
}

describe("jobStatusPillClass / jobStatusLabel", () => {
  it("maps every status to a pill class and label", () => {
    expect(jobStatusLabel("pending")).toBe("Pending");
    expect(jobStatusLabel("in_progress")).toBe("In progress");
    expect(jobStatusLabel("completed")).toBe("Completed");
    expect(jobStatusPillClass("pending")).toContain("gray");
    expect(jobStatusPillClass("in_progress")).toContain("yellow");
    expect(jobStatusPillClass("completed")).toContain("green");
  });
});

describe("AnnotationJobView", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("shows a loading state, then the job", async () => {
    let resolveFn: (v: Response) => void = () => {};
    fetchMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    resolveFn(jsonResponse(jobResponse()));
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example.com/public/annotation-jobs/tok",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("uses the viewer-token endpoint for public-readonly mode", async () => {
    fetchMock.mockResolvedValue(jsonResponse(jobResponse()));
    render(<AnnotationJobView token="tok" mode="public-readonly" />);
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backend.example.com/public/annotation-jobs/view/tok",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("shows a 404 state", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 404));
    render(<AnnotationJobView token="bad-tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("404")).toBeInTheDocument());
    expect(screen.getByText("Link not found")).toBeInTheDocument();
  });

  it("shows an error state for other non-ok statuses", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() =>
      expect(screen.getByText("Request failed (500)")).toBeInTheDocument(),
    );
  });

  it("shows an error state when fetch throws", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() =>
      expect(screen.getByText("network down")).toBeInTheDocument(),
    );
  });

  it("does nothing when token is empty", () => {
    render(<AnnotationJobView token="" mode="public" />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls onLoaded with the job meta once loaded", async () => {
    fetchMock.mockResolvedValue(jsonResponse(jobResponse()));
    const onLoaded = jest.fn();
    render(<AnnotationJobView token="tok" mode="public" onLoaded={onLoaded} />);
    await waitFor(() => expect(onLoaded).toHaveBeenCalled());
    const meta: AnnotationJobMeta = onLoaded.mock.calls[0][0];
    expect(meta.task).toEqual({ uuid: "task-1", name: "My Task", type: "llm" });
    expect(meta.annotator).toEqual({ uuid: "ann-1", name: "Alice" });
    expect(meta.jobStatus).toBe("pending");
    expect(meta.evaluators).toEqual([
      { uuid: "ev-1", name: "Correctness" },
      { uuid: "ev-2", name: "Quality" },
    ]);
    expect(meta.job).toEqual({ uuid: "job-1", is_public: false, view_token: null });
  });

  it("starts on the first incomplete item in write mode", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        jobResponse({
          annotations: [
            {
              uuid: "a1",
              job_id: "job-1",
              item_id: "item-1",
              evaluator_id: "ev-1",
              value: { value: true },
              created_at: "",
              updated_at: "",
            },
            {
              uuid: "a2",
              job_id: "job-1",
              item_id: "item-1",
              evaluator_id: "ev-2",
              value: { value: 3 },
              created_at: "",
              updated_at: "",
            },
          ],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());
    // item-1 has both evaluators saved, so it starts on item-2.
    expect(screen.getByText("Item 2 of 2")).toBeInTheDocument();
  });

  it("always starts on item 1 in admin / read-only mode even with incomplete items", async () => {
    fetchMock.mockResolvedValue(jsonResponse(jobResponse({ read_only: true })));
    render(<AnnotationJobView token="tok" mode="admin" fillViewport={false} />);
    await waitFor(() =>
      expect(screen.getByText("Item 1 of 2")).toBeInTheDocument(),
    );
    // Admin mode hides the top task header row.
    expect(screen.queryByText("My Task")).not.toBeInTheDocument();
  });

  it("navigates with Previous/Next and the sidebar item buttons", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValue(jsonResponse(jobResponse()));
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("Item 1 of 2")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Item 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByText("Item 1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();

    const sidebarButtons = screen.getAllByTitle(/^Item 2/);
    await user.click(sidebarButtons[0]);
    expect(screen.getByText("Item 2 of 2")).toBeInTheDocument();
  });

  it("shows 'No items in this job.' when there are no items", async () => {
    fetchMock.mockResolvedValue(jsonResponse(jobResponse({ items: [] })));
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() =>
      expect(screen.getByText("No items in this job.")).toBeInTheDocument(),
    );
  });

  it("disables Submit until every evaluator is answered, then submits and advances", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(jsonResponse(jobResponse()));
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());

    const submitButton = screen.getByRole("button", { name: "Submit & Next" });
    expect(submitButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Correct" }));
    expect(submitButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "3" }));
    expect(submitButton).toBeEnabled();

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ saved: ["ev-1", "ev-2"], count: 2, status: "pending" }),
    );
    await user.click(submitButton);

    await waitFor(() =>
      expect(screen.getByText("Item 2 of 2")).toBeInTheDocument(),
    );
    const postCall = fetchMock.mock.calls[1];
    expect(postCall[0]).toBe(
      "https://backend.example.com/public/annotation-jobs/tok/annotations",
    );
    const body = JSON.parse(postCall[1].body);
    expect(body.item_id).toBe("item-1");
    expect(body.annotations).toEqual([
      { evaluator_id: "ev-1", value: { value: true } },
      { evaluator_id: "ev-2", value: { value: 3 } },
    ]);
  });

  it("includes reasoning in the submitted payload when provided", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(jobResponse({ items: [items[0]] })),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Correct" }));
    await user.click(screen.getByRole("button", { name: "3" }));
    const reasoningBoxes = screen.getAllByPlaceholderText(/reasoning/i);
    await user.type(reasoningBoxes[0], "Solid answer");

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ saved: [], count: 1, status: "completed" }),
    );
    await user.click(screen.getByRole("button", { name: "Mark as complete" }));

    await waitFor(() => expect(confettiMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    const ev1 = body.annotations.find(
      (a: { evaluator_id: string }) => a.evaluator_id === "ev-1",
    );
    expect(ev1.value.reasoning).toBe("Solid answer");
  });

  it("shows the completed badge and does not refire confetti on later renders", async () => {
    fetchMock.mockResolvedValue(jsonResponse(jobResponse({ job: { ...jobResponse().job, status: "completed" } })));
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("Completed")).toBeInTheDocument());
    // Job already loaded as completed (not a transition), so no confetti.
    expect(confettiMock).not.toHaveBeenCalled();
  });

  it("shows an already-completed error on a 400 save response", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(jobResponse({ items: [items[0]] })),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Correct" }));
    await user.click(screen.getByRole("button", { name: "3" }));

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 400));
    await user.click(screen.getByRole("button", { name: "Mark as complete" }));

    await waitFor(() =>
      expect(
        screen.getByText("This job has already been marked complete."),
      ).toBeInTheDocument(),
    );
  });

  it("shows a generic save-failed error on other non-ok statuses", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(jobResponse({ items: [items[0]] })),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Correct" }));
    await user.click(screen.getByRole("button", { name: "3" }));

    fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
    await user.click(screen.getByRole("button", { name: "Mark as complete" }));

    await waitFor(() =>
      expect(screen.getByText("Save failed (500)")).toBeInTheDocument(),
    );
  });

  it("shows 'Update' for an already-saved item and re-saves it", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        jobResponse({
          items: [items[0]],
          annotations: [
            {
              uuid: "a1",
              job_id: "job-1",
              item_id: "item-1",
              evaluator_id: "ev-1",
              value: { value: true },
              created_at: "",
              updated_at: "",
            },
            {
              uuid: "a2",
              job_id: "job-1",
              item_id: "item-1",
              evaluator_id: "ev-2",
              value: { value: 4 },
              created_at: "",
              updated_at: "",
            },
          ],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Update" })).toBeInTheDocument(),
    );

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ saved: [], count: 1, status: "pending" }),
    );
    await user.click(screen.getByRole("button", { name: "Update" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("only sends a changed item comment, not an unchanged one", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        jobResponse({
          items: [items[0]],
          annotations: [
            {
              uuid: "c1",
              job_id: "job-1",
              item_id: "item-1",
              evaluator_id: null,
              value: { comment: "existing note" },
              created_at: "",
              updated_at: "",
            },
          ],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());
    expect(screen.getByText("existing note")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Correct" }));
    await user.click(screen.getByRole("button", { name: "3" }));

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ saved: [], count: 1, status: "pending" }),
    );
    await user.click(screen.getByRole("button", { name: "Mark as complete" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(
      body.annotations.some((a: { evaluator_id: string | null }) => a.evaluator_id === null),
    ).toBe(false);
  });

  it("sends an item comment change alongside evaluator answers", async () => {
    const user = setupUser();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(jobResponse({ items: [items[0]] })),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("My Task")).toBeInTheDocument());

    await user.type(
      screen.getByPlaceholderText("Add any notes about this item"),
      "A note",
    );
    await user.click(screen.getByRole("button", { name: "Correct" }));
    await user.click(screen.getByRole("button", { name: "3" }));

    fetchMock.mockResolvedValueOnce(
      jsonResponse({ saved: [], count: 1, status: "pending" }),
    );
    await user.click(screen.getByRole("button", { name: "Mark as complete" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    const commentEntry = body.annotations.find(
      (a: { evaluator_id: string | null }) => a.evaluator_id === null,
    );
    expect(commentEntry.value.comment).toBe("A note");
  });

  it("renders read-only evaluator cards and item comment in admin mode", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        jobResponse({
          read_only: true,
          items: [items[0]],
          annotations: [
            {
              uuid: "a1",
              job_id: "job-1",
              item_id: "item-1",
              evaluator_id: "ev-1",
              value: { value: true, reasoning: "great" },
              created_at: "",
              updated_at: "",
            },
            {
              uuid: "c1",
              job_id: "job-1",
              item_id: "item-1",
              evaluator_id: null,
              value: { comment: "admin note" },
              created_at: "",
              updated_at: "",
            },
          ],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="admin" fillViewport={false} />);
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    // Read mode: no write buttons, no Submit button rendered.
    expect(screen.queryByRole("button", { name: "Correct" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit & Next" })).not.toBeInTheDocument();
    expect(screen.getByText("admin note")).toBeInTheDocument();
  });

  it("hides the comments block in read-only mode when there is no comment", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(jobResponse({ read_only: true, items: [items[0]] })),
    );
    render(<AnnotationJobView token="tok" mode="admin" fillViewport={false} />);
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    expect(screen.queryByText("Comments")).not.toBeInTheDocument();
  });

  it("shows a message when a task has no evaluators", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(jobResponse({ evaluators: [], items: [items[0]] })),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() =>
      expect(
        screen.getByText("No evaluators are attached to this task."),
      ).toBeInTheDocument(),
    );
  });

  it("shows an unsupported-evaluator-type message for unknown output types", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        jobResponse({
          evaluators: [
            {
              uuid: "ev-3",
              name: "Weird",
              description: null,
              evaluator_type: "custom",
              output_type: "text",
            },
          ],
          items: [items[0]],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() =>
      expect(screen.getByText("Unsupported evaluator type (text)")).toBeInTheDocument(),
    );
  });

  it("renders the STT pane side-by-side layout for stt tasks", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        jobResponse({
          task: { uuid: "task-1", name: "STT Task", type: "stt" },
          items: [
            {
              id: 1,
              uuid: "item-1",
              task_id: "task-1",
              payload: {
                reference_transcript: "hello world",
                predicted_transcript: "hello word",
              },
              created_at: "2024-01-01",
              deleted_at: null,
            },
          ],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("hello world")).toBeInTheDocument());
    expect(screen.getByText("hello word")).toBeInTheDocument();
  });

  it("falls back to a raw JSON payload dump for unknown task types", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        jobResponse({
          task: { uuid: "task-1", name: "TTS Task", type: "tts" },
          items: [
            {
              id: 1,
              uuid: "item-1",
              task_id: "task-1",
              payload: { foo: "bar" },
              created_at: "2024-01-01",
              deleted_at: null,
            },
          ],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("Item payload")).toBeInTheDocument());
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
  });

  it("shows the item description when the payload has one", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        jobResponse({
          items: [
            {
              ...items[0],
              payload: { ...items[0].payload, description: "Some context" },
            },
          ],
        }),
      ),
    );
    render(<AnnotationJobView token="tok" mode="public" />);
    await waitFor(() => expect(screen.getByText("Some context")).toBeInTheDocument());
  });
});
